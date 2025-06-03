import {
  type LineLordDatabase,
  clearDatabase,
  createDatabase,
} from '../db/database'
import { AnalysisService } from './AnalysisService'
import { AuthorNormalizationService } from './AuthorNormalizationService'
import { AuthorRankingService } from './AuthorRankingService'
import { GitService } from './GitService'

export class LineLordService {
  private db: LineLordDatabase
  private gitService: GitService
  private normalizationService: AuthorNormalizationService
  private rankingService: AuthorRankingService
  private analysisService: AnalysisService
  private initialized = false
  private currentRepoPath: string

  constructor(
    repoPath: string,
    private largeFileThresholdBytes: number = 50 * 1024,
  ) {
    this.currentRepoPath = repoPath
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

  async initialize(
    onProgress?: (current: number, total: number, message: string) => void,
  ): Promise<void> {
    try {
      onProgress?.(0, 100, 'Initializing Git service...')

      // Step 1: Initialize git service (this populates the database with raw data)
      await this.gitService.initialize((current, total, message) => {
        // Map git service progress to 0-60% of total progress
        const adjustedCurrent = (current / total) * 60
        onProgress?.(adjustedCurrent, 100, message)
      })

      onProgress?.(60, 100, 'Normalizing authors...')

      // Step 2: Normalize authors (merge duplicates, clean up data)
      await this.normalizationService.normalizeAllAuthors()

      onProgress?.(80, 100, 'Calculating ranks and percentages...')

      // Step 3: Calculate and assign ranks, percentages, and titles
      // This MUST happen AFTER normalization since it works with canonical authors
      await this.rankingService.calculateAndAssignRanksAndPercentages()

      onProgress?.(100, 100, 'Initialization complete!')
      this.initialized = true
    } catch (error) {
      this.initialized = false
      throw error
    }
  }

  async changeRepository(
    newRepoPath: string,
    onProgress?: (current: number, total: number, message: string) => void,
    newThresholdBytes?: number,
  ): Promise<void> {
    onProgress?.(0, 100, 'Clearing old repository data...')

    // Clear the existing database
    clearDatabase(this.db)

    // Update the repository path and threshold if provided
    this.currentRepoPath = newRepoPath
    if (newThresholdBytes) {
      this.largeFileThresholdBytes = newThresholdBytes
    }

    // Recreate services with new path and threshold
    this.gitService = new GitService(
      newRepoPath,
      this.db,
      this.largeFileThresholdBytes,
    )
    this.normalizationService = new AuthorNormalizationService(this.db)
    this.rankingService = new AuthorRankingService(this.db)
    this.analysisService = new AnalysisService(this.db)

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
}
