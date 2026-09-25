import { resolveCachePath } from '../adapters/sqlite/cacheLocation'
import {
  acquireCacheLock,
  type CacheLock,
  markCacheUsed,
  tidyCacheDirectory,
} from '../adapters/sqlite/cacheMaintenance'
import {
  clearDatabase,
  createDatabase,
  type LineLordDatabase,
} from '../adapters/sqlite/database'
import {
  HISTORY_HEAD_KEY,
  readAllMeta,
  writeMeta,
} from '../adapters/sqlite/meta'
import { createSqliteStore } from '../adapters/sqlite/store'
import type { HistoryReading } from '../core/longevity'
import type { AnalysisData } from '../core/model'
import { wasAnalysed } from '../core/ownership'
import { rankAuthors } from '../core/ranking'
import type { AnalysisStore } from '../ports/storage'
import {
  findRepositoryRoot,
  isAncestor,
  pathsTouchedBetween,
  resolveHead,
} from '../utility/gitRepository'
import { type IgnoreRevs, resolveIgnoreRevs } from '../utility/ignoreRevs'
import {
  AuthorNormalizationService,
  type IdentityMerge,
} from './AuthorNormalizationService'
import {
  type AuthorPolicy,
  computeFingerprint,
  decideCacheUse,
  HEAD_KEY,
} from './CacheService'
import {
  type AnalysisContext,
  type AnalysisFailure,
  GitService,
} from './GitService'
import {
  type HistoryFailure,
  type HistoryRun,
  HistoryService,
} from './HistoryService'
import type { SnapshotInterval } from './snapshotSelection'

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
   * Off by default so that constructing this service never touches the user's
   * filesystem unless something asked it to -- which keeps the test suite from
   * scattering databases through ~/.cache.
   */
  useCache?: boolean
  /**
   * Ignore whatever is stored and analyse from the beginning, writing a fresh
   * cache afterwards. For when the numbers look wrong and the cache is the
   * first thing anyone suspects.
   */
  refresh?: boolean
  /**
   * How identities are matched. `strict` compares email addresses and nothing
   * else, which is the default; `loose` also guesses from names and addresses
   * that merely resemble each other.
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
   * Walk the history as well, and how.
   *
   * Absent means the ordinary analysis of HEAD and nothing more. Present
   * means reading the repository as it stood at points in the past, which
   * takes minutes on anything substantial -- so it is only ever here because
   * somebody asked for it.
   */
  history?: { interval: SnapshotInterval; maxSnapshots: number }
}

export class LineLordService {
  private db: LineLordDatabase
  private gitService: GitService
  private normalizationService: AuthorNormalizationService
  private store: AnalysisStore
  /** The analysis as values, loaded once initialization is complete. */
  private analysis: AnalysisData | null = null
  /** The history as values, and which revision it claims to describe. */
  private historyReading: HistoryReading = {
    history: { snapshots: [], cohortLines: [] },
    describes: null,
  }
  private initialized = false
  private currentRepoPath: string
  private useCache: boolean
  private refresh: boolean
  private authorPolicy: AuthorPolicy
  private extraIgnoreRevisions: string[]
  private concurrency: number | undefined
  private history: LineLordOptions['history']
  private historyRun: HistoryRun | null = null
  private ignoredRevisions: IgnoreRevs = {
    revisions: [],
    sources: { file: false, flag: false },
    unresolved: [],
  }
  private identityMerges: IdentityMerge[] = []
  private cacheLock: CacheLock | null = null
  private cacheStatus: CacheStatus = {
    mode: 'disabled',
    filesBlamed: 0,
    filesReused: 0,
  }

  constructor(
    repoPath: string,
    private largeFileThresholdBytes: number = 50 * 1024,
    options: LineLordOptions = {},
  ) {
    this.currentRepoPath = repoPath
    this.useCache = options.useCache ?? false
    this.refresh = options.refresh ?? false
    this.authorPolicy = options.authorPolicy ?? 'strict'
    this.extraIgnoreRevisions = options.ignoreRevisions ?? []
    this.concurrency = options.concurrency
    this.history = options.history
    this.db = createDatabase()
    this.gitService = new GitService(
      repoPath,
      this.db,
      this.largeFileThresholdBytes,
      options.concurrency,
    )
    this.normalizationService = new AuthorNormalizationService(this.db)
    this.store = createSqliteStore(this.db)
  }

  /** What the last run did: how much it read, how much it kept, and why. */
  getCacheStatus(): CacheStatus {
    return { ...this.cacheStatus }
  }

  /** Point every service at a different database. */
  private attachDatabase(db: LineLordDatabase, repoPath: string): void {
    this.db = db
    this.gitService = new GitService(
      repoPath,
      db,
      this.largeFileThresholdBytes,
      this.concurrency,
    )
    this.normalizationService = new AuthorNormalizationService(db)
    this.store = createSqliteStore(db)
  }

  /**
   * Open this repository's cache, or fall back to memory.
   *
   * Every failure here degrades rather than propagates. A cache is an
   * optimisation; a full disk, a read-only cache directory or a file written
   * by something else are all reasons to analyse from scratch, and none of
   * them are reasons to refuse to analyse at all.
   */
  private openCache(repositoryRoot: string): string | undefined {
    if (!this.useCache) return undefined

    const path = resolveCachePath(repositoryRoot)

    // Somebody else is already writing this one. SQLite would keep the file
    // intact, but two analyses interleaving would leave a fingerprint that
    // describes neither, so this run goes to memory and writes nothing.
    this.cacheLock = acquireCacheLock(path)
    if (!this.cacheLock) {
      this.attachDatabase(createDatabase(), repositoryRoot)
      return undefined
    }

    try {
      this.attachDatabase(createDatabase({ path }), repositoryRoot)
    } catch {
      this.releaseCacheLock()
      this.attachDatabase(createDatabase(), repositoryRoot)
      return undefined
    }

    // Age and eviction order come from the file's modification time, and a
    // run that reuses its cache writes nothing at all. Saying so explicitly
    // is what keeps a repository opened daily, but unchanged, from being
    // evicted for looking untouched.
    markCacheUsed(path)

    // Other repositories' caches are tidied here rather than on a timer,
    // because this is the only moment the program is reliably running. The
    // one about to be used is never a candidate.
    try {
      tidyCacheDirectory(path)
    } catch {
      // A directory that will not tidy is not a reason to stop.
    }

    return path
  }

  private releaseCacheLock(): void {
    this.cacheLock?.release()
    this.cacheLock = null
  }

  /**
   * Let go of anything still held.
   *
   * The lock is released as soon as an analysis finishes writing, so this is
   * only needed by a caller that abandons a run part-way.
   */
  close(): void {
    this.releaseCacheLock()
  }

  async initialize(
    onProgress?: (current: number, total: number, message: string) => void,
  ): Promise<void> {
    try {
      onProgress?.(0, 100, 'Initializing Git service...')

      const root =
        (await findRepositoryRoot(this.currentRepoPath).then((lookup) =>
          lookup.found ? lookup.root : null,
        )) ?? this.currentRepoPath
      const cachePath = this.openCache(root)
      const headSha = await resolveHead(root)

      // Before the cache decision, because which commits are being looked
      // past is part of what a stored analysis is an answer to; and before any
      // blame, because an entry git cannot resolve would make it refuse every
      // file rather than just that one.
      this.ignoredRevisions = await resolveIgnoreRevs(
        root,
        this.extraIgnoreRevisions,
      )
      this.gitService.lookPast(this.ignoredRevisions)

      const decision = await this.decideWhatToDo(root, headSha)
      this.cacheStatus = { ...decision.status, path: cachePath }

      if (decision.plan === 'reuse') {
        onProgress?.(100, 100, 'Reusing the stored analysis')
        await this.gitService.describeAnalysisWithoutRunning()
        this.identityMerges = await this.collectIdentityMerges()
        this.analysis = await this.store.loadAnalysis()
        this.historyReading = await this.readHistory()
        this.initialized = true
        return
      }

      const forwardProgress = (
        current: number,
        total: number,
        message: string,
      ) => onProgress?.((current / total) * 60, 100, message)

      const run =
        decision.plan === 'incremental'
          ? await this.gitService.updateIncrementally(
              decision.touched,
              forwardProgress,
            )
          : await this.runFullAnalysis(forwardProgress)

      this.cacheStatus = {
        ...this.cacheStatus,
        filesBlamed: run.blamed,
        filesReused: run.reused,
      }

      onProgress?.(60, 100, 'Normalizing authors...')
      // Merging identities and ranking them are decisions about the whole
      // repository, so they cannot be updated in part: both run again after
      // any change, however small.
      await this.normalizationService.normalizeAllAuthors(this.authorPolicy)
      this.identityMerges = await this.collectIdentityMerges()

      onProgress?.(80, 100, 'Calculating ranks and percentages...')
      await this.store.updateAuthors(
        rankAuthors(await this.store.loadAnalysis()),
      )
      this.analysis = await this.store.loadAnalysis()
      this.historyReading = await this.readHistory()

      if (cachePath && headSha) {
        await this.recordFingerprint(root, headSha)
      }

      onProgress?.(100, 100, 'Initialization complete!')
      this.initialized = true
    } catch (error) {
      this.initialized = false
      throw error
    } finally {
      // The lock covers writing the cache, which is over by now. Holding it
      // for the life of the interface would mean a user browsing menus keeps
      // every other LineLord out of that repository, and a process that exits
      // without unwinding leaves the file behind for ten minutes.
      this.releaseCacheLock()
    }
  }

  /** Empty whatever was stored and analyse the repository from the beginning. */
  private async runFullAnalysis(
    onProgress?: (current: number, total: number, message: string) => void,
  ) {
    clearDatabase(this.db)
    return await this.gitService.initialize(onProgress)
  }

  /**
   * Decide between reusing, updating and rebuilding.
   *
   * Every branch that cannot be reasoned about ends in a full analysis. That
   * is not caution for its own sake: a needless rebuild costs seconds, while a
   * cache reused when it should not have been puts numbers on screen that look
   * exactly like correct ones.
   */
  private async decideWhatToDo(
    root: string,
    headSha: string | null,
  ): Promise<
    | { plan: 'reuse'; status: CacheStatus }
    | { plan: 'full'; status: CacheStatus }
    | { plan: 'incremental'; touched: Set<string>; status: CacheStatus }
  > {
    const full = (reason?: string): { plan: 'full'; status: CacheStatus } => ({
      plan: 'full',
      status: {
        mode: this.useCache ? 'full' : 'disabled',
        filesBlamed: 0,
        filesReused: 0,
        reason,
      },
    })

    if (!this.useCache || !headSha) return full()

    if (this.refresh) {
      return full('you asked for a fresh analysis')
    }

    let decision: ReturnType<typeof decideCacheUse>
    try {
      decision = decideCacheUse(
        readAllMeta(this.db),
        await computeFingerprint({
          repositoryRoot: root,
          headSha,
          thresholdBytes: this.largeFileThresholdBytes,
          authorPolicy: this.authorPolicy,
          ignoredRevisions: this.ignoredRevisions.revisions,
        }),
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
      const kept = await this.countStoredFiles()
      return {
        plan: 'reuse',
        status: { mode: 'reused', filesBlamed: 0, filesReused: kept },
      }
    }

    // The revision moved. Only forwards can be updated: a rebase, a force-push
    // or a branch switch leaves no way to tell what survived.
    const ancestry = await isAncestor(root, decision.storedHeadSha, headSha)
    if (ancestry !== true) {
      // Two different situations, and the message should not assert the wrong
      // one. Either history genuinely moved sideways, or git could not answer
      // -- an unknown revision, most likely, which a pruned or damaged
      // repository produces just as readily as a rebase does.
      return full(
        ancestry === false
          ? 'the history was rewritten or a different branch checked out'
          : 'the stored revision could not be found in this repository',
      )
    }

    try {
      const touched = await pathsTouchedBetween(
        root,
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

  private async countStoredFiles(): Promise<number> {
    return (await this.store.listFiles()).filter(wasAnalysed).length
  }

  /**
   * Record what this analysis was built from.
   *
   * The revision goes last and on its own. A run interrupted part-way leaves
   * the cache still claiming the revision it held before, so the next run asks
   * for the same interval again and repairs itself -- which works because
   * re-reading a file discards its stored lines first.
   */
  private async recordFingerprint(
    root: string,
    headSha: string,
  ): Promise<void> {
    const fingerprint = await computeFingerprint({
      repositoryRoot: root,
      headSha,
      thresholdBytes: this.largeFileThresholdBytes,
      authorPolicy: this.authorPolicy,
      ignoredRevisions: this.ignoredRevisions.revisions,
    })

    const { [HEAD_KEY]: head, ...rest } = fingerprint
    writeMeta(this.db, { ...rest, analyzed_at: String(Date.now()) })
    writeMeta(this.db, { [HEAD_KEY]: head ?? headSha })
  }

  getCurrentRepoPath(): string {
    return this.currentRepoPath
  }

  isInitialized(): boolean {
    return this.initialized
  }

  /** The analysis as values, for the core's functions to answer questions over. */
  getAnalysis(): AnalysisData {
    if (!this.initialized || this.analysis === null) {
      throw new Error(
        'LineLordService must be initialized before the analysis can be read',
      )
    }
    return this.analysis
  }

  getDatabase(): LineLordDatabase {
    return this.db
  }

  /** Which revision the numbers describe, and how much of the working copy they leave out. */
  getAnalysisContext(): AnalysisContext {
    return this.gitService.getAnalysisContext()
  }

  /** Files the analysis could not read. Empty when everything was analysed. */
  getFailures(): AnalysisFailure[] {
    return this.gitService.getFailures()
  }

  /** Whether this run was asked to walk the history. */
  wantsHistory(): boolean {
    return this.history !== undefined
  }

  /**
   * Walk the history, under exactly the settings the present was read with.
   *
   * Constructed here rather than by the caller so that the threshold, the
   * commits being looked past and the batch size cannot drift apart from the
   * ones the analysis of HEAD used. A history measured under different rules
   * than the present it is drawn beside would be two answers to two
   * questions, presented as one.
   */
  async gatherHistory(
    onProgress?: (current: number, total: number, message: string) => void,
  ): Promise<HistoryRun | null> {
    if (!this.history) return null

    const root =
      (await findRepositoryRoot(this.currentRepoPath).then((lookup) =>
        lookup.found ? lookup.root : null,
      )) ?? this.currentRepoPath

    // initialize lets the lock go as soon as it has finished writing, so that
    // somebody browsing menus does not keep every other LineLord out. The
    // walk writes too -- it empties the snapshot tables and fills them again
    // -- so it has to hold the lock for itself, or two histories interleave
    // into one database and leave a set of snapshots describing neither.
    const lockPath = this.useCache ? resolveCachePath(root) : null
    const lock = lockPath ? acquireCacheLock(lockPath) : null
    if (lockPath && !lock) {
      throw new Error(
        'Another LineLord is analysing this repository. Reading the history ' +
          'writes to the same stored analysis, so this run has stopped rather ' +
          'than interleave with it.',
      )
    }

    try {
      const run = await new HistoryService(root, this.db, {
        thresholdBytes: this.largeFileThresholdBytes,
        ignoredRevisions: this.ignoredRevisions.revisions,
        concurrency: this.concurrency,
        interval: this.history.interval,
        maxSnapshots: this.history.maxSnapshots,
      }).analyse(onProgress)
      this.historyRun = run
      this.historyReading = await this.readHistory()
      return run
    } finally {
      lock?.release()
    }
  }

  /** What the store holds of the history, and which revision it says it is about. */
  private async readHistory(): Promise<HistoryReading> {
    const meta = await this.store.readMeta()
    return {
      history: await this.store.loadHistory(),
      describes: meta[HISTORY_HEAD_KEY] ?? null,
    }
  }

  /** The history as values, for the core's functions to answer questions over. */
  getHistory(): HistoryReading {
    return this.historyReading
  }

  /**
   * Files the history could not read, if it was walked.
   *
   * A file that fails contributes no lines, which understates the snapshot it
   * belongs to -- so a history that completed is not the same as a history
   * that is whole, and the interface should be able to tell them apart.
   */
  getHistoryFailures(): HistoryFailure[] {
    return this.historyRun?.failures ?? []
  }

  /** How many revisions the history read, or zero if it was not walked. */
  getHistorySnapshotCount(): number {
    return this.historyRun?.snapshots ?? 0
  }

  /**
   * Identities that are, or may be, one person -- and why.
   *
   * Under the default policy nothing is merged, so this is what a guessing run
   * *would* have merged: the only way a user looking at two entries for one
   * person learns that LineLord noticed. Under `--fuzzy-authors` the merging
   * has already happened and this is the record of every assumption taken.
   *
   * Worked out during initialization, including on a reused run, so that the
   * interface can ask for it while rendering.
   */
  getIdentityMerges(): IdentityMerge[] {
    return this.identityMerges
  }

  /**
   * Ask the normalization service which identities belong together.
   *
   * Read-only under either policy: after guessing, the merges are read back
   * from the alias rows the merging wrote, which the cache keeps; without it,
   * the guessing is run as a question and its answer discarded. Either way a
   * run that reused its cache -- and so never normalised anything -- answers
   * the same as the run that did the work.
   */
  private async collectIdentityMerges(): Promise<IdentityMerge[]> {
    try {
      return this.authorPolicy === 'loose'
        ? await this.normalizationService.describeExistingMerges()
        : await this.normalizationService.findIdentityGuesses()
    } catch {
      // A warning nobody can render is not worth failing an analysis over.
      return []
    }
  }
}
