/**
 * Everything LineLord asks of git, as one interface.
 *
 * The core never runs a process. It asks this port for a tree, a blame or a
 * piece of history, and the adapter behind it spawns git -- or, in a test,
 * answers from a fixture. Each method is one question with one answer, and
 * the shapes are LineLord's rather than git's: a tree is a list of paths
 * with sizes, a blame is a list of entries, never a string to be parsed
 * again downstream.
 */

/** One blob in a tree: the path it is stored under, and its size there. */
export interface TreeEntry {
  path: string
  size: number
}

/** One line of a file, and the commit that last touched it. */
export interface BlameEntry {
  /** The commit the line is attributed to. */
  sha: string
  /** Line number in the revision that was blamed, counting from 1. */
  lineNumber: number
  /** Line number in the commit the line came from. */
  originalLineNumber: number
  author: string
  /** Angle brackets stripped, as git writes them. */
  authorEmail: string
  /**
   * Author time, in whole seconds since the epoch, or null if git did not
   * report one. Null rather than zero: zero is a real instant, and a commit
   * dated to it would otherwise be indistinguishable from a missing field.
   */
  authorTime: number | null
  /** The line itself, without the tab git puts in front of it. */
  content: string
}

/** One commit on the first-parent history, with its committer time. */
export interface HistoryCommit {
  sha: string
  /** Committer time, in whole seconds. */
  timestamp: number
}

export type RepositoryLookup =
  | { found: true; root: string }
  /** There is a working git, but nothing here belongs to a repository. */
  | { found: false; reason: 'not-a-repository' }
  /** git could not be run at all, so nothing can be said about the path. */
  | { found: false; reason: 'git-unavailable' }

/**
 * The options every blame invocation uses, apart from the revision, the
 * commits to look past and the path.
 *
 * Part of the port rather than of one adapter, because the cache fingerprint
 * hashes what is actually run: adding `-M` or `-C` here changes who owns
 * which line, and a cache built before the change must not survive it --
 * which happens on its own as long as this stays the single source.
 *
 * `--porcelain` rather than `--line-porcelain`: the compact form writes the
 * commit header once per commit instead of once per line, which is about
 * three quarters less output to read and parse. The two are the same answer,
 * and there is a test over real git output that says so.
 */
export const BLAME_OPTIONS = ['-w', '--porcelain'] as const

/** git, as seen from inside one repository. */
export interface GitPort {
  /** The commit HEAD points at, or null in a repository with no commits. */
  resolveHead(): Promise<string | null>
  /**
   * The full hash a name resolves to, or null when it names no commit here.
   * A tag resolves to what it points at; a name that exists but is not a
   * commit is refused.
   */
  resolveCommit(name: string): Promise<string | null>
  /**
   * Tracked files whose working-copy content differs from HEAD. Advisory:
   * zero when git cannot say, because failing to read it must not fail an
   * analysis.
   */
  countUncommittedFiles(): Promise<number>
  /** Every blob in the tree of a revision, with the size it has there. */
  listTree(revision: string): Promise<TreeEntry[]>
  /**
   * The paths git itself considers text at a revision, by the same rule it
   * uses when deciding whether to print a diff, honouring `.gitattributes`.
   * An empty file has no line to match and is absent without being binary.
   */
  listTextPaths(revision: string): Promise<Set<string>>
  /** One file at one revision, looking past the given commits. */
  blame(
    revision: string,
    path: string,
    ignoredRevisions: string[],
  ): Promise<BlameEntry[]>
  /**
   * Whether `ancestor` is reachable from `descendant`. Null when git could
   * not answer -- an unknown revision, most likely -- which is not a no.
   */
  isAncestor(ancestor: string, descendant: string): Promise<boolean | null>
  /**
   * Every path touched by any commit in `from..to`, plus every path that
   * differs between the two. Not a diff of the endpoints alone: a change
   * made and undone within the interval leaves them identical while moving
   * every line it touched to a different commit.
   */
  pathsTouchedBetween(from: string, to: string): Promise<string[]>
  /** The first-parent history from HEAD, newest first. Empty with no commits. */
  firstParentHistory(): Promise<HistoryCommit[]>
}

/**
 * git, before a repository is known.
 *
 * `locate` finds the root a path belongs to; `at` gives the port for one
 * repository. Kept together so that a composition root hands over one thing.
 */
export interface GitFactory {
  locate(startPath: string): Promise<RepositoryLookup>
  at(cwd: string): GitPort
}
