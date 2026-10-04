import { useEffect, useState } from 'react'
import {
  type BarbarianRanking,
  barbarianRankings,
  type RealmTotals,
  realmTotals,
} from '../../core/barbarian'
import type { IdentityMerge } from '../../core/identity'
import {
  type CacheStatus,
  createLineLord,
  type LineLord,
  type LineLordPorts,
} from '../../core/lineLord'
import type { HistoryReading } from '../../core/longevity'
import type { AnalysisData } from '../../core/model'
import {
  type AuthorContribution,
  authorContributions,
} from '../../core/ownership'
import type { SnapshotInterval } from '../../core/snapshots'
import { type WarriorSource, warriorSourceFor } from '../../core/warrior'

/** How the repository is read: the flags the command line was given. */
export type RealmOptions = {
  /** Files larger than this are set aside, in bytes. */
  thresholdBytes: number
  useCache: boolean
  refresh: boolean
  authorPolicy: 'strict' | 'loose'
  ignoreRevisions: string[]
  concurrency?: number
  history?: { interval: SnapshotInterval; maxSnapshots: number }
}

/** Everything the screens read, worked out once when the realm is read. */
export type Realm = {
  analysis: AnalysisData
  /** Every warrior with their share, worked out once for every screen that lists them. */
  contributions: AuthorContribution[]
  context: ReturnType<LineLord['getAnalysisContext']>
  failures: ReturnType<LineLord['getFailures']>
  historyFailures: ReturnType<LineLord['getHistoryFailures']>
  cache: CacheStatus
  merges: IdentityMerge[]
  history: HistoryReading
  warriorSource: WarriorSource
  rankings: BarbarianRanking[]
  totals: RealmTotals
  measuredAt: Date
}

/** What the analysis produced, before anything is worked out from it. */
export type RealmParts = Pick<
  Realm,
  | 'analysis'
  | 'context'
  | 'failures'
  | 'historyFailures'
  | 'cache'
  | 'merges'
  | 'history'
  | 'measuredAt'
>

/** Everything the screens read, worked out from the analysis once. Pure, so a test can build one. */
export function realmOf(parts: RealmParts): Realm {
  return {
    ...parts,
    warriorSource: warriorSourceFor({
      data: parts.analysis,
      history: parts.history,
      analysedRevision: parts.context.headSha,
      now: parts.measuredAt,
    }),
    contributions: authorContributions(parts.analysis),
    rankings: barbarianRankings(parts.analysis, parts.measuredAt),
    totals: realmTotals(parts.analysis, parts.measuredAt),
  }
}

export type RealmState =
  | {
      status: 'loading'
      fraction: number
      message: string
      walkingHistory: boolean
    }
  | { status: 'failed'; error: string }
  | { status: 'ready'; realm: Realm }

/**
 * Reading a repository, and reading it again when `generation` changes --
 * after a merge has rewritten its .mailmap, say.
 */
export function useRealm(
  ports: LineLordPorts,
  repoPath: string | null,
  options: RealmOptions,
  generation: number,
): RealmState {
  const [state, setState] = useState<RealmState>({
    status: 'loading',
    fraction: 0,
    message: 'Sharpening the axe…',
    walkingHistory: false,
  })
  // Taken apart into values: an object or an array is a new reference on every
  // render, and an effect that depends on one reads the realm again each time.
  const historyInterval = options.history?.interval
  const historyMax = options.history?.maxSnapshots
  const ignoreRevisions = options.ignoreRevisions.join(' ')
  const { thresholdBytes, useCache, refresh, authorPolicy, concurrency } =
    options

  // biome-ignore lint/correctness/useExhaustiveDependencies: generation is read by nobody inside; changing it is how the same repository is read again
  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    setState({
      status: 'loading',
      fraction: 0,
      message: 'Sharpening the axe…',
      walkingHistory: false,
    })

    const progress =
      (walkingHistory: boolean) =>
      (current: number, total: number, message: string) => {
        if (cancelled) return
        setState({
          status: 'loading',
          fraction: total > 0 ? current / total : 0,
          message,
          walkingHistory,
        })
      }

    const read = async () => {
      // A path that is no repository would otherwise be analysed as an empty
      // one -- a realm with nobody in it, reported as ready. The command line
      // and the path screen both check first, but the reading should not rely
      // on either of them remembering to.
      const lookup = await ports.git.locate(repoPath)
      if (!lookup.found) {
        throw new Error(
          lookup.reason === 'git-unavailable'
            ? 'git could not be run. LineLord reads history with git, so it has to be installed and on your PATH.'
            : `Not a git repository: ${repoPath}`,
        )
      }

      const service = createLineLord(ports, lookup.root, thresholdBytes, {
        useCache,
        refresh,
        authorPolicy,
        ignoreRevisions: ignoreRevisions ? ignoreRevisions.split(' ') : [],
        concurrency,
        history:
          historyInterval && historyMax
            ? { interval: historyInterval, maxSnapshots: historyMax }
            : undefined,
      })
      // The history is walked after the present, not instead of it.
      await service.initialize(progress(false))
      await service.gatherHistory(progress(true))
      if (cancelled) return
      setState({
        status: 'ready',
        realm: realmOf({
          analysis: service.getAnalysis(),
          context: service.getAnalysisContext(),
          failures: service.getFailures(),
          historyFailures: service.getHistoryFailures(),
          cache: service.getCacheStatus(),
          merges: service.getIdentityMerges(),
          history: service.getHistory(),
          measuredAt: new Date(),
        }),
      })
    }

    read().catch((error: unknown) => {
      if (!cancelled)
        setState({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
    })

    return () => {
      cancelled = true
    }
  }, [
    ports,
    repoPath,
    thresholdBytes,
    useCache,
    refresh,
    authorPolicy,
    ignoreRevisions,
    concurrency,
    historyInterval,
    historyMax,
    generation,
  ])

  return state
}
