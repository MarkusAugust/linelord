import type { BlameEntry } from '../../ports/git'

/**
 * Reading what `git blame --porcelain` says.
 *
 * Kept apart from the database and from the analysis so that it can be tested
 * on a string: this is the one place where a misreading turns into wrong
 * ownership for every line of the repository, and the previous version -- a
 * pair of `startsWith` checks and a regular expression that assumed a 40-digit
 * hash -- had no way to be checked at all.
 */

export type { BlameEntry }

interface CommitHeader {
  author: string
  authorEmail: string
  authorTime: number | null
}

/**
 * A porcelain header: `<sha> <original line> <final line> [<lines in group>]`.
 *
 * Anchored at both ends and matching the whole shape, rather than testing
 * whether a line begins with forty hex digits. That older test passed on a
 * repository written with `--object-format=sha256` only because it was a
 * prefix match on a 64-digit hash -- true by accident rather than by
 * intention, and it left the reading unable to tell a header from anything
 * else that started the same way.
 */
const HEADER = /^([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: (\d+))?$/

/**
 * Turn the output of `git blame --porcelain` into one entry per line.
 *
 * Both porcelain forms are accepted. `--line-porcelain` repeats the commit
 * header for every line; plain `--porcelain` writes it once and then gives
 * only the hash for the rest of the group, so the details are remembered per
 * commit as they go past.
 *
 * Line numbers come from the header rather than from counting, which is the
 * whole point: counting cannot know about lines that were skipped, and a line
 * number that does not match the file is worse than none at all -- it points
 * confidently at the wrong line.
 */
export function parseBlamePorcelain(stdout: string): BlameEntry[] {
  const entries: BlameEntry[] = []
  const commits = new Map<string, CommitHeader>()

  let sha = ''
  let lineNumber = 0
  let originalLineNumber = 0
  let pending: Partial<CommitHeader> = {}

  // Not `trim().split()`: leading blank output is not a thing git produces,
  // and trimming the end would drop a final line that is itself empty.
  for (const line of stdout.split('\n')) {
    const header = HEADER.exec(line)
    if (header?.[1]) {
      sha = header[1]
      originalLineNumber = Number(header[2])
      lineNumber = Number(header[3])
      pending = {}
      continue
    }

    if (line.startsWith('author ')) {
      pending.author = line.slice('author '.length)
      continue
    }

    if (line.startsWith('author-mail ')) {
      pending.authorEmail = line
        .slice('author-mail '.length)
        .trim()
        .replace(/^<|>$/g, '')
      continue
    }

    if (line.startsWith('author-time ')) {
      const seconds = Number.parseInt(line.slice('author-time '.length), 10)
      if (Number.isFinite(seconds)) pending.authorTime = seconds
      continue
    }

    if (!line.startsWith('\t')) {
      // summary, boundary, previous, filename, the committer fields: all real
      // parts of the format, none of them anything this needs.
      continue
    }

    // A tab begins the line's own content, and ends the header with it.
    if (!sha) continue

    const known = commits.get(sha)
    const commit: CommitHeader = {
      author: pending.author ?? known?.author ?? '',
      authorEmail: pending.authorEmail ?? known?.authorEmail ?? '',
      authorTime: pending.authorTime ?? known?.authorTime ?? null,
    }
    commits.set(sha, commit)

    entries.push({
      sha,
      lineNumber,
      originalLineNumber,
      author: commit.author,
      authorEmail: commit.authorEmail,
      authorTime: commit.authorTime,
      content: line.slice(1),
    })
  }

  return entries
}
