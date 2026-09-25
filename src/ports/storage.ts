import type {
  AliasRecord,
  AnalysisData,
  AuthorRecord,
  FileRecord,
  HistoryData,
} from '../core/model'

/**
 * Where an analysis is kept between runs, and how it is written during one.
 *
 * Persistence and nothing else. Every question asked of the data -- who holds
 * what, how old it is, who leads which ranking -- is answered by functions in
 * the core over the values `loadAnalysis` returns, so the adapter behind this
 * can be SQLite on disk, SQLite in memory or a handful of arrays, and the
 * numbers come out the same. The contract test under `ports/__test__` is
 * what says so, and every adapter has to pass it.
 */

/** A file as discovery found it, before any blame has been read. */
export interface NewFile {
  path: string
  extension: string | null
  size: number
  isBinary: boolean
  isIgnored: boolean
  isLargerThanThreshold: boolean
}

/** The parts of a stored file that discovery may find have moved. */
export type FileChanges = Partial<
  Pick<FileRecord, 'size' | 'isBinary' | 'isIgnored' | 'isLargerThanThreshold'>
>

/**
 * What discovery decided about the stored files.
 *
 * Reconciled rather than replaced, because blame lines reference files by id:
 * deleting and reinserting would renumber them and orphan every line
 * belonging to a file nobody touched. A removed file takes its lines with it.
 */
export interface FilePlan {
  insert: NewFile[]
  update: Array<{ id: number; changes: FileChanges }>
  remove: number[]
}

export interface NewBlameLine {
  authorId: number
  lineNumber: number
  commitHash: string | null
  commitTimestamp: number | null
}

export interface AuthorIdentity {
  name: string
  email: string
  displayName: string
}

export type AuthorChanges = Partial<
  Pick<
    AuthorRecord,
    | 'displayName'
    | 'canonicalId'
    | 'isCanonical'
    | 'title'
    | 'rank'
    | 'percentage'
  >
>

export interface NewSnapshot {
  commitSha: string
  snapshotTimestamp: number
  totalLines: number
}

export interface NewCohortLine {
  authorId: number
  cohortMonth: number
  lineCount: number
}

export interface AnalysisStore {
  /**
   * How the tables are laid out, for the cache fingerprint. A store written
   * under another layout is thrown out rather than read.
   */
  readonly layoutVersion: string
  /** Everything the analysis recorded, as values. */
  loadAnalysis(): Promise<AnalysisData>
  /** Everything the history walk recorded, as values. */
  loadHistory(): Promise<HistoryData>

  listFiles(): Promise<FileRecord[]>
  /** Apply what discovery decided. Removing a file removes its lines. */
  reconcileFiles(plan: FilePlan): Promise<void>
  /**
   * Drop the lines of files about to be read again, and the failure they may
   * carry from last time. Without this a re-read file would own both its old
   * lines and its new ones.
   */
  forgetBlame(fileIds: number[]): Promise<void>
  /** Record that blame could not be read for a file. */
  markAnalysisFailed(fileId: number): Promise<void>
  /**
   * Store one file's lines and its line count together, so that a failure
   * part-way cannot leave a file claiming a total it does not have.
   */
  storeBlame(fileId: number, lines: NewBlameLine[]): Promise<void>

  listAuthors(): Promise<AuthorRecord[]>
  /**
   * The id each address belongs to, creating a canonical author for any
   * address not seen before. Idempotent: an address that exists keeps its row
   * and everything identity matching has decided about it.
   */
  ensureAuthors(identities: AuthorIdentity[]): Promise<Map<string, number>>
  updateAuthors(
    changes: Array<{ id: number; changes: AuthorChanges }>,
  ): Promise<void>
  /** The aliases are derived entirely from one matching run, so they are replaced, not added to. */
  replaceAliases(aliases: AliasRecord[]): Promise<void>
  /** Move every line one author holds to another. */
  reassignBlame(fromAuthorId: number, toAuthorId: number): Promise<void>

  readMeta(): Promise<Record<string, string>>
  /** Write keys, replacing any already there, in one step. */
  writeMeta(entries: Record<string, string>): Promise<void>
  deleteMeta(keys: string[]): Promise<void>

  clearHistory(): Promise<void>
  /** One snapshot and its cohort rows, together or not at all. */
  storeSnapshot(snapshot: NewSnapshot, cohorts: NewCohortLine[]): Promise<void>

  /** Empty everything, meta included. */
  clear(): Promise<void>
}
