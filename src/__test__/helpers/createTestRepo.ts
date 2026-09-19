import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Builds throwaway git repositories with fully controlled history, so tests of
 * file discovery, blame parsing, author identity and code age are deterministic
 * rather than dependent on whoever runs them and when.
 *
 * Every git invocation passes its arguments as an argv array rather than a
 * shell string, which is what allows paths containing spaces, non-ASCII
 * characters, dollar signs and even newlines to round-trip intact.
 */

export interface TestAuthor {
  name: string
  email: string
}

export interface TestCommitSpec {
  message: string
  /** Defaults to the repository's default author. */
  author?: TestAuthor
  /**
   * Author and committer date. Both are set to the same value so that
   * `--since`, blame timestamps and rebased history all agree.
   * Defaults to the repository clock, which makes the commit non-deterministic —
   * pass a date whenever the test asserts on age or ordering.
   */
  date?: Date | string | number
  /** Paths to create or overwrite, relative to the repository root. */
  write?: Record<string, string | Uint8Array>
  /** Paths to delete, relative to the repository root. */
  remove?: string[]
  /** Create the commit even when the tree is unchanged. */
  allowEmpty?: boolean
}

export interface TestRepo {
  /** Absolute path to the repository working tree. */
  readonly path: string
  /** Run git with the given argv, returning stdout. Throws on a non-zero exit. */
  git(args: string[], extraEnv?: Record<string, string>): Promise<string>
  /** Apply the spec and commit it. Returns the new commit SHA. */
  commit(spec: TestCommitSpec): Promise<string>
  /** Write files into the working tree without committing them. */
  writeFiles(files: Record<string, string | Uint8Array>): Promise<void>
  /** Current HEAD SHA. */
  head(): Promise<string>
  /** Remove the temporary directory. */
  cleanup(): Promise<void>
}

export interface CreateTestRepoOptions {
  /** Author used by commits that do not name one. */
  defaultAuthor?: TestAuthor
  /** Branch the repository starts on. Defaults to `main`. */
  initialBranch?: string
}

const DEFAULT_AUTHOR: TestAuthor = {
  name: 'Gorvek the Ironbane',
  email: 'gorvek@ashendale.realm',
}

/**
 * Git reads three config layers. Tests must see none of the developer's own,
 * or a global `commit.gpgsign`, `init.defaultBranch` or `core.autocrlf` would
 * change the fixtures under them. `/dev/null` is a valid empty config file.
 */
const ISOLATED_GIT_ENV: Record<string, string> = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  TZ: 'UTC',
}

/**
 * Git's own timestamp format: seconds since the epoch plus an explicit UTC
 * offset. Chosen over ISO 8601 because it cannot be reinterpreted by the local
 * timezone and carries no fractional seconds for git to reject.
 */
export function toGitDate(date: Date | string | number): string {
  const parsed = date instanceof Date ? date : new Date(date)
  const ms = parsed.getTime()
  if (Number.isNaN(ms)) {
    throw new TypeError(`Ugyldig commit-dato: ${String(date)}`)
  }
  return `${Math.floor(ms / 1000)} +0000`
}

function runGit(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, ...ISOLATED_GIT_ENV, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(
        new Error(
          `git ${args.join(' ')} avsluttet med kode ${code}\n${stderr.trim()}`,
        ),
      )
    })
  })
}

async function writeInto(
  root: string,
  files: Record<string, string | Uint8Array>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content)
  }
}

export async function createTestRepo(
  options: CreateTestRepoOptions = {},
): Promise<TestRepo> {
  const { defaultAuthor = DEFAULT_AUTHOR, initialBranch = 'main' } = options

  const root = await mkdtemp(join(tmpdir(), 'linelord-test-'))
  const git = (args: string[], extraEnv?: Record<string, string>) =>
    runGit(root, args, extraEnv)

  await git(['init', '--initial-branch', initialBranch])
  await git(['config', 'user.name', defaultAuthor.name])
  await git(['config', 'user.email', defaultAuthor.email])
  // A developer with commit signing on globally would otherwise be prompted.
  await git(['config', 'commit.gpgsign', 'false'])
  // Keeps file contents byte-identical on Windows runners.
  await git(['config', 'core.autocrlf', 'false'])

  return {
    path: root,
    git,

    async writeFiles(files) {
      await writeInto(root, files)
    },

    async commit(spec) {
      const author = spec.author ?? defaultAuthor

      if (spec.write) {
        await writeInto(root, spec.write)
      }
      for (const relativePath of spec.remove ?? []) {
        await rm(join(root, relativePath), { force: true, recursive: true })
      }

      // -A stages creations, modifications and deletions in one pass, and the
      // pathspec is omitted so paths with newlines never reach a parser.
      await git(['add', '-A'])

      const commitArgs = [
        'commit',
        '--message',
        spec.message,
        '--author',
        `${author.name} <${author.email}>`,
      ]
      if (spec.allowEmpty) {
        commitArgs.push('--allow-empty')
      }

      const dateEnv =
        spec.date === undefined
          ? {}
          : (() => {
              const gitDate = toGitDate(spec.date)
              return {
                GIT_AUTHOR_DATE: gitDate,
                GIT_COMMITTER_DATE: gitDate,
              }
            })()

      await git(commitArgs, {
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        ...dateEnv,
      })

      return (await git(['rev-parse', 'HEAD'])).trim()
    },

    async head() {
      return (await git(['rev-parse', 'HEAD'])).trim()
    },

    async cleanup() {
      await rm(root, { force: true, recursive: true })
    },
  }
}
