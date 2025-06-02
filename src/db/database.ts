import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export function createDatabase() {
  // In-memory SQLite database using Bun's native SQLite
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

  // Create tables with foreign key handling
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      canonical_id INTEGER,
      is_canonical INTEGER DEFAULT 0,
      title TEXT,
      rank INTEGER,
      FOREIGN KEY (canonical_id) REFERENCES authors(id)
    );
    
    CREATE TABLE author_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_author_id INTEGER NOT NULL REFERENCES authors(id),
      alias_name TEXT NOT NULL,
      alias_email TEXT NOT NULL,
      similarity INTEGER DEFAULT 100
    );
    
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      extension TEXT,
      size INTEGER,
      is_larger_than_threshold INTEGER DEFAULT 0,
      is_binary INTEGER DEFAULT 0,
      is_ignored INTEGER DEFAULT 0,
      total_lines INTEGER DEFAULT 0
    );
    
    CREATE TABLE blame_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id),
      author_id INTEGER NOT NULL REFERENCES authors(id),
      line_number INTEGER NOT NULL,
      content TEXT,
      commit_hash TEXT,
      commit_date TEXT
    );
    
    CREATE INDEX idx_blame_file_id ON blame_lines(file_id);
    CREATE INDEX idx_blame_author_id ON blame_lines(author_id);
    CREATE INDEX idx_files_path ON files(path);
    CREATE INDEX idx_authors_email ON authors(email);
    CREATE INDEX idx_authors_canonical ON authors(canonical_id);
    CREATE INDEX idx_author_aliases_canonical ON author_aliases(canonical_author_id);
  `)

  return db
}

export function clearDatabase(db: LineLordDatabase) {
  // Clear all tables in the correct order (respecting foreign keys)
  db.delete(schema.blameLines).run()
  db.delete(schema.authorAliases).run()
  db.delete(schema.authors).run()
  db.delete(schema.files).run()
}

export type LineLordDatabase = ReturnType<typeof createDatabase>
