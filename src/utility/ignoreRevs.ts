import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './gitRepository'

/**
 * Which commits blame should look past.
 *
 * A repository-wide reformatting rewrites every line without changing what
 * any of them mean. Left alone, blame credits the whole codebase to whoever
 * ran the formatter, on the day they ran it -- which is wrong about ownership
 * and, for anything that measures how old code is, catastrophic: the entire
 * history resets to one afternoon.
 *
 * `.git-blame-ignore-revs` is where a repository writes those commits down.
 * git does not read it unless told to, so LineLord tells it.
 */

/** The file git and the wider ecosystem have settled on. */
export const IGNORE_REVS_FILENAME = '.git-blame-ignore-revs'

export interface IgnoreRevs {
  /** Full commit hashes, sorted, with duplicates removed. */
  revisions: string[]
  /** Whether the repository's ignore-revs file supplied any of them. */
  usedFile: boolean
  /**
   * Entries that name no commit in this repository.
   *
   * Collected rather than passed on: git refuses the whole blame over one bad
   * entry, with `fatal: invalid object name`, and it does so once per file --
   * so a single typo turns into every file in the repository failing to be
   * read, with nothing on screen to connect the two.
   */
  unresolved: string[]
}

const EMPTY: IgnoreRevs = { revisions: [], usedFile: false, unresolved: [] }

/** Strip comments and blank lines, as git does when it reads the file. */
export function parseIgnoreRevsFile(contents: string): string[] {
  const entries: string[] = []
  for (const line of contents.split('\n')) {
    const withoutComment = line.split('#')[0] ?? ''
    const entry = withoutComment.trim()
    if (entry) entries.push(entry)
  }
  return entries
}

/**
 * Work out the commits to ignore, and which of the named ones do not exist.
 *
 * Everything is resolved to a full hash. That is what makes the answer stable:
 * the same commit written as a short hash, a full one or a tag is one entry,
 * and rewording a comment in the file changes nothing -- which matters because
 * this set is part of what decides whether a stored analysis may be reused.
 */
export async function resolveIgnoreRevs(
  repositoryRoot: string,
  extraRevisions: string[] = [],
): Promise<IgnoreRevs> {
  let fromFile: string[] = []
  let usedFile = false

  try {
    const contents = await readFile(
      join(repositoryRoot, IGNORE_REVS_FILENAME),
      'utf8',
    )
    fromFile = parseIgnoreRevsFile(contents)
    usedFile = fromFile.length > 0
  } catch {
    // No file, which is the usual case and not a problem.
  }

  const named = [...fromFile, ...extraRevisions]
  if (named.length === 0) return { ...EMPTY }

  const revisions = new Set<string>()
  const unresolved: string[] = []

  for (const entry of named) {
    const resolved = await resolveCommit(repositoryRoot, entry)
    if (resolved) revisions.add(resolved)
    else unresolved.push(entry)
  }

  return {
    revisions: [...revisions].sort(),
    usedFile,
    unresolved,
  }
}

async function resolveCommit(
  repositoryRoot: string,
  entry: string,
): Promise<string | null> {
  // `^{commit}` so that a tag resolves to what it points at, and so that a
  // name that exists but is not a commit is refused rather than passed on.
  const result = await runGit(
    [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${entry}^{commit}`,
    ],
    repositoryRoot,
  )
  if (!result.spawned || result.code !== 0) return null
  const sha = result.stdout.trim()
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(sha) ? sha : null
}

/** The arguments blame needs in order to look past these commits. */
export function ignoreRevArguments(revisions: string[]): string[] {
  return revisions.flatMap((revision) => ['--ignore-rev', revision])
}
