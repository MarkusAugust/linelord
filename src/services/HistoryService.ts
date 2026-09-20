import { spawn } from 'node:child_process'
import { sql } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authors, cohortLines, snapshots } from '../db/schema'
import { pathsTouchedBetween } from '../utility/gitRepository'
import {
  analysablePathsAtRevision,
  blameFileAtRevision,
  countBlame,
  listFilesAtRevision,
  listTextFilesAtRevision,
  type PathCounts,
  readCountKey,
} from './revisionBlame'
import {
  DEFAULT_MAX_SNAPSHOTS,
  type HistoryCommit,
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
  interval?: SnapshotInterval
  maxSnapshots?: number
  thresholdBytes?: number
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
}

const DEFAULT_CONCURRENCY = 12

export class HistoryService {
  private interval: SnapshotInterval
  private maxSnapshots: number
  private thresholdBytes: number
  private ignoredRevisions: string[]
  private reuse: boolean
  private concurrency: number

  constructor(
    private repoPath: string,
    private db: LineLordDatabase,
    options: HistoryOptions = {},
  ) {
    this.interval = options.interval ?? 'month'
    this.maxSnapshots = options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    this.thresholdBytes = options.thresholdBytes ?? 50 * 1024
    this.ignoredRevisions = options.ignoredRevisions ?? []
    this.reuse = options.reuseBetweenSnapshots ?? true
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  }

  /** The revisions this run would sample, without sampling them. */
  async plannedSnapshots(): Promise<Snapshot[]> {
    return selectSnapshots(
      await this.firstParentHistory(),
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
      return { snapshots: 0, filesBlamed: 0, filesCarried: 0 }
    }

    this.forgetPreviousRun()

    let carriedForward: Map<string, PathCounts> | null = null
    let previousSha: string | null = null
    const run: HistoryRun = {
      snapshots: 0,
      filesBlamed: 0,
      filesCarried: 0,
    }

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

    onProgress?.(planned.length, planned.length, 'History complete')
    return run
  }

  /** Which paths at this revision are worth blaming. */
  private async analysablePaths(revision: string): Promise<string[]> {
    const [files, textPaths] = await Promise.all([
      listFilesAtRevision(this.repoPath, revision),
      listTextFilesAtRevision(this.repoPath, revision),
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
      const touched = new Set(
        await pathsTouchedBetween(this.repoPath, previousSha, revision),
      )
      const stale: string[] = []
      for (const path of analysable) {
        const carried = !touched.has(path) && previousCounts.get(path)
        if (carried) counts.set(path, carried)
        else stale.push(path)
      }
      toBlame = stale
    }

    for (let at = 0; at < toBlame.length; at += this.concurrency) {
      const batch = toBlame.slice(at, at + this.concurrency)
      const results = await Promise.allSettled(
        batch.map(async (path) => ({
          path,
          counts: countBlame(
            await blameFileAtRevision(
              this.repoPath,
              revision,
              path,
              this.ignoredRevisions,
            ),
          ),
        })),
      )
      for (const result of results) {
        // A file that cannot be read contributes nothing rather than failing
        // the whole history, which may be fifty snapshots deep by then.
        if (result.status === 'fulfilled') {
          counts.set(result.value.path, result.value.counts)
        }
      }
    }

    return {
      counts,
      blamed: toBlame.length,
      carried: analysable.length - toBlame.length,
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

    const rows = [...byAuthorAndMonth].map(([key, lineCount]) => {
      const { email, month } = readCountKey(key)
      return { email, month, lineCount }
    })

    const authorIds = new Map<string, number>()
    for (const row of rows) {
      if (!authorIds.has(row.email)) {
        authorIds.set(row.email, this.resolveAuthor(row.email))
      }
    }

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
        const authorId = authorIds.get(row.email)
        if (authorId === undefined) continue
        tx.insert(cohortLines)
          .values({
            snapshotId: stored.id,
            authorId,
            cohortMonth: row.month,
            lineCount: row.lineCount,
          })
          .run()
      }
    })
  }

  /**
   * The author row for an address, creating one if the history has someone
   * the present does not.
   *
   * Somebody whose every line has since been rewritten is absent from the
   * analysis of HEAD, and they are precisely who this feature is about. They
   * are created canonical, which is what they are under the default identity
   * policy; a later `--fuzzy-authors` run would not merge them, since
   * normalisation has already been and gone by the time this runs.
   */
  private resolveAuthor(email: string): number {
    const [row] = this.db
      .insert(authors)
      .values({
        name: email,
        email,
        displayName: email,
        isCanonical: true,
      })
      .onConflictDoUpdate({
        target: authors.email,
        set: { email: sql`excluded.email` },
      })
      .returning({ id: authors.id })
      .all()

    if (!row) throw new Error(`Could not resolve an author for ${email}`)
    return row.id
  }

  /** Drop any earlier history, which described other revisions. */
  private forgetPreviousRun(): void {
    this.db.transaction((tx) => {
      tx.delete(cohortLines).run()
      tx.delete(snapshots).run()
    })
  }

  /** The first-parent history, newest first, as git reports it. */
  private async firstParentHistory(): Promise<HistoryCommit[]> {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        'git',
        ['log', '--first-parent', '--format=%H %ct', 'HEAD'],
        { cwd: this.repoPath, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      const chunks: Buffer[] = []
      let stderr = ''
      child.stdout.on('data', (data) => chunks.push(data))
      child.stderr.on('data', (data) => {
        stderr += String(data)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString())
          return
        }
        // A repository with no commits has no history, which is not an
        // error. git says so in two different ways depending on how HEAD
        // fails to resolve, and neither is a reason to fail an analysis.
        if (/unknown revision|does not have any commits/.test(stderr)) {
          resolve('')
          return
        }
        reject(new Error(stderr.trim() || `git exited with ${code}`))
      })
    })

    const commits: HistoryCommit[] = []
    for (const line of stdout.split('\n')) {
      if (!line) continue
      const [sha, seconds] = line.split(' ')
      const timestamp = Number.parseInt(seconds ?? '', 10)
      if (sha && Number.isFinite(timestamp)) commits.push({ sha, timestamp })
    }
    return commits
  }
}
