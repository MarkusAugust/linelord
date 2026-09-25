import type { GitPort } from '../ports/git'
import type { AnalysisStore, NewCohortLine } from '../ports/storage'
import {
  analysablePathsAtRevision,
  countBlame,
  type PathCounts,
  readCountKey,
} from './cohorts'
import { normaliseConcurrency } from './concurrency'
import {
  DEFAULT_MAX_SNAPSHOTS,
  type Snapshot,
  type SnapshotInterval,
  selectSnapshots,
} from './snapshots'

/**
 * How long code actually lived, rather than how old what survives is.
 *
 * The analysis of HEAD asks, for the lines still standing, how old they
 * are. That is cheap and it is not the same question. This one is about the
 * lines that are *gone* -- how long did a month's work last before it was
 * rewritten -- and answering it means looking at the repository as it stood
 * at points in the past.
 *
 * The cost is the whole design. Blaming every file at sixty revisions is
 * O(repository x snapshots) and takes hours on anything substantial. Between
 * two snapshots, almost nothing changes: only the paths some commit in that
 * interval touched can have moved, so only those are blamed again and the
 * rest are carried across. That makes it O(churn), which is the difference
 * between minutes and an afternoon.
 */

/** Which revision the stored cohort history describes. */
export const HISTORY_HEAD_KEY = 'history_head_sha'
/** How many snapshots that history holds. */
export const HISTORY_SNAPSHOTS_KEY = 'history_snapshots'

export interface HistoryOptions {
  /**
   * The size above which a file is left out, as the analysis of HEAD uses it.
   *
   * Required rather than defaulted. A default is a number that looks right
   * and silently disagrees with `--threshold`, and the history would then be
   * measured under different rules than the present it is drawn beside --
   * which is the one thing this module promises not to do.
   */
  thresholdBytes: number
  interval?: SnapshotInterval
  maxSnapshots?: number
  /**
   * Commits for blame to look past, as the analysis of HEAD resolved them.
   * A reformatting ignored in the present and counted in the history would
   * put the whole codebase in one cohort.
   */
  ignoredRevisions?: string[]
  /**
   * Carry untouched files between snapshots instead of blaming them again.
   *
   * On by default; it is the optimisation the whole walk exists around. It
   * can be turned off so that the optimisation can be checked against the
   * thing it optimises, which is the only way to know it does not lie.
   */
  reuseBetweenSnapshots?: boolean
  /** Files blamed at once. */
  concurrency?: number
}

export interface HistoryFailure {
  revision: string
  path: string
  error: string
}

export interface HistoryRun {
  snapshots: number
  /** Files blamed across every snapshot, and files carried across instead. */
  filesBlamed: number
  filesCarried: number
  /**
   * Files that could not be read, with the revision they were read at.
   *
   * A file that fails contributes no lines, which silently understates the
   * snapshot it belongs to. Collected rather than printed, as everywhere
   * else: Ink owns the terminal by the time this runs.
   */
  failures: HistoryFailure[]
}

export type ProgressReport = (
  current: number,
  total: number,
  message: string,
) => void

export interface HistoryPorts {
  git: GitPort
  store: AnalysisStore
}

/** The revisions a walk would sample, without sampling them. */
export async function plannedSnapshots(
  git: GitPort,
  interval: SnapshotInterval = 'month',
  maxSnapshots: number = DEFAULT_MAX_SNAPSHOTS,
): Promise<Snapshot[]> {
  return selectSnapshots(await git.firstParentHistory(), interval, maxSnapshots)
}

interface Counted {
  counts: Map<string, PathCounts>
  blamed: number
  carried: number
}

/**
 * Walk the sampled revisions and record what was alive at each.
 *
 * Each snapshot is written on its own, so a walk stopped halfway leaves
 * whole snapshots behind rather than half of one. Minutes is a realistic
 * running time here, and a person who gives up on it should not also lose
 * their cache.
 */
export async function walkHistory(
  ports: HistoryPorts,
  options: HistoryOptions,
  onProgress?: ProgressReport,
): Promise<HistoryRun> {
  const planned = await plannedSnapshots(
    ports.git,
    options.interval ?? 'month',
    options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS,
  )
  const run: HistoryRun = {
    snapshots: 0,
    filesBlamed: 0,
    filesCarried: 0,
    failures: [],
  }
  if (planned.length === 0) return run

  // Drop any earlier history, and the claim about which revision it was.
  // Dropping the rows without dropping the claim would leave the store
  // saying it holds a history of revision X while holding none -- for the
  // whole of a run that may take minutes, and permanently if that run is
  // interrupted. The claim is written again at the end.
  await ports.store.clearHistory()
  await ports.store.deleteMeta([HISTORY_HEAD_KEY, HISTORY_SNAPSHOTS_KEY])

  const settings = {
    thresholdBytes: options.thresholdBytes,
    ignoredRevisions: options.ignoredRevisions ?? [],
    reuse: options.reuseBetweenSnapshots ?? true,
    // The same settling the analysis does, and for the same reason: a NaN
    // makes the batching loop slice an empty batch and then end, so nothing
    // is blamed and the run reports success with no lines at all.
    concurrency: normaliseConcurrency(options.concurrency),
  }
  /** The name each address wrote under, for people the present has forgotten. */
  const namesByEmail = new Map<string, string>()

  let carriedForward: Map<string, PathCounts> | null = null
  let previousSha: string | null = null

  for (const [index, snapshot] of planned.entries()) {
    onProgress?.(
      index,
      planned.length,
      `Snapshot ${index + 1} of ${planned.length}`,
    )

    const [tree, textPaths] = await Promise.all([
      ports.git.listTree(snapshot.sha),
      ports.git.listTextPaths(snapshot.sha),
    ])
    const analysable = analysablePathsAtRevision(
      tree,
      textPaths,
      settings.thresholdBytes,
    )

    const counted = await countSnapshot(
      ports.git,
      settings,
      snapshot.sha,
      analysable,
      carriedForward,
      previousSha,
      namesByEmail,
      run.failures,
    )

    await storeSnapshot(ports.store, snapshot, counted.counts, namesByEmail)

    run.snapshots += 1
    run.filesBlamed += counted.blamed
    run.filesCarried += counted.carried
    carriedForward = counted.counts
    previousSha = snapshot.sha
  }

  // Which revision this history describes. Without it, cohort rows sit in
  // the cache after HEAD has moved on and there is no way to tell that the
  // curve drawn from them is about a repository that no longer exists.
  const head = planned[planned.length - 1]
  if (head) {
    await ports.store.writeMeta({
      [HISTORY_HEAD_KEY]: head.sha,
      [HISTORY_SNAPSHOTS_KEY]: String(run.snapshots),
    })
  }

  onProgress?.(planned.length, planned.length, 'History complete')
  return run
}

/**
 * Count one snapshot, blaming only what can have changed.
 *
 * The set of paths to re-read comes from the commits in the interval, not
 * from a diff of its two ends. A change made and undone within one interval
 * leaves the two ends identical while moving every line it touched to a
 * different author -- so a diff would carry across counts that are wrong,
 * and quietly. Carrying across is only sound when the previous snapshot is
 * an ancestor of this one, because that is the only case in which "the
 * commits between them" is a set at all; it is checked, because the failure
 * it guards against is a survival curve that is wrong without looking
 * wrong. Null means git could not answer, which is not a yes.
 */
async function countSnapshot(
  git: GitPort,
  settings: {
    ignoredRevisions: string[]
    reuse: boolean
    concurrency: number
  },
  revision: string,
  analysable: string[],
  previousCounts: Map<string, PathCounts> | null,
  previousSha: string | null,
  namesByEmail: Map<string, string>,
  failures: HistoryFailure[],
): Promise<Counted> {
  const counts = new Map<string, PathCounts>()
  let toBlame = analysable

  if (settings.reuse && previousCounts && previousSha) {
    const ancestral = await git.isAncestor(previousSha, revision)
    if (ancestral === true) {
      const touched = new Set(
        await git.pathsTouchedBetween(previousSha, revision),
      )
      const stale: string[] = []
      for (const path of analysable) {
        const carried = !touched.has(path) && previousCounts.get(path)
        if (carried) counts.set(path, carried)
        else stale.push(path)
      }
      toBlame = stale
    }
  }

  for (let at = 0; at < toBlame.length; at += settings.concurrency) {
    const batch = toBlame.slice(at, at + settings.concurrency)
    const results = await Promise.allSettled(
      batch.map(async (path) => ({
        path,
        counts: countBlame(
          await git.blame(revision, path, settings.ignoredRevisions),
          namesByEmail,
        ),
      })),
    )
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        counts.set(result.value.path, result.value.counts)
        continue
      }
      // A file that cannot be read contributes nothing rather than failing
      // the whole history, which may be fifty snapshots deep by then -- but
      // contributing nothing understates the snapshot, so it is written
      // down rather than shrugged off.
      failures.push({
        revision,
        path: batch[index] ?? '',
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })
    }
  }

  return {
    counts,
    blamed: toBlame.length,
    carried: analysable.length - toBlame.length,
  }
}

/**
 * Write one snapshot's totals, and nothing of the lines behind them.
 *
 * Summed by the person rather than by the address they wrote from. Identity
 * matching can put two addresses on one person, and two rows for the same
 * person, month and snapshot collide -- so the counting happens after the
 * addresses are resolved, not before. Somebody whose every line has since
 * been rewritten is absent from the analysis of HEAD and is precisely who
 * this is about: they are created, under the name they committed with.
 */
async function storeSnapshot(
  store: AnalysisStore,
  snapshot: Snapshot,
  counts: Map<string, PathCounts>,
  namesByEmail: Map<string, string>,
): Promise<void> {
  const byAddressAndMonth = new Map<string, number>()
  let totalLines = 0
  for (const pathCounts of counts.values()) {
    for (const [key, count] of pathCounts) {
      byAddressAndMonth.set(key, (byAddressAndMonth.get(key) ?? 0) + count)
      totalLines += count
    }
  }

  const emails = new Set<string>()
  for (const key of byAddressAndMonth.keys())
    emails.add(readCountKey(key).email)
  const personOf = await resolveAuthors(store, [...emails], namesByEmail)

  const byPersonAndMonth = new Map<string, NewCohortLine>()
  for (const [key, lineCount] of byAddressAndMonth) {
    const { email, month } = readCountKey(key)
    const authorId = personOf.get(email)
    if (authorId === undefined) {
      throw new Error(`Could not resolve an author for ${email}`)
    }
    const personKey = `${authorId} ${month}`
    const existing = byPersonAndMonth.get(personKey)
    if (existing) existing.lineCount += lineCount
    else {
      byPersonAndMonth.set(personKey, {
        authorId,
        cohortMonth: month,
        lineCount,
      })
    }
  }

  await store.storeSnapshot(
    {
      commitSha: snapshot.sha,
      snapshotTimestamp: snapshot.timestamp,
      totalLines,
    },
    [...byPersonAndMonth.values()],
  )
}

/**
 * The canonical author each address belongs to, creating one for an address
 * the present does not know.
 *
 * An address that exists may have been folded into another by identity
 * matching, which has already run by the time this does. The cohort rows
 * must point at whoever the address resolves to, or a contributor who
 * committed from two machines has their history split in two.
 */
async function resolveAuthors(
  store: AnalysisStore,
  emails: string[],
  namesByEmail: Map<string, string>,
): Promise<Map<string, number>> {
  const known = new Map<string, number>()
  for (const author of await store.listAuthors()) {
    known.set(author.email, author.canonicalId ?? author.id)
  }

  const missing = emails.filter((email) => !known.has(email))
  if (missing.length > 0) {
    const created = await store.ensureAuthors(
      missing.map((email) => {
        const name = namesByEmail.get(email) ?? email
        return { name, email, displayName: name }
      }),
    )
    for (const [email, id] of created) known.set(email, id)
  }

  return known
}
