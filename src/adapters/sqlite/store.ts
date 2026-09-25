import { eq, inArray, sql } from 'drizzle-orm'
import type {
  AliasRecord,
  AnalysisData,
  AuthorRecord,
  FileRecord,
  HistoryData,
} from '../../core/model'
import type { AnalysisStore } from '../../ports/storage'
import {
  clearDatabase,
  type LineLordDatabase,
  SCHEMA_VERSION,
} from './database'
import { readAllMeta, writeMeta } from './meta'
import {
  authorAliases,
  authors,
  blameLines,
  cohortLines,
  files,
  meta,
  snapshots,
} from './schema'

/**
 * Rows per insert statement. Five columns each, so 500 rows binds 2,500
 * parameters -- comfortably inside what SQLite accepts, with room for the
 * schema to gain a column without anyone having to remember this number.
 */
const BLAME_INSERT_CHUNK = 500

/** Rows per file-table insert, for the same reason as BLAME_INSERT_CHUNK. */
const FILE_WRITE_CHUNK = 200

/**
 * A stored NULL in a boolean column is not false. In SQLite `NULL = false`
 * is NULL rather than true, so a row left that way would match none of the
 * category questions asked of it. Read as false, which is what the column's
 * default means.
 */
const flag = (value: boolean | null): boolean => value === true

function toFileRecord(row: typeof files.$inferSelect): FileRecord {
  return {
    id: row.id,
    path: row.path,
    extension: row.extension,
    size: row.size ?? 0,
    isBinary: flag(row.isBinary),
    isIgnored: flag(row.isIgnored),
    isLargerThanThreshold: flag(row.isLargerThanThreshold),
    analysisFailed: flag(row.analysisFailed),
    totalLines: row.totalLines ?? 0,
  }
}

function toAuthorRecord(row: typeof authors.$inferSelect): AuthorRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    displayName: row.displayName,
    canonicalId: row.canonicalId,
    isCanonical: flag(row.isCanonical),
    title: row.title,
    rank: row.rank,
    percentage: row.percentage ?? 0,
  }
}

/** The storage port over the SQLite database LineLord has always kept. */
export function createSqliteStore(db: LineLordDatabase): AnalysisStore {
  const listFiles = async (): Promise<FileRecord[]> =>
    (await db.select().from(files)).map(toFileRecord)

  const listAuthors = async (): Promise<AuthorRecord[]> =>
    (await db.select().from(authors)).map(toAuthorRecord)

  const listAliases = async (): Promise<AliasRecord[]> =>
    (await db.select().from(authorAliases)).map((row) => ({
      canonicalAuthorId: row.canonicalAuthorId,
      aliasName: row.aliasName,
      aliasEmail: row.aliasEmail,
    }))

  return {
    layoutVersion: String(SCHEMA_VERSION),

    async loadAnalysis(): Promise<AnalysisData> {
      const lines = (
        await db.select().from(blameLines).orderBy(blameLines.id)
      ).map((row) => ({
        id: row.id,
        fileId: row.fileId,
        authorId: row.authorId,
        lineNumber: row.lineNumber,
        commitHash: row.commitHash,
        commitTimestamp: row.commitTimestamp,
      }))
      return {
        files: await listFiles(),
        authors: await listAuthors(),
        aliases: await listAliases(),
        lines,
      }
    },

    async loadHistory(): Promise<HistoryData> {
      return {
        snapshots: await db.select().from(snapshots).orderBy(snapshots.id),
        cohortLines: (await db.select().from(cohortLines)).map((row) => ({
          snapshotId: row.snapshotId,
          authorId: row.authorId,
          cohortMonth: row.cohortMonth,
          lineCount: row.lineCount,
        })),
      }
    },

    listFiles,

    async reconcileFiles(plan) {
      db.transaction((tx) => {
        for (let at = 0; at < plan.insert.length; at += FILE_WRITE_CHUNK) {
          tx.insert(files)
            .values(
              plan.insert.slice(at, at + FILE_WRITE_CHUNK).map((file) => ({
                ...file,
                totalLines: 0,
                analysisFailed: false,
              })),
            )
            .onConflictDoNothing()
            .run()
        }
        for (const { id, changes } of plan.update) {
          tx.update(files).set(changes).where(eq(files.id, id)).run()
        }
        // A file that has left the tree takes its blame with it, or its lines
        // would go on counting towards an author's total for a file that is
        // not there.
        for (const id of plan.remove) {
          tx.delete(blameLines).where(eq(blameLines.fileId, id)).run()
          tx.delete(files).where(eq(files.id, id)).run()
        }
      })
    },

    async forgetBlame(fileIds) {
      if (fileIds.length === 0) return
      db.transaction((tx) => {
        for (const id of fileIds) {
          tx.delete(blameLines).where(eq(blameLines.fileId, id)).run()
          tx.update(files)
            .set({ totalLines: 0, analysisFailed: false })
            .where(eq(files.id, id))
            .run()
        }
      })
    },

    async markAnalysisFailed(fileId) {
      await db
        .update(files)
        .set({ analysisFailed: true })
        .where(eq(files.id, fileId))
    },

    async storeBlame(fileId, lines) {
      // Each row binds five values, and one statement for a long file asks
      // SQLite to bind more parameters than it accepts. A 10,000-line file
      // used to store all of its lines and a 20,000-line file none of them.
      db.transaction((tx) => {
        for (let at = 0; at < lines.length; at += BLAME_INSERT_CHUNK) {
          tx.insert(blameLines)
            .values(
              lines
                .slice(at, at + BLAME_INSERT_CHUNK)
                .map((line) => ({ fileId, ...line })),
            )
            .run()
        }
        tx.update(files)
          .set({ totalLines: lines.length })
          .where(eq(files.id, fileId))
          .run()
      })
    },

    listAuthors,

    async ensureAuthors(identities) {
      const ids = new Map<string, number>()
      for (const identity of identities) {
        // Idempotent: the conflict clause is a no-op update rather than DO
        // NOTHING, so RETURNING still yields the row whichever caller put it
        // there. The canonical id is only set on a row that has none, so an
        // address identity matching has already folded into another stays
        // folded.
        const [row] = await db
          .insert(authors)
          .values({ ...identity, isCanonical: true })
          .onConflictDoUpdate({
            target: authors.email,
            set: { email: sql`excluded.email` },
          })
          .returning({ id: authors.id, canonicalId: authors.canonicalId })
        if (!row) throw new Error(`Failed to store author ${identity.email}`)
        if (row.canonicalId === null) {
          await db
            .update(authors)
            .set({ canonicalId: row.id })
            .where(eq(authors.id, row.id))
        }
        ids.set(identity.email, row.id)
      }
      return ids
    },

    async updateAuthors(changes) {
      if (changes.length === 0) return
      db.transaction((tx) => {
        for (const { id, changes: patch } of changes) {
          tx.update(authors).set(patch).where(eq(authors.id, id)).run()
        }
      })
    },

    async replaceAliases(aliases) {
      db.transaction((tx) => {
        tx.delete(authorAliases).run()
        if (aliases.length > 0) {
          tx.insert(authorAliases)
            .values(aliases.map((alias) => ({ ...alias, similarity: 100 })))
            .run()
        }
      })
    },

    async reassignBlame(fromAuthorId, toAuthorId) {
      await db
        .update(blameLines)
        .set({ authorId: toAuthorId })
        .where(eq(blameLines.authorId, fromAuthorId))
    },

    async readMeta() {
      return readAllMeta(db)
    },

    async writeMeta(entries) {
      writeMeta(db, entries)
    },

    async deleteMeta(keys) {
      if (keys.length === 0) return
      await db.delete(meta).where(inArray(meta.key, keys))
    },

    async clearHistory() {
      db.transaction((tx) => {
        tx.delete(cohortLines).run()
        tx.delete(snapshots).run()
      })
    },

    async storeSnapshot(snapshot, cohorts) {
      db.transaction((tx) => {
        const [stored] = tx
          .insert(snapshots)
          .values(snapshot)
          .returning({ id: snapshots.id })
          .all()
        if (!stored) return
        for (const cohort of cohorts) {
          tx.insert(cohortLines)
            .values({ snapshotId: stored.id, ...cohort })
            .run()
        }
      })
    },

    async clear() {
      clearDatabase(db)
    },
  }
}
