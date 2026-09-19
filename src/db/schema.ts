import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const authors = sqliteTable('authors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  canonicalId: integer('canonical_id'),
  isCanonical: integer('is_canonical', { mode: 'boolean' }).default(false),
  title: text('title'),
  rank: integer('rank'),
  percentage: real('percentage').default(0),
})

export const authorAliases = sqliteTable('author_aliases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  canonicalAuthorId: integer('canonical_author_id')
    .notNull()
    .references(() => authors.id),
  aliasName: text('alias_name').notNull(),
  aliasEmail: text('alias_email').notNull(),
  similarity: integer('similarity').default(100),
})

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  extension: text('extension'),
  size: integer('size'),
  isLargerThanThreshold: integer('is_larger_than_threshold', {
    mode: 'boolean',
  }).default(false),
  isBinary: integer('is_binary', { mode: 'boolean' }).default(false),
  isIgnored: integer('is_ignored', { mode: 'boolean' }).default(false),
  /** Blame could not be read for this file, so it contributed no lines. */
  analysisFailed: integer('analysis_failed', { mode: 'boolean' }).default(
    false,
  ),
  totalLines: integer('total_lines').default(0),
})

export const blameLines = sqliteTable('blame_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: integer('file_id')
    .notNull()
    .references(() => files.id),
  authorId: integer('author_id')
    .notNull()
    .references(() => authors.id),
  /** Line number in the revision analysed, counting from 1. */
  lineNumber: integer('line_number').notNull(),
  commitHash: text('commit_hash'),
  /**
   * Author time of the commit, in whole seconds since the epoch.
   *
   * A number rather than the ISO string this used to be. Every question worth
   * asking of it is arithmetic -- how old is this line, which half of the
   * codebase is older than the other -- and string comparison only answers
   * those by accident, for as long as every value keeps the same format and
   * the same timezone.
   */
  commitTimestamp: integer('commit_timestamp'),
})

/**
 * Key/value pairs describing how this database was built.
 *
 * Kept separate from the analysis tables because it is read first and on its
 * own: before trusting a single row of blame data, the cache has to establish
 * that the revision and the settings behind it still hold.
 */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type Author = typeof authors.$inferSelect
export type AuthorInsert = typeof authors.$inferInsert
export type AuthorAlias = typeof authorAliases.$inferSelect
export type File = typeof files.$inferSelect
export type BlameLine = typeof blameLines.$inferSelect
