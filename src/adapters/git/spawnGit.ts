import { spawn } from 'node:child_process'
import {
  BLAME_OPTIONS,
  type GitFactory,
  type GitPort,
  type HistoryCommit,
  type RepositoryLookup,
  type TreeEntry,
} from '../../ports/git'
import { parseBlamePorcelain } from './blamePorcelain'

/**
 * The git port over the git binary.
 *
 * Every command is spawned rather than run through a shell, and its output
 * streamed rather than buffered: `ls-tree` on a large repository can exceed
 * exec's buffer, and a shell would mangle awkward paths on the way back
 * regardless. `-z` wherever git offers it, so paths containing spaces,
 * non-ASCII characters or newlines arrive intact.
 */

interface GitResult {
  /** Whether git ran at all. A missing binary and a missing cwd both fail here. */
  spawned: boolean
  code: number | null
  stdout: string
  stderr: string
}

/** Run git and report whether it ran, separately from how it exited. */
export function runGit(args: string[], cwd?: string): Promise<GitResult> {
  return new Promise((settle) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    let stderr = ''
    let settled = false
    const finish = (result: GitResult) => {
      // `error` and `close` can both fire. Once the two outcomes mean
      // different things to the caller, whichever arrives first has to win
      // rather than being quietly overwritten by the other.
      if (settled) return
      settled = true
      settle(result)
    }

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', () =>
      finish({ spawned: false, code: null, stdout: '', stderr }),
    )
    child.once('close', (code) =>
      finish({
        spawned: true,
        code,
        stdout: Buffer.concat(chunks).toString(),
        stderr,
      }),
    )
  })
}

/**
 * Run git and return its stdout, or throw.
 *
 * `successCodes` exists because not every non-zero exit is a failure: git
 * grep reports "nothing matched" as exit 1, which for that caller is an
 * answer rather than an error.
 */
async function gitOutput(
  args: string[],
  cwd: string,
  successCodes: number[] = [0],
): Promise<string> {
  const result = await runGit(args, cwd)
  if (
    result.spawned &&
    result.code !== null &&
    successCodes.includes(result.code)
  ) {
    return result.stdout
  }
  throw new Error(
    `git ${args.join(' ')} failed with code ${result.code}: ${result.stderr.trim()}`,
  )
}

/** `<mode> <type> <sha> <size>\t<path>` records, NUL-separated. */
export function parseLsTree(stdout: string): TreeEntry[] {
  const entries: TreeEntry[] = []
  for (const record of stdout.split('\0')) {
    if (!record) continue
    // The path may contain anything at all, so split on the first tab
    // rather than on whitespace.
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const [, type, , rawSize] = record.slice(0, tab).split(/\s+/)
    // Submodules appear as commit entries with no size; they hold no lines.
    if (type !== 'blob') continue
    const size = Number.parseInt(rawSize ?? '', 10)
    entries.push({
      path: record.slice(tab + 1),
      size: Number.isFinite(size) ? size : 0,
    })
  }
  return entries
}

/** `<revision>:<path>` records from `git grep <revision>`, NUL-separated. */
export function parseTextPaths(stdout: string, revision: string): Set<string> {
  const prefix = `${revision}:`
  const paths = new Set<string>()
  for (const record of stdout.split('\0')) {
    if (!record) continue
    if (record.startsWith(prefix)) {
      paths.add(record.slice(prefix.length))
      continue
    }
    const colon = record.indexOf(':')
    paths.add(colon === -1 ? record : record.slice(colon + 1))
  }
  return paths
}

/** `<sha> <committer seconds>` lines from `git log --format=%H %ct`. */
export function parseFirstParentLog(stdout: string): HistoryCommit[] {
  const commits: HistoryCommit[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const [sha, seconds] = line.split(' ')
    const timestamp = Number.parseInt(seconds ?? '', 10)
    if (sha && Number.isFinite(timestamp)) commits.push({ sha, timestamp })
  }
  return commits
}

const FULL_HASH = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/

/** The git port for one repository, run from its root. */
export function createGit(cwd: string): GitPort {
  return {
    async resolveHead() {
      const result = await runGit(['rev-parse', 'HEAD'], cwd)
      if (!result.spawned || result.code !== 0) return null
      return result.stdout.trim() || null
    },

    async resolveCommit(name) {
      // `^{commit}` so that a tag resolves to what it points at, and so that
      // a name that exists but is not a commit is refused rather than passed
      // on.
      const result = await runGit(
        [
          'rev-parse',
          '--verify',
          '--quiet',
          '--end-of-options',
          `${name}^{commit}`,
        ],
        cwd,
      )
      if (!result.spawned || result.code !== 0) return null
      const sha = result.stdout.trim()
      return FULL_HASH.test(sha) ? sha : null
    },

    async countUncommittedFiles() {
      const result = await runGit(
        ['status', '--porcelain', '-z', '--untracked-files=no'],
        cwd,
      )
      if (!result.spawned || result.code !== 0) return 0
      return result.stdout.split('\0').filter(Boolean).length
    },

    async listTree(revision) {
      // `git ls-files` lists the index, which is a different set of files:
      // a file staged for deletion leaves the index while remaining part of
      // the revision, and a newly staged file has no content in it to
      // blame. Enumerating the tree directly settles both. -l carries the
      // blob size, which is the content being analysed rather than whatever
      // the working copy holds.
      return parseLsTree(
        await gitOutput(['ls-tree', '-r', '-l', '-z', revision], cwd),
      )
    },

    async listTextPaths(revision) {
      // -I drops what git calls binary, -e '' matches every line of what
      // remains. Exit 1 means nothing matched: a tree holding only binary
      // blobs, or only empty files, is an ordinary tree with no text in it.
      return parseTextPaths(
        await gitOutput(
          [
            'grep',
            '-I',
            '-z',
            '--name-only',
            '--full-name',
            '-e',
            '',
            revision,
          ],
          cwd,
          [0, 1],
        ),
        revision,
      )
    },

    async blame(revision, path, ignoredRevisions) {
      // A commit, not the working copy: blaming the working copy attributes
      // unsaved edits to the pseudo-author "Not Committed Yet". `--` keeps a
      // path that starts with a dash from being read as an option.
      return parseBlamePorcelain(
        await gitOutput(
          [
            'blame',
            ...BLAME_OPTIONS,
            ...ignoredRevisions.flatMap((one) => ['--ignore-rev', one]),
            revision,
            '--',
            path,
          ],
          cwd,
        ),
      )
    },

    async isAncestor(ancestor, descendant) {
      const result = await runGit(
        ['merge-base', '--is-ancestor', ancestor, descendant],
        cwd,
      )
      if (!result.spawned) return null
      // Exit 0 means yes and 1 means no. Anything else -- an unknown
      // revision, most likely -- is not an answer at all, and null says so
      // rather than letting "no" stand in for "cannot tell".
      if (result.code === 0) return true
      if (result.code === 1) return false
      return null
    },

    async pathsTouchedBetween(from, to) {
      // --diff-merges=first-parent so that a file changed only while
      // resolving a merge conflict is still reported. The union with the
      // diff catches paths that left the tree entirely, which the log of
      // touched files reports under their old name.
      const [log, diff] = await Promise.all([
        runGit(
          [
            'log',
            '--format=',
            '--name-only',
            '--diff-merges=first-parent',
            '-z',
            `${from}..${to}`,
          ],
          cwd,
        ),
        runGit(['diff', '--name-only', '-z', from, to], cwd),
      ])

      if (!log.spawned || log.code !== 0 || !diff.spawned || diff.code !== 0) {
        throw new Error(
          `Could not list the paths touched between ${from} and ${to}`,
        )
      }

      const paths = new Set<string>()
      for (const output of [log.stdout, diff.stdout]) {
        for (const path of output.split('\0')) {
          if (path) paths.add(path)
        }
      }
      return [...paths]
    },

    async firstParentHistory() {
      const result = await runGit(
        ['log', '--first-parent', '--format=%H %ct', 'HEAD'],
        cwd,
      )
      if (result.spawned && result.code === 0) {
        return parseFirstParentLog(result.stdout)
      }
      // A repository with no commits has no history, which is not an error.
      // git says so in two different ways depending on how HEAD fails to
      // resolve, and neither is a reason to fail an analysis.
      if (/unknown revision|does not have any commits/.test(result.stderr)) {
        return []
      }
      throw new Error(result.stderr.trim() || `git exited with ${result.code}`)
    },
  }
}

/**
 * The root of the git repository containing `startPath`.
 *
 * Resolving to the root rather than taking the given path at face value
 * fixes two things at once. A directory that is not a repository used to run
 * a full analysis that found nothing -- zero files, zero lines, zero authors,
 * presented as though that were the answer. And a subdirectory produced a
 * partial analysis labelled as the repository's: `git ls-tree` honours the
 * current directory's prefix, so running inside `src/` listed only what was
 * under `src/` while the screen still said "Repository:" and reported totals.
 *
 * A failure to spawn is not assumed to mean git is missing -- a cwd that does
 * not exist fails the same way -- so that case is confirmed by asking git for
 * its version before blaming the installation for the user's path, or the
 * user's path for the installation.
 */
export async function findRepositoryRoot(
  startPath: string,
): Promise<RepositoryLookup> {
  const revParse = await runGit(['rev-parse', '--show-toplevel'], startPath)

  if (revParse.spawned && revParse.code === 0 && revParse.stdout.trim()) {
    return { found: true, root: revParse.stdout.trim() }
  }

  if (!revParse.spawned) {
    const version = await runGit(['--version'])
    if (!version.spawned) {
      return { found: false, reason: 'git-unavailable' }
    }
  }

  return { found: false, reason: 'not-a-repository' }
}

/** The factory over the git binary. */
export function createGitFactory(): GitFactory {
  return { locate: findRepositoryRoot, at: createGit }
}
