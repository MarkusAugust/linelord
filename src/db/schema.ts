import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const authors = sqliteTable('authors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  canonicalId: integer('canonical_id'),
  isCanonical: integer('is_canonical', { mode: 'boolean' }).default(false),
  title: text('title'),
  rank: integer('rank'),
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
  lineNumber: integer('line_number').notNull(),
  content: text('content'),
  commitHash: text('commit_hash'),
  commitDate: text('commit_date'),
})

export type Author = typeof authors.$inferSelect
export type AuthorInsert = typeof authors.$inferInsert
export type AuthorAlias = typeof authorAliases.$inferSelect
export type File = typeof files.$inferSelect
export type BlameLine = typeof blameLines.$inferSelect
