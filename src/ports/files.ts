/**
 * The little of the file system LineLord touches directly.
 *
 * Two files in the repository, both read by git as well: `.mailmap`, which
 * the cache fingerprint hashes and `--write-mailmap` appends to, and
 * `.git-blame-ignore-revs`, whose entries are resolved before blame runs.
 * The port is small because the surface is: everything else on disk is
 * git's or the cache's, and those have ports of their own.
 */
export interface FileSystemPort {
  /**
   * The file's text, or null when it is not there.
   *
   * Only "not there" is null. A file that exists but cannot be read --
   * permissions, a failing disk -- throws, because treating it as absent
   * would let an analysis run without something the repository asked for.
   */
  readText(path: string): Promise<string | null>
  /** Add to the end of a file, creating it if it is not there. */
  appendText(path: string, text: string): Promise<void>
}
