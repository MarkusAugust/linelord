import { eq, sql } from 'drizzle-orm'
import { createGit } from '../adapters/git/spawnGit'
import type { LineLordDatabase } from '../adapters/sqlite/database'
import {
  HISTORY_HEAD_KEY,
  HISTORY_SNAPSHOTS_KEY,
  writeMeta,
} from '../adapters/sqlite/meta'
import {
  authors,
  cohortLines,
  meta,
  snapshots,
} from '../adapters/sqlite/schema'
import type { GitPort } from '../ports/git'
import { normaliseConcurrency } from './GitService'
import {
  analysablePathsAtRevision,
  countBlame,
  type PathCounts,
  readCountKey,
} from './revisionBlame'
import {
  DEFAULT_MAX_SNAPSHOTS,
  type Snapshot,
  type SnapshotInterval,
  selectSnapshots,
} from './snapshotSelection'

/**
 * How long code actually lived, rather than how old what survives is.
 *
 * Tier 1 asks a question of HEAD: for the lines still standing, how old are
 * they. That is cheap and it is not the same question. This one is about the
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

export interface HistoryOptions {
  /**
   * The size above which a file is left out, as the analysis of HEAD uses it.
   *
   * Required rather than defaulted. A default is a number that looks right
   * and silently disagrees with `--threshold`, and the history would then be
   * measured under different rules than the present it is drawn beside --
   * which is the one thing this module promises not to do. The caller knows
   * the number; make it say so.
   */
  thresholdBytes: number
  interval?: SnapshotInterval
  maxSnapshots?: number
  /**
   * Commits for blame to look past, as the analysis of HEAD resolved them.
   *
   * Defaulted, because nothing configured is a real state and is the same
   * default the analysis has. A caller that has resolved a set must pass it:
   * a reformatting ignored in the present and counted in the history would
   * put the whole codebase in one cohort.
   */
  ignoredRevisions?: string[]
  /**
   * Carry untouched files between snapshots instead of blaming them again.
   *
   * On by default; it is the optimisation the whole service exists around.
   * It can be turned off so that the optimisation can be checked against the
   * thing it optimises, which is the only way to know it does not lie.
   */
  reuseBetweenSnapshots?: boolean
  /** Files blamed at once. */
  concurrency?: number
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
   * else here: Ink owns the terminal by the time this runs.
   */
  failures: HistoryFailure[]
}

export interface HistoryFailure {
  revision: string
  path: string
  error: string
}

export class HistoryService {
  private interval: SnapshotInterval
  private maxSnapshots: number
  private thresholdBytes: number
  private ignoredRevisions: string[]
  private reuse: boolean
  private concurrency: number
  private failures: HistoryFailure[] = []
  /** The name each address wrote under, for people the present has forgotten. */
  private namesByEmail = new Map<string, string>()

  constructor(
    repoPath: string,
    private db: LineLordDatabase,
    options: HistoryOptions,
    /** How git is reached. Injected so a test can answer for it. */
    private git: GitPort = createGit(repoPath),
  ) {
    this.interval = options.interval ?? 'month'
    this.maxSnapshots = options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    this.thresholdBytes = options.thresholdBytes
    this.ignoredRevisions = options.ignoredRevisions ?? []
    this.reuse = options.reuseBetweenSnapshots ?? true
    // The same settling GitService does, and for the same reason: a NaN
    // makes the batching loop slice an empty batch and then end, so nothing
    // is blamed and the run reports success with no lines at all.
    this.concurrency = normaliseConcurrency(options.concurrency)
  }

  /** The revisions this run would sample, without sampling them. */
  async plannedSnapshots(): Promise<Snapshot[]> {
    return selectSnapshots(
      await this.git.firstParentHistory(),
      this.interval,
      this.maxSnapshots,
    )
  }

  /**
   * Walk the sampled revisions and record what was alive at each.
   *
   * Each snapshot is written in a transaction of its own, so an analysis
   * stopped halfway leaves whole snapshots behind rather than half of one.
   * Minutes is a realistic running time here, and a person who gives up on it
   * should not also lose their cache.
   */
  async analyse(
    onProgress?: (current: number, total: number, message: string) => void,
  ): Promise<HistoryRun> {
    const planned = await this.plannedSnapshots()
    if (planned.length === 0) {
      return { snapshots: 0, filesBlamed: 0, filesCarried: 0, failures: [] }
    }

    this.forgetPreviousRun()

    let carriedForward: Map<string, PathCounts> | null = null
    let previousSha: string | null = null
    const run: HistoryRun = {
      snapshots: 0,
      filesBlamed: 0,
      filesCarried: 0,
      failures: [],
    }
    this.failures = []
    this.namesByEmail = new Map()

    for (const [index, snapshot] of planned.entries()) {
      onProgress?.(
        index,
        planned.length,
        `Snapshot ${index + 1} of ${planned.length}`,
      )

      const analysable = await this.analysablePaths(snapshot.sha)
      const { counts, blamed, carried } = await this.countSnapshot(
        snapshot.sha,
        analysable,
        carriedForward,
        previousSha,
      )

      this.store(snapshot, counts)

      run.snapshots += 1
      run.filesBlamed += blamed
      run.filesCarried += carried
      carriedForward = counts
      previousSha = snapshot.sha
    }

    // Which revision this history describes. Without it, cohort rows sit in
    // the cache after HEAD has moved on and there is no way to tell that the
    // curve drawn from them is about a repository that no longer exists.
    const head = planned[planned.length - 1]
    if (head) {
      writeMeta(this.db, {
        [HISTORY_HEAD_KEY]: head.sha,
        [HISTORY_SNAPSHOTS_KEY]: String(run.snapshots),
      })
    }

    run.failures = this.failures
    onProgress?.(planned.length, planned.length, 'History complete')
    return run
  }

  /** Which paths at this revision are worth blaming. */
  private async analysablePaths(revision: string): Promise<string[]> {
    const [files, textPaths] = await Promise.all([
      this.git.listTree(revision),
      this.git.listTextPaths(revision),
    ])
    return analysablePathsAtRevision(files, textPaths, this.thresholdBytes)
  }

  /**
   * Count one snapshot, blaming only what can have changed.
   *
   * The set of paths to re-read comes from the commits in the interval, not
   * from a diff of its two ends. A change made and undone within one interval
   * leaves the two ends identical while moving every line it touched to a
   * different author -- so a diff would carry across counts that are wrong,
   * and quietly. This is the same trap A3 documents for the incremental
   * cache, and the same answer.
   */
  private async countSnapshot(
    revision: string,
    analysable: string[],
    previousCounts: Map<string, PathCounts> | null,
    previousSha: string | null,
  ): Promise<{
    counts: Map<string, PathCounts>
    blamed: number
    carried: number
  }> {
    const counts = new Map<string, PathCounts>()
    let toBlame = analysable

    if (this.reuse && previousCounts && previousSha) {
      // Carrying counts across is only sound when the previous snapshot is an
      // ancestor of this one, because that is the only case in which "the
      // commits between them" is a set at all. Snapshots are ordered by
      // ancestry precisely so this holds -- and it is checked anyway, because
      // the failure it guards against is a survival curve that is wrong
      // without looking wrong. Null means git could not answer, which is not
      // a yes.
      const ancestral = await this.git.isAncestor(previousSha, revision)
      if (ancestral !== true) {
        return this.blameAll(revision, analysable)
      }

      const touched = new Set(
        await this.git.pathsTouchedBetween(previousSha, revision),
      )
      const stale: string[] = []
      for (const path of analysable) {
        const carried = !touched.has(path) && previousCounts.get(path)
        if (carried) counts.set(path, carried)
        else stale.push(path)
      }
      toBlame = stale
    }

    await this.blameInto(counts, revision, toBlame)

    return {
      counts,
      blamed: toBlame.length,
      carried: analysable.length - toBlame.length,
    }
  }

  /** Read every path at a revision, carrying nothing across. */
  private async blameAll(
    revision: string,
    analysable: string[],
  ): Promise<{
    counts: Map<string, PathCounts>
    blamed: number
    carried: number
  }> {
    const counts = new Map<string, PathCounts>()
    await this.blameInto(counts, revision, analysable)
    return { counts, blamed: analysable.length, carried: 0 }
  }

  /** Blame a set of paths at a revision, adding their counts to `into`. */
  private async blameInto(
    into: Map<string, PathCounts>,
    revision: string,
    paths: string[],
  ): Promise<void> {
    for (let at = 0; at < paths.length; at += this.concurrency) {
      const batch = paths.slice(at, at + this.concurrency)
      const results = await Promise.allSettled(
        batch.map(async (path) => ({
          path,
          counts: countBlame(
            await this.git.blame(revision, path, this.ignoredRevisions),
            this.namesByEmail,
          ),
        })),
      )
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          into.set(result.value.path, result.value.counts)
          continue
        }
        // A file that cannot be read contributes nothing rather than failing
        // the whole history, which may be fifty snapshots deep by then -- but
        // contributing nothing understates the snapshot, so it is written
        // down rather than shrugged off.
        this.failures.push({
          revision,
          path: batch[index] ?? '',
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        })
      }
    }
  }

  /** Write one snapshot's totals, and nothing of the lines behind them. */
  private store(snapshot: Snapshot, counts: Map<string, PathCounts>): void {
    const byAuthorAndMonth = new Map<string, number>()
    let totalLines = 0
    for (const pathCounts of counts.values()) {
      for (const [key, count] of pathCounts) {
        byAuthorAndMonth.set(key, (byAuthorAndMonth.get(key) ?? 0) + count)
        totalLines += count
      }
    }

    // Summed by the person rather than by the address they wrote from.
    // Identity normalisation can put two addresses on one person, and two
    // rows for the same person, month and snapshot collide on the primary
    // key -- which fails the transaction and loses the whole snapshot. The
    // counting has to happen after the addresses are resolved, not before.
    const authorIds = new Map<string, number>()
    const byPersonAndMonth = new Map<string, number>()
    for (const [key, lineCount] of byAuthorAndMonth) {
      const { email, month } = readCountKey(key)
      let authorId = authorIds.get(email)
      if (authorId === undefined) {
        authorId = this.resolveAuthor(email)
        authorIds.set(email, authorId)
      }
      const personKey = `${authorId}\u0000${month}`
      byPersonAndMonth.set(
        personKey,
        (byPersonAndMonth.get(personKey) ?? 0) + lineCount,
      )
    }

    const rows = [...byPersonAndMonth].map(([key, lineCount]) => {
      const at = key.indexOf('\u0000')
      return {
        authorId: Number.parseInt(key.slice(0, at), 10),
        month: Number.parseInt(key.slice(at + 1), 10),
        lineCount,
      }
    })

    this.db.transaction((tx) => {
      const [stored] = tx
        .insert(snapshots)
        .values({
          commitSha: snapshot.sha,
          snapshotTimestamp: snapshot.timestamp,
          totalLines,
        })
        .returning({ id: snapshots.id })
        .all()

      if (!stored) return

      for (const row of rows) {
        tx.insert(cohortLines)
          .values({
            snapshotId: stored.id,
            authorId: row.authorId,
            cohortMonth: row.month,
            lineCount: row.lineCount,
          })
          .run()
      }
    })
  }

  /**
   * The author row an address belongs to, creating one if the history has
   * somebody the present does not.
   *
   * Two things matter here. Somebody whose every line has since been
   * rewritten is absent from the analysis of HEAD, and is precisely who this
   * feature is about; they are created, under the name they committed with
   * rather than under their address, which is all the contributor list would
   * otherwise have to show.
   *
   * And an address that exists may have been merged into another by identity
   * normalisation, which has already run by the time this does. The cohort
   * rows must point at whoever the address resolves to, or a contributor who
   * committed from two machines has their history split in two -- or dropped
   * entirely by anything that joins on canonical authors.
   */
  private resolveAuthor(email: string): number {
    const name = this.namesByEmail.get(email) ?? email
    const [row] = this.db
      .insert(authors)
      .values({
        name,
        email,
        displayName: name,
        isCanonical: true,
      })
      .onConflictDoUpdate({
        target: authors.email,
        set: { email: sql`excluded.email` },
      })
      .returning({ id: authors.id, canonicalId: authors.canonicalId })
      .all()

    if (!row) throw new Error(`Could not resolve an author for ${email}`)
    return row.canonicalId ?? row.id
  }

  /**
   * Drop any earlier history, and the claim about which revision it was.
   *
   * Dropping the rows without dropping the claim leaves the database saying
   * it holds a history of revision X while holding none -- for the whole of
   * a run that may take minutes, and permanently if that run is interrupted.
   * The claim is written again at the end, once there is something to claim.
   */
  private forgetPreviousRun(): void {
    this.db.transaction((tx) => {
      tx.delete(cohortLines).run()
      tx.delete(snapshots).run()
      tx.delete(meta).where(eq(meta.key, HISTORY_HEAD_KEY)).run()
      tx.delete(meta).where(eq(meta.key, HISTORY_SNAPSHOTS_KEY)).run()
    })
  }
}
