/**
 * What an analysis is made of, as plain values.
 *
 * These are the records the storage port hands the core, and everything the
 * screens show is computed from them by functions that know nothing about
 * where they were kept. A record here is a row that has been read, not a
 * handle to one: changing a field changes nothing anywhere else.
 */

export interface FileRecord {
  id: number
  path: string
  /** Lower-cased, with the dot, or null for a file without one. */
  extension: string | null
  /** Size of the blob in the analysed revision, in bytes. */
  size: number
  isBinary: boolean
  isIgnored: boolean
  isLargerThanThreshold: boolean
  /** Blame could not be read for this file, so it contributed no lines. */
  analysisFailed: boolean
  /** Lines that were counted, which excludes blank ones. */
  totalLines: number
}

export interface AuthorRecord {
  id: number
  name: string
  email: string
  displayName: string
  /** The identity this one has been folded into, which is itself when canonical. */
  canonicalId: number | null
  isCanonical: boolean
  title: string | null
  rank: number | null
  percentage: number
}

/** One identity that was folded into another by identity matching. */
export interface AliasRecord {
  canonicalAuthorId: number
  aliasName: string
  aliasEmail: string
}

export interface BlameLineRecord {
  /**
   * Assigned in the order lines were stored, and never reused. Ties on age
   * are broken by it, so that two runs over the same repository give the
   * same oldest line.
   */
  id: number
  fileId: number
  authorId: number
  /** Line number in the analysed revision, counting from 1. */
  lineNumber: number
  commitHash: string | null
  /** Author time of the commit, in whole seconds since the epoch. */
  commitTimestamp: number | null
}

/** Everything the analysis of one revision recorded. */
export interface AnalysisData {
  files: FileRecord[]
  authors: AuthorRecord[]
  aliases: AliasRecord[]
  /** In id order. */
  lines: BlameLineRecord[]
}

/** The repository as it stood at one sampled revision. */
export interface SnapshotRecord {
  id: number
  commitSha: string
  /** Committer time of the sampled commit, in whole seconds. */
  snapshotTimestamp: number
  totalLines: number
}

/** How many lines an author wrote in one month were still alive at one snapshot. */
export interface CohortLineRecord {
  snapshotId: number
  authorId: number
  /** Start of the month the lines were written, in whole seconds. */
  cohortMonth: number
  lineCount: number
}

/** Everything the history walk recorded. */
export interface HistoryData {
  snapshots: SnapshotRecord[]
  cohortLines: CohortLineRecord[]
}

export const EMPTY_ANALYSIS: AnalysisData = {
  files: [],
  authors: [],
  aliases: [],
  lines: [],
}
