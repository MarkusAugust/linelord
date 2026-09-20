/**
 * Choosing which revisions to look back at.
 *
 * Tier 2 asks how long code survived, which cannot be answered from HEAD
 * alone: it needs the repository as it stood at points in the past. Blaming
 * every commit is out of the question, so the history is sampled -- the last
 * commit of each month, quarter or week -- and the survival curve is drawn
 * through those points.
 *
 * Kept apart from the blaming so that the sampling can be tested on a list of
 * commits rather than on a repository.
 */

export type SnapshotInterval = 'week' | 'month' | 'quarter'

/** One commit on the first-parent history, with its committer time. */
export interface HistoryCommit {
  sha: string
  /** Committer time, in whole seconds. */
  timestamp: number
}

export interface Snapshot {
  sha: string
  timestamp: number
}

/** The default ceiling, so a long history cannot turn into an overnight run. */
export const DEFAULT_MAX_SNAPSHOTS = 60

/**
 * The bucket a moment falls in, as a sortable string.
 *
 * UTC throughout: the alternative is that the same repository samples
 * different commits depending on where it is analysed, which would make two
 * people's survival curves disagree for no reason anyone could find.
 */
export function intervalKey(
  timestamp: number,
  interval: SnapshotInterval,
): string {
  const when = new Date(timestamp * 1000)
  const year = when.getUTCFullYear()

  if (interval === 'week') {
    // Days since the epoch, floored to the containing week. Simpler than ISO
    // week numbering and identical in what it groups.
    const week = Math.floor(timestamp / (7 * 24 * 60 * 60))
    return `w${week}`
  }

  if (interval === 'quarter') {
    return `${year}-Q${Math.floor(when.getUTCMonth() / 3) + 1}`
  }

  return `${year}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Pick the last commit of each interval, oldest first, at most `max` of them.
 *
 * `commits` must arrive newest first, as `git log --first-parent` gives them.
 * That order is ancestry, and ancestry is what everything here is decided by
 * -- never the timestamps, which are used only to say which interval a commit
 * belongs to.
 *
 * The distinction is not pedantry. git permits a commit to carry an earlier
 * time than its own parent: clock skew across machines, or a rebase. Ordering
 * snapshots by time can then place a descendant before its ancestor, and the
 * walk between two such revisions asks git for the commits in a range that is
 * not a range. What it carries across is wrong, and nothing says so.
 *
 * So "last of the month" means last in the history rather than latest on the
 * clock, and the snapshots come back in the order the history reaches them.
 *
 * When there are more intervals than the ceiling allows, the *newest* are
 * kept. A survival curve drawn through the recent past with a coarse tail is
 * more useful than one that stops years ago, and the half-life of code nobody
 * has touched since is not the question being asked.
 */
export function selectSnapshots(
  commits: HistoryCommit[],
  interval: SnapshotInterval = 'month',
  max: number = DEFAULT_MAX_SNAPSHOTS,
): Snapshot[] {
  if (max <= 0) return []

  // Position in the list, where 0 is HEAD. Lower is later in the history.
  const lastOfInterval = new Map<string, { snapshot: Snapshot; rank: number }>()
  for (const [rank, commit] of commits.entries()) {
    const key = intervalKey(commit.timestamp, interval)
    const standing = lastOfInterval.get(key)
    if (!standing || rank < standing.rank) {
      lastOfInterval.set(key, {
        snapshot: { sha: commit.sha, timestamp: commit.timestamp },
        rank,
      })
    }
  }

  const chosen = [...lastOfInterval.values()]
    .sort((a, b) => b.rank - a.rank)
    .map((one) => one.snapshot)

  return chosen.length > max ? chosen.slice(chosen.length - max) : chosen
}
