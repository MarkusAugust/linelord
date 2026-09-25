import type { FileSystemPort } from '../ports/files'
import type { GitFactory, GitPort } from '../ports/git'
import type { AnalysisStore } from '../ports/storage'
import type { CacheLock, StoreProvider } from '../ports/stores'
import {
  type AnalysisContext,
  type AnalysisFailure,
  analyseRevision,
  contextFor,
  describeRevision,
  NO_IGNORE_REVS,
  updateAnalysis,
} from './analyse'
import {
  type AuthorPolicy,
  computeFingerprint,
  decideCacheUse,
  HEAD_KEY,
} from './cache'
import {
  HISTORY_HEAD_KEY,
  type HistoryFailure,
  type HistoryRun,
  walkHistory,
} from './history'
import {
  describeExistingMerges,
  findIdentityGuesses,
  type IdentityMerge,
  normalizeAuthors,
} from './identity'
import { type IgnoreRevs, resolveIgnoreRevs } from './ignoreRevs'
import type { HistoryReading } from './longevity'
import type { AnalysisData } from './model'
import { wasAnalysed } from './ownership'
import { rankAuthors } from './ranking'
import type { SnapshotInterval } from './snapshots'

/**
 * One repository, analysed: what the interface holds and asks questions of.
 *
 * A record of functions closing over the run's state, built by
 * `createLineLord` from the ports it is handed. Nothing here runs a process,
 * opens a file or touches a database directly; the ports do, and a test can
 * hand in ones that answer from memory.
 */

/** What the run did, and why, so the interface can say so rather than imply it. */
export interface CacheStatus {
  /**
   * `reused` means nothing was blamed at all; `incremental` means only what
   * changed was; `full` means everything; `disabled` means no cache was
   * consulted or written.
   */
  mode: 'full' | 'incremental' | 'reused' | 'disabled'
  filesBlamed: number
  filesReused: number
  /** Why a full analysis happened, when it was not simply the first run. */
  reason?: string
  /** Where the cache lives, when there is one. */
  path?: string
}

export interface LineLordOptions {
  /**
   * Whether to read and write a cache on disk.
   *
   * Off by default so that building this never touches the user's file
   * system unless something asked it to -- which keeps the test suite from
   * scattering databases through ~/.cache.
   */
  useCache?: boolean
  /**
   * Ignore whatever is stored and analyse from the beginning, writing a
   * fresh cache afterwards. For when the numbers look wrong and the cache is
   * the first thing anyone suspects.
   */
  refresh?: boolean
  /**
   * How identities are matched. `strict` compares email addresses and
   * nothing else, which is the default; `loose` also guesses from names and
   * addresses that merely resemble each other.
   */
  authorPolicy?: AuthorPolicy
  /**
   * Extra commits for blame to look past, on top of whatever
   * `.git-blame-ignore-revs` names. For a reformatting nobody has written
   * down yet.
   */
  ignoreRevisions?: string[]
  /** How many files may be blamed at once. */
  concurrency?: number
  /**
   * Walk the history as well, and how. Absent means the ordinary analysis
   * of HEAD and nothing more; present means reading the repository as it
   * stood at points in the past, which takes minutes on anything substantial.
   */
  history?: { interval: SnapshotInterval; maxSnapshots: number }
}

/** Everything the run reaches the outside world through. */
export interface LineLordPorts {
  git: GitFactory
  files: FileSystemPort
  stores: StoreProvider
}

export type ProgressReport = (
  current: number,
  total: number,
  message: string,
) => void

export interface LineLord {
  /** Read the repository, or reuse what was stored about it. */
  initialize(onProgress?: ProgressReport): Promise<void>
  /** Let go of anything still held, for a caller that abandons a run part-way. */
  close(): void
  isInitialized(): boolean
  getCurrentRepoPath(): string
  /** What the last run did: how much it read, how much it kept, and why. */
  getCacheStatus(): CacheStatus
  /** The analysis as values, for the core's functions to answer questions over. */
  getAnalysis(): AnalysisData
  /** The store the analysis is kept in, for a caller that needs to write to it. */
  getStore(): AnalysisStore
  /** Which revision the numbers describe, and how much of the working copy they leave out. */
  getAnalysisContext(): AnalysisContext
  /** Files the analysis could not read. Empty when everything was analysed. */
  getFailures(): AnalysisFailure[]
  /** Whether this run was asked to walk the history. */
  wantsHistory(): boolean
  /** Walk the history, under exactly the settings the present was read with. */
  gatherHistory(onProgress?: ProgressReport): Promise<HistoryRun | null>
  /** Files the history could not read, if it was walked. */
  getHistoryFailures(): HistoryFailure[]
  /** How many revisions the history read, or zero if it was not walked. */
  getHistorySnapshotCount(): number
  /** The history as values, and which revision it claims to describe. */
  getHistory(): HistoryReading
  /**
   * Identities that are, or may be, one person -- and why.
   *
   * Under the default policy nothing is merged, so this is what a guessing
   * run *would* have merged: the only way a user looking at two entries for
   * one person learns that LineLord noticed. Under `--fuzzy-authors` the
   * merging has already happened and this is the record of every assumption
   * taken. Worked out during initialization, including on a reused run.
   */
  getIdentityMerges(): IdentityMerge[]
}

type Plan =
  | { plan: 'reuse'; status: CacheStatus }
  | { plan: 'full'; status: CacheStatus }
  | { plan: 'incremental'; touched: Set<string>; status: CacheStatus }

export function createLineLord(
  ports: LineLordPorts,
  repoPath: string,
  largeFileThresholdBytes: number = 50 * 1024,
  options: LineLordOptions = {},
): LineLord {
  const useCache = options.useCache ?? false
  const refresh = options.refresh ?? false
  const authorPolicy: AuthorPolicy = options.authorPolicy ?? 'strict'
  const extraIgnoreRevisions = options.ignoreRevisions ?? []
  const concurrency = options.concurrency
  const wantedHistory = options.history

  // The run's state. Closed over rather than kept on a class, and every
  // reader below hands out copies or values rather than the state itself.
  let git: GitPort = ports.git.at(repoPath)
  let store: AnalysisStore = ports.stores.open(repoPath, false).store
  let cacheLock: CacheLock | null = null
  let initialized = false
  let context: AnalysisContext = contextFor(
    { headSha: null, uncommittedFileCount: 0 },
    NO_IGNORE_REVS,
  )
  let failures: AnalysisFailure[] = []
  let analysis: AnalysisData | null = null
  let historyReading: HistoryReading = {
    history: { snapshots: [], cohortLines: [] },
    describes: null,
  }
  let historyRun: HistoryRun | null = null
  let ignoredRevisions: IgnoreRevs = NO_IGNORE_REVS
  let identityMerges: IdentityMerge[] = []
  let cacheStatus: CacheStatus = {
    mode: 'disabled',
    filesBlamed: 0,
    filesReused: 0,
  }

  const releaseCacheLock = () => {
    cacheLock?.release()
    cacheLock = null
  }

  const repositoryRoot = async (): Promise<string> => {
    const lookup = await ports.git.locate(repoPath)
    return lookup.found ? lookup.root : repoPath
  }

  const analysisSettings = () => ({
    thresholdBytes: largeFileThresholdBytes,
    concurrency,
    ignoreRevs: ignoredRevisions,
  })

  const fingerprintFor = (root: string, headSha: string) =>
    computeFingerprint(
      {
        repositoryRoot: root,
        layoutVersion: store.layoutVersion,
        headSha,
        thresholdBytes: largeFileThresholdBytes,
        authorPolicy,
        ignoredRevisions: ignoredRevisions.revisions,
      },
      ports.files,
    )

  /**
   * Decide between reusing, updating and rebuilding.
   *
   * Every branch that cannot be reasoned about ends in a full analysis. That
   * is not caution for its own sake: a needless rebuild costs seconds, while
   * a cache reused when it should not have been puts numbers on screen that
   * look exactly like correct ones.
   */
  const decideWhatToDo = async (
    root: string,
    headSha: string | null,
  ): Promise<Plan> => {
    const full = (reason?: string): Plan => ({
      plan: 'full',
      status: {
        mode: useCache ? 'full' : 'disabled',
        filesBlamed: 0,
        filesReused: 0,
        reason,
      },
    })

    if (!useCache || !headSha) return full()
    if (refresh) return full('you asked for a fresh analysis')

    let decision: ReturnType<typeof decideCacheUse>
    try {
      decision = decideCacheUse(
        await store.readMeta(),
        await fingerprintFor(root, headSha),
      )
    } catch {
      // Something the fingerprint depends on could not be read. Not knowing
      // whether the cache holds is the same as knowing it does not.
      return full(
        'the settings behind the stored analysis could not be checked',
      )
    }

    if (decision.action === 'analyse') {
      return full(
        decision.reason === 'settings-changed'
          ? decision.explanation
          : undefined,
      )
    }

    if (decision.action === 'reuse') {
      const kept = (await store.listFiles()).filter(wasAnalysed).length
      return {
        plan: 'reuse',
        status: { mode: 'reused', filesBlamed: 0, filesReused: kept },
      }
    }

    // The revision moved. Only forwards can be updated: a rebase, a
    // force-push or a branch switch leaves no way to tell what survived.
    const ancestry = await git.isAncestor(decision.storedHeadSha, headSha)
    if (ancestry !== true) {
      // Two different situations, and the message should not assert the
      // wrong one. Either history genuinely moved sideways, or git could not
      // answer -- an unknown revision, most likely, which a pruned or
      // damaged repository produces just as readily as a rebase does.
      return full(
        ancestry === false
          ? 'the history was rewritten or a different branch checked out'
          : 'the stored revision could not be found in this repository',
      )
    }

    try {
      const touched = await git.pathsTouchedBetween(
        decision.storedHeadSha,
        headSha,
      )
      return {
        plan: 'incremental',
        touched: new Set(touched),
        status: { mode: 'incremental', filesBlamed: 0, filesReused: 0 },
      }
    } catch {
      return full('the commits since the stored analysis could not be listed')
    }
  }

  /**
   * Record what this analysis was built from.
   *
   * The revision goes last and on its own. A run interrupted part-way
   * leaves the cache still claiming the revision it held before, so the
   * next run asks for the same interval again and repairs itself -- which
   * works because re-reading a file discards its stored lines first.
   */
  const recordFingerprint = async (root: string, headSha: string) => {
    const fingerprint = await fingerprintFor(root, headSha)
    const { [HEAD_KEY]: head, ...rest } = fingerprint
    await store.writeMeta({ ...rest, analyzed_at: String(Date.now()) })
    await store.writeMeta({ [HEAD_KEY]: head ?? headSha })
  }

  /**
   * Which identities belong together, read without changing anything.
   *
   * After guessing, the merges are read back from the alias rows the
   * merging wrote, which the cache keeps; without it, the guessing is run as
   * a question and its answer discarded. Either way a run that reused its
   * cache answers the same as the run that did the work.
   */
  const collectIdentityMerges = async (): Promise<IdentityMerge[]> => {
    try {
      const authors = await store.listAuthors()
      return authorPolicy === 'loose'
        ? describeExistingMerges(authors, (await store.loadAnalysis()).aliases)
        : findIdentityGuesses(authors)
    } catch {
      // A warning nobody can render is not worth failing an analysis over.
      return []
    }
  }

  const readHistory = async (): Promise<HistoryReading> => {
    const meta = await store.readMeta()
    return {
      history: await store.loadHistory(),
      describes: meta[HISTORY_HEAD_KEY] ?? null,
    }
  }

  const initialize = async (onProgress?: ProgressReport): Promise<void> => {
    try {
      onProgress?.(0, 100, 'Initializing Git service...')

      const root = await repositoryRoot()
      git = ports.git.at(root)
      const opened = ports.stores.open(root, useCache)
      store = opened.store
      cacheLock = opened.lock
      const cachePath = opened.path

      const headSha = await git.resolveHead()

      // Before the cache decision, because which commits are being looked
      // past is part of what a stored analysis is an answer to; and before
      // any blame, because an entry git cannot resolve would make it refuse
      // every file rather than just that one.
      ignoredRevisions = await resolveIgnoreRevs(
        root,
        extraIgnoreRevisions,
        git,
        ports.files,
      )

      const decision = await decideWhatToDo(root, headSha)
      cacheStatus = { ...decision.status, path: cachePath }

      if (decision.plan === 'reuse') {
        onProgress?.(100, 100, 'Reusing the stored analysis')
        context = contextFor(await describeRevision(git), ignoredRevisions)
        failures = []
        identityMerges = await collectIdentityMerges()
        analysis = await store.loadAnalysis()
        historyReading = await readHistory()
        initialized = true
        return
      }

      const forwardProgress: ProgressReport = (current, total, message) =>
        onProgress?.((current / total) * 60, 100, message)

      let run: Awaited<ReturnType<typeof analyseRevision>>
      if (decision.plan === 'incremental') {
        run = await updateAnalysis(
          { git, store },
          analysisSettings(),
          decision.touched,
          forwardProgress,
        )
      } else {
        // Empty whatever was stored and analyse from the beginning.
        await store.clear()
        run = await analyseRevision(
          { git, store },
          analysisSettings(),
          forwardProgress,
        )
      }
      context = run.context
      failures = run.failures
      cacheStatus = {
        ...cacheStatus,
        filesBlamed: run.blamed,
        filesReused: run.reused,
      }

      onProgress?.(60, 100, 'Normalizing authors...')
      // Merging identities and ranking them are decisions about the whole
      // repository, so they cannot be updated in part: both run again after
      // any change, however small.
      await normalizeAuthors(store, authorPolicy)
      identityMerges = await collectIdentityMerges()

      onProgress?.(80, 100, 'Calculating ranks and percentages...')
      await store.updateAuthors(rankAuthors(await store.loadAnalysis()))
      analysis = await store.loadAnalysis()
      historyReading = await readHistory()

      if (cachePath && headSha) {
        await recordFingerprint(root, headSha)
      }

      onProgress?.(100, 100, 'Initialization complete!')
      initialized = true
    } catch (error) {
      initialized = false
      throw error
    } finally {
      // The lock covers writing the cache, which is over by now. Holding it
      // for the life of the interface would mean a user browsing menus keeps
      // every other LineLord out of that repository, and a process that
      // exits without unwinding leaves the file behind for ten minutes.
      releaseCacheLock()
    }
  }

  const gatherHistory = async (
    onProgress?: ProgressReport,
  ): Promise<HistoryRun | null> => {
    if (!wantedHistory) return null

    const root = await repositoryRoot()

    // initialize lets the lock go as soon as it has finished writing, so
    // that somebody browsing menus does not keep every other LineLord out.
    // The walk writes too -- it empties the snapshot tables and fills them
    // again -- so it has to hold the lock for itself, or two histories
    // interleave into one database and leave a set of snapshots describing
    // neither.
    const lock = useCache ? ports.stores.lock(root) : null
    if (useCache && !lock) {
      throw new Error(
        'Another LineLord is analysing this repository. Reading the history ' +
          'writes to the same stored analysis, so this run has stopped rather ' +
          'than interleave with it.',
      )
    }

    try {
      const run = await walkHistory(
        { git, store },
        {
          thresholdBytes: largeFileThresholdBytes,
          ignoredRevisions: ignoredRevisions.revisions,
          concurrency,
          interval: wantedHistory.interval,
          maxSnapshots: wantedHistory.maxSnapshots,
        },
        onProgress,
      )
      historyRun = run
      historyReading = await readHistory()
      return run
    } finally {
      lock?.release()
    }
  }

  const requireInitialized = (what: string) => {
    if (!initialized) {
      throw new Error(`LineLord must be initialized before ${what}`)
    }
  }

  return {
    initialize,
    close: releaseCacheLock,
    isInitialized: () => initialized,
    getCurrentRepoPath: () => repoPath,
    getCacheStatus: () => ({ ...cacheStatus }),
    getAnalysis: () => {
      requireInitialized('the analysis can be read')
      if (analysis === null) {
        throw new Error(
          'LineLord must be initialized before the analysis can be read',
        )
      }
      return analysis
    },
    getStore: () => store,
    getAnalysisContext: () => ({ ...context }),
    getFailures: () => [...failures],
    wantsHistory: () => wantedHistory !== undefined,
    gatherHistory,
    getHistoryFailures: () => historyRun?.failures ?? [],
    getHistorySnapshotCount: () => historyRun?.snapshots ?? 0,
    getHistory: () => historyReading,
    getIdentityMerges: () => identityMerges,
  }
}
