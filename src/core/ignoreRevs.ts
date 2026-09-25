import type { FileSystemPort } from '../ports/files'
import type { GitPort } from '../ports/git'

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

/** Where a commit was named: the repository's file, or the command line. */
export type IgnoreRevSource = 'file' | 'flag'

/** An entry that names no commit here, and where it was named. */
export interface UnresolvedIgnoreRev {
  entry: string
  source: IgnoreRevSource
}

export interface IgnoreRevs {
  /** Full commit hashes, sorted, with duplicates removed. */
  revisions: string[]
  /**
   * Which sources named any of them. Both at once is ordinary, and the
   * interface has to be able to say so: a run that used the flag alongside
   * the file would otherwise report the lot as coming from the file, and a
   * run with only the flag would blame a file that need not even exist.
   */
  sources: { file: boolean; flag: boolean }
  /**
   * Entries that name no commit in this repository.
   *
   * Collected rather than passed on: git refuses the whole blame over one bad
   * entry, with `fatal: invalid object name`, and it does so once per file --
   * so a single typo turns into every file in the repository failing to be
   * read, with nothing on screen to connect the two.
   */
  unresolved: UnresolvedIgnoreRev[]
}

const EMPTY: IgnoreRevs = {
  revisions: [],
  sources: { file: false, flag: false },
  unresolved: [],
}

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
  extraRevisions: string[],
  git: GitPort,
  files: FileSystemPort,
): Promise<IgnoreRevs> {
  let fromFile: string[] = []

  try {
    // "Not there" is the usual case and means the repository is asking for
    // nothing. Anything else -- a file that exists but cannot be read -- is
    // not the same: carrying on would analyse without the ignore set the
    // repository did ask for, which is wrong ownership on every screen, and
    // the cache would store it as though it were right.
    const contents = await files.readText(
      `${repositoryRoot}/${IGNORE_REVS_FILENAME}`,
    )
    if (contents !== null) fromFile = parseIgnoreRevsFile(contents)
  } catch (error) {
    // Said plainly, and naming the file. Stopping is the right answer here,
    // but `EISDIR: illegal operation on a directory` on its own tells
    // nobody what LineLord was doing or what to fix.
    throw new Error(
      `${IGNORE_REVS_FILENAME} exists but could not be read, so the commits ` +
        'it names cannot be looked past. Analysing without them would ' +
        'credit a reformatting to whoever ran it. Fix the file, or move it ' +
        `aside to analyse without it. (${
          error instanceof Error ? error.message : String(error)
        })`,
    )
  }

  const named: UnresolvedIgnoreRev[] = [
    ...fromFile.map((entry) => ({ entry, source: 'file' as const })),
    ...extraRevisions.map((entry) => ({ entry, source: 'flag' as const })),
  ]
  if (named.length === 0) return { ...EMPTY, sources: { ...EMPTY.sources } }

  const revisions = new Set<string>()
  const unresolved: UnresolvedIgnoreRev[] = []
  const sources = { file: false, flag: false }

  for (const { entry, source } of named) {
    const resolved = await git.resolveCommit(entry)
    if (resolved) {
      revisions.add(resolved)
      sources[source] = true
    } else {
      unresolved.push({ entry, source })
    }
  }

  return {
    revisions: [...revisions].sort(),
    sources,
    unresolved,
  }
}

/** The arguments blame needs in order to look past these commits. */
export function ignoreRevArguments(revisions: string[]): string[] {
  return revisions.flatMap((revision) => ['--ignore-rev', revision])
}
