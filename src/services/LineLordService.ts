import { resolveCachePath } from '../db/cacheLocation'
import {
  acquireCacheLock,
  type CacheLock,
  markCacheUsed,
  tidyCacheDirectory,
} from '../db/cacheMaintenance'
import {
  clearDatabase,
  createDatabase,
  type LineLordDatabase,
} from '../db/database'
import { readAllMeta, writeMeta } from '../db/meta'
import {
  findRepositoryRoot,
  isAncestor,
  pathsTouchedBetween,
  resolveHead,
} from '../utility/gitRepository'
import { AnalysisService } from './AnalysisService'
import { AuthorNormalizationService } from './AuthorNormalizationService'
import { AuthorRankingService } from './AuthorRankingService'
import { computeFingerprint, decideCacheUse, HEAD_KEY } from './CacheService'
import {
  type AnalysisContext,
  type AnalysisFailure,
  GitService,
} from './GitService'

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
}

export class LineLordService {
  private db: LineLordDatabase
  private gitService: GitService
  private normalizationService: AuthorNormalizationService
  private rankingService: AuthorRankingService
  private analysisService: AnalysisService
  private initialized = false
  private currentRepoPath: string
  private useCache: boolean
  private refresh: boolean
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
    this.db = createDatabase()
    this.gitService = new GitService(
      repoPath,
      this.db,
      this.largeFileThresholdBytes,
    )
    this.normalizationService = new AuthorNormalizationService(this.db)
    this.rankingService = new AuthorRankingService(this.db)
    this.analysisService = new AnalysisService(this.db)
  }

  /** What the last run did: how much it read, how much it kept, and why. */
  getCacheStatus(): CacheStatus {
    return { ...this.cacheStatus }
  }

  /** Point every service at a different database. */
  private attachDatabase(db: LineLordDatabase, repoPath: string): void {
    this.db = db
    this.gitService = new GitService(repoPath, db, this.largeFileThresholdBytes)
    this.normalizationService = new AuthorNormalizationService(db)
    this.rankingService = new AuthorRankingService(db)
    this.analysisService = new AnalysisService(db)
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

      const decision = await this.decideWhatToDo(root, headSha)
      this.cacheStatus = { ...decision.status, path: cachePath }

      if (decision.plan === 'reuse') {
        onProgress?.(100, 100, 'Reusing the stored analysis')
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
      await this.normalizationService.normalizeAllAuthors()

      onProgress?.(80, 100, 'Calculating ranks and percentages...')
      await this.rankingService.calculateAndAssignRanksAndPercentages()

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
          authorPolicy: 'loose',
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
    return (await this.analysisService.getRepositoryStats()).totalAnalyzedFiles
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
      authorPolicy: 'loose',
    })

    const { [HEAD_KEY]: head, ...rest } = fingerprint
    writeMeta(this.db, { ...rest, analyzed_at: String(Date.now()) })
    writeMeta(this.db, { [HEAD_KEY]: head ?? headSha })
  }

  async changeRepository(
    newRepoPath: string,
    onProgress?: (current: number, total: number, message: string) => void,
    newThresholdBytes?: number,
  ): Promise<void> {
    onProgress?.(0, 100, 'Switching repositories...')

    // The database being left behind is the previous repository's cache, and
    // emptying it would throw away an analysis the user paid for and may come
    // back to. Detaching is enough: initialize opens whichever database the
    // new repository should use.

    // Update the repository path and threshold if provided
    this.currentRepoPath = newRepoPath
    if (newThresholdBytes) {
      this.largeFileThresholdBytes = newThresholdBytes
    }

    // A different repository has a different cache. Pointing the services at
    // the new path while still holding the old database would analyse one
    // repository into another's file.
    this.releaseCacheLock()
    this.attachDatabase(createDatabase(), newRepoPath)

    // Mark as uninitialized
    this.initialized = false

    onProgress?.(10, 100, 'Initializing new repository...')

    // Initialize with the new repository
    await this.initialize((current, total, message) => {
      // Map initialization progress to 10-100% of total progress
      const adjustedCurrent = 10 + (current / total) * 90
      onProgress?.(adjustedCurrent, 100, message)
    })
  }

  getCurrentRepoPath(): string {
    return this.currentRepoPath
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getAnalysisService(): AnalysisService {
    if (!this.initialized) {
      throw new Error(
        'LineLordService must be initialized before getting analysis service',
      )
    }
    return this.analysisService
  }

  getRankingService(): AuthorRankingService {
    if (!this.initialized) {
      throw new Error(
        'LineLordService must be initialized before getting ranking service',
      )
    }
    return this.rankingService
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
}
