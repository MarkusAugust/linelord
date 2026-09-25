import type { AnalysisStore } from './storage'

/** The right to write one repository's stored analysis, until released. */
export interface CacheLock {
  release(): void
}

export interface OpenedStore {
  store: AnalysisStore
  /** Where the store lives on disk, when it does. */
  path?: string
  /**
   * The lock taken on opening, when the store is on disk. Released as soon
   * as the analysis has finished writing: holding it for the life of the
   * interface would keep every other LineLord out of the repository while
   * somebody browses menus.
   */
  lock: CacheLock | null
}

/**
 * Where a repository's analysis is kept.
 *
 * On disk when a cache is wanted and can be had, and in memory otherwise:
 * somebody else writing the same cache, a directory that cannot be used, a
 * file another program wrote. Every one of those is a reason to analyse
 * from scratch and none of them a reason to refuse, so the fallback is the
 * adapter's business and the caller only learns whether it got a path.
 */
export interface StoreProvider {
  open(repositoryRoot: string, useCache: boolean): OpenedStore
  /** Claim the right to write the repository's cache again, or null if someone else holds it. */
  lock(repositoryRoot: string): CacheLock | null
}
