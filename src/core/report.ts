/**
 * The analysis as one value another program can read.
 *
 * `--json` exists so the demo site can be built from LineLord's own numbers
 * rather than from a second implementation of them. Everything here is derived
 * by the same functions the screens call, so the site and the terminal cannot
 * disagree: this module chooses names and assembles, and computes nothing.
 *
 * The shape is something callers depend on, so `REPORT_SCHEMA_VERSION` says
 * which one they got, and changing a field is a change to behaviour.
 */

import type { AnalysisContext, AnalysisFailure } from './analyse'
import { type BarbarianRanking, barbarianRankings } from './barbarian'
import { HONESTY_NOTES } from './honestyNotes'
import type { IdentityMerge } from './identity'
import {
  type AuthorLongevity,
  type AuthorSurvivalWithIdentity,
  ageOfAuthors,
  ageOfRepository,
  type HistoryReading,
  type RepositoryLongevity,
  survivalByAuthor,
} from './longevity'
import type { AnalysisData } from './model'
import {
  type AuthorContribution,
  authorContributions,
  repositoryStats,
} from './ownership'

/**
 * Bumped when a field changes meaning or leaves. Added fields do not bump it:
 * a caller reading the fields it knows is unaffected by a new one beside them.
 */
export const REPORT_SCHEMA_VERSION = 1

export interface ReportOptions {
  /** The date every age is measured against, so a report is reproducible. */
  now: Date
  /** LineLord's own version, for a caller that cares which one wrote this. */
  version: string
  repoPath: string
  context: AnalysisContext
  identityMerges: IdentityMerge[]
  /** Present only when `--history` walked it. */
  history?: HistoryReading | null
  failures?: AnalysisFailure[]
}

export interface ReportFileCounts {
  total: number
  analysed: number
  binary: number
  ignored: number
  large: number
  failed: number
  totalLines: number
  totalAuthors: number
}

export interface ReportRepository {
  path: string
  headSha: string | null
  uncommittedFileCount: number
  ignoredRevisionCount: number
  ignoreRevSources: { file: boolean; flag: boolean }
  unresolvedIgnoreRevs: AnalysisContext['unresolvedIgnoreRevs']
}

export interface ReportHistory {
  /**
   * The revision the walk describes. A history about some other revision is a
   * curve about a repository that has since changed, which is why the caller
   * is told rather than left to assume it matches `repository.headSha`.
   */
  describes: string | null
  snapshotCount: number
  authors: AuthorSurvivalWithIdentity[]
}

export interface Report {
  schemaVersion: number
  linelord: string
  generatedAt: string
  repository: ReportRepository
  files: ReportFileCounts
  contributors: AuthorContribution[]
  rankings: BarbarianRanking[]
  longevity: {
    repository: RepositoryLongevity
    authors: AuthorLongevity[]
  }
  identityCandidates: IdentityMerge[]
  /** Files that were meant to be read and could not be. */
  failures: AnalysisFailure[]
  history: ReportHistory | null
  /**
   * What the numbers are not, in the words the screens use. Carried here
   * because a payload another program reads is exactly where a count of lines
   * is most likely to be presented as a measure of a person.
   */
  disclaimer: readonly string[]
}

export function buildReport(
  data: AnalysisData,
  options: ReportOptions,
): Report {
  const { now, context, history } = options
  const stats = repositoryStats(data)

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    linelord: options.version,
    generatedAt: now.toISOString(),

    repository: {
      path: options.repoPath,
      headSha: context.headSha,
      uncommittedFileCount: context.uncommittedFileCount,
      ignoredRevisionCount: context.ignoredRevisionCount,
      ignoreRevSources: context.ignoreRevSources,
      unresolvedIgnoreRevs: context.unresolvedIgnoreRevs,
    },

    files: {
      total: stats.totalFiles,
      analysed: stats.totalAnalyzedFiles,
      binary: stats.totalBinaryFiles,
      ignored: stats.totalIgnoredFiles,
      large: stats.totalLargeFiles,
      failed: stats.totalFailedFiles,
      totalLines: stats.totalLines,
      totalAuthors: stats.totalAuthors,
    },

    contributors: authorContributions(data),
    rankings: barbarianRankings(data, now),

    longevity: {
      repository: ageOfRepository(data, now),
      authors: ageOfAuthors(data, now),
    },

    identityCandidates: options.identityMerges,
    failures: options.failures ?? [],

    history:
      history && history.history.snapshots.length > 0
        ? {
            describes: history.describes,
            snapshotCount: history.history.snapshots.length,
            authors: survivalByAuthor(history.history, data.authors),
          }
        : null,

    disclaimer: HONESTY_NOTES.rankings.lines,
  }
}
