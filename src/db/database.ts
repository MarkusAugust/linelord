import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export const IN_MEMORY = ':memory:'

/**
 * The shape of the database, as distinct from the analysis that fills it.
 *
 * Bump this when the tables or indexes change. An old cache is then unreadable
 * rather than merely out of date, so the two are kept apart: a schema change
 * need not mean the analysis would produce different answers, and an analysis
 * change need not touch the tables.
 */
export const SCHEMA_VERSION = 2

export interface CreateDatabaseOptions {
  /**
   * Where the database lives. `:memory:` keeps the current behaviour, in which
   * the analysis exists only for the life of the process.
   */
  path?: string
}

/**
 * Throw away a cache file whose tables were laid out by a different version.
 *
 * The fingerprint already refuses to *reuse* such a cache, but refusing to
 * reuse it is not the same as being able to write it: `CREATE TABLE IF NOT
 * EXISTS` leaves a table that exists alone, missing columns and all, so the
 * run that rebuilds the analysis inserts into the old layout and every file
 * fails. Nothing of value is lost by dropping it -- a cache from another
 * version was never going to be read again.
 */
function discardIfWrittenByAnotherVersion(sqlite: Database): void {
  // SQLite keeps this number in the file header, for exactly this purpose. It
  // is a property of the file rather than a row in it, so emptying the tables
  // does not disturb it and a caller need not remember to write it.
  const row = sqlite
    .query<{ user_version: number }, []>('PRAGMA user_version')
    .get()
  const stored = row?.user_version ?? 0

  if (stored === SCHEMA_VERSION) return

  // Zero is both a brand-new file and one written before this stamp existed.
  // Dropping is right for the second and a no-op for the first.

  sqlite.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS blame_lines;
    DROP TABLE IF EXISTS author_aliases;
    DROP TABLE IF EXISTS authors;
    DROP TABLE IF EXISTS files;
    DROP TABLE IF EXISTS meta;
  `)
}

export function createDatabase(options: CreateDatabaseOptions = {}) {
  const path = options.path ?? IN_MEMORY
  const onDisk = path !== IN_MEMORY

  if (onDisk) {
    // The cache directory usually does not exist on a first run, and a failure
    // here belongs to the caller, which decides whether to fall back to
    // memory rather than fail the analysis over a cache.
    mkdirSync(dirname(path), { recursive: true })
  }

  const sqlite = new Database(path, { create: true })
  const db = drizzle(sqlite, { schema })

  if (onDisk) {
    // WAL so a reader is not blocked by the writer, NORMAL because losing a
    // cache to a power cut costs one re-analysis and nothing else, and a busy
    // timeout so two LineLords started at once wait rather than fail.
    sqlite.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `)
  }

  if (onDisk) discardIfWrittenByAnotherVersion(sqlite)

  // Create tables with foreign key handling
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      canonical_id INTEGER,
      is_canonical INTEGER DEFAULT 0,
      title TEXT,
      rank INTEGER,
      percentage REAL DEFAULT 0,
      FOREIGN KEY (canonical_id) REFERENCES authors(id)
    );
    
    CREATE TABLE IF NOT EXISTS author_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_author_id INTEGER NOT NULL REFERENCES authors(id),
      alias_name TEXT NOT NULL,
      alias_email TEXT NOT NULL,
      similarity INTEGER DEFAULT 100
    );
    
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      extension TEXT,
      size INTEGER,
      is_larger_than_threshold INTEGER DEFAULT 0,
      is_binary INTEGER DEFAULT 0,
      is_ignored INTEGER DEFAULT 0,
      analysis_failed INTEGER DEFAULT 0,
      total_lines INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS blame_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id),
      author_id INTEGER NOT NULL REFERENCES authors(id),
      line_number INTEGER NOT NULL,
      commit_hash TEXT,
      commit_timestamp INTEGER
    );
    
    -- Everything the cache needs to decide whether it may be reused: the
    -- revision it was built against, and the settings that would change the
    -- answer if they differed. Read before anything else on startup.
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blame_file_id ON blame_lines(file_id);
    CREATE INDEX IF NOT EXISTS idx_blame_author_id ON blame_lines(author_id);
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_authors_email ON authors(email);
    CREATE INDEX IF NOT EXISTS idx_authors_canonical ON authors(canonical_id);
    CREATE INDEX IF NOT EXISTS idx_author_aliases_canonical ON author_aliases(canonical_author_id);
  `)

  // Stamped after the tables exist, so a file that fails halfway through
  // creation is not marked as though it had succeeded.
  sqlite.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)

  return db
}

/**
 * Empty every table, in an order the foreign keys allow.
 *
 * meta goes too. It describes the rows in the other tables -- which revision
 * they were built from, under which settings -- so leaving it behind would
 * leave a description of data that is no longer there. The caller that empties
 * the database to analyse a different repository would then be handed the
 * previous repository's fingerprint as though it were its own.
 *
 * The layout version is not in meta and so is not touched: it describes the
 * shape of the tables, which emptying them does not change.
 */
export function clearDatabase(db: LineLordDatabase) {
  db.delete(schema.blameLines).run()
  db.delete(schema.authorAliases).run()
  db.delete(schema.authors).run()
  db.delete(schema.files).run()
  db.delete(schema.meta).run()
}

export type LineLordDatabase = ReturnType<typeof createDatabase>
