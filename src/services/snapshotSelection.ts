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
 * "Last" means latest by time within the interval, which is what makes a
 * snapshot describe the repository as it stood at the end of that month
 * rather than somewhere in the middle of it.
 *
 * When there are more intervals than the ceiling allows, the *newest* are
 * kept. A survival curve drawn from the recent past with a coarse tail is
 * more useful than one that stops years ago, and the half-life of code
 * nobody has touched since is not the question being asked.
 */
export function selectSnapshots(
  commits: HistoryCommit[],
  interval: SnapshotInterval = 'month',
  max: number = DEFAULT_MAX_SNAPSHOTS,
): Snapshot[] {
  if (max <= 0) return []

  const lastOfInterval = new Map<string, Snapshot>()
  for (const commit of commits) {
    const key = intervalKey(commit.timestamp, interval)
    const standing = lastOfInterval.get(key)
    if (!standing || commit.timestamp > standing.timestamp) {
      lastOfInterval.set(key, { sha: commit.sha, timestamp: commit.timestamp })
    }
  }

  const chosen = [...lastOfInterval.values()].sort(
    (a, b) => a.timestamp - b.timestamp,
  )

  return chosen.length > max ? chosen.slice(chosen.length - max) : chosen
}
