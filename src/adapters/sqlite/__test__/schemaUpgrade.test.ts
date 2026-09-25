import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase, SCHEMA_VERSION } from '../database'
import { authors, blameLines, files, meta, snapshots } from '../schema'

/**
 * Opening a cache file written by an older LineLord.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there,
 * so a column added in a later version is simply missing -- and every insert
 * against it fails. The fingerprint refuses to *reuse* such a cache, which is
 * not the same as being able to *write* one: the run that rebuilds it writes
 * into the old tables.
 */

describe('a cache file from an older version', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'linelord-upgrade-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  /** A database as version 1 wrote it: commit_date, and no commit_timestamp. */
  function writeVersionOne(path: string): void {
    const sqlite = new Database(path, { create: true })
    sqlite.exec(`
      CREATE TABLE authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        canonical_id INTEGER,
        is_canonical INTEGER DEFAULT 0,
        title TEXT,
        rank INTEGER,
        percentage REAL DEFAULT 0
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
        analysis_failed INTEGER DEFAULT 0,
        total_lines INTEGER DEFAULT 0
      );
      CREATE TABLE blame_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES files(id),
        author_id INTEGER NOT NULL REFERENCES authors(id),
        line_number INTEGER NOT NULL,
        commit_hash TEXT,
        commit_date TEXT
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '1');
    `)
    sqlite.close()
  }

  it('is rebuilt rather than written into', async () => {
    // Otherwise the first run after an upgrade reports every file in the
    // repository as unreadable -- the analysis is not wrong, it is absent --
    // and it does so again on every run after, because the cache it fails to
    // write is the same cache it fails to write next time.
    const path = join(directory, 'cache.db')
    writeVersionOne(path)

    const db = createDatabase({ path })

    const [file] = await db
      .insert(files)
      .values({ path: 'a.ts' })
      .returning({ id: files.id })
    const [author] = await db
      .insert(authors)
      .values({
        name: 'Gorvek',
        email: 'gorvek@firma.no',
        displayName: 'Gorvek',
      })
      .returning({ id: authors.id })

    await db.insert(blameLines).values({
      fileId: file?.id ?? 0,
      authorId: author?.id ?? 0,
      lineNumber: 1,
      commitHash: 'abc',
      commitTimestamp: 1_700_000_000,
    })

    const rows = await db.select().from(blameLines)
    expect(rows[0]?.commitTimestamp).toBe(1_700_000_000)
  })

  it('leaves nothing of the old analysis behind', async () => {
    const path = join(directory, 'cache.db')
    writeVersionOne(path)

    const db = createDatabase({ path })

    // Including the fingerprint: a version stamp describing tables that have
    // been dropped would invite a reuse of rows that no longer exist.
    expect(await db.select().from(meta)).toEqual([])
  })

  it('adds a table that did not exist without throwing the cache away', async () => {
    // Tier 2's tables were added after 0.9.0 shipped. They are additive:
    // nothing already stored is less true for them, so a cache from before
    // must keep its analysis and simply gain the new tables.
    const path = join(directory, 'cache.db')
    const first = createDatabase({ path })
    await first.insert(authors).values({
      name: 'Gorvek',
      email: 'gorvek@firma.no',
      displayName: 'Gorvek',
    })

    const second = createDatabase({ path })

    expect(await second.select().from(authors)).toHaveLength(1)
    await second.insert(snapshots).values({
      commitSha: 'a'.repeat(40),
      snapshotTimestamp: 1_700_000_000,
    })
    expect(await second.select().from(snapshots)).toHaveLength(1)
  })

  it('keeps a cache written by this version', async () => {
    const path = join(directory, 'cache.db')
    const first = createDatabase({ path })
    await first.insert(meta).values({
      key: 'schema_version',
      value: String(SCHEMA_VERSION),
    })
    await first.insert(meta).values({ key: 'head_sha', value: 'deadbeef' })

    const second = createDatabase({ path })

    const rows = await second.select().from(meta)
    expect(rows.map((row) => row.key).sort()).toEqual([
      'head_sha',
      'schema_version',
    ])
  })
})
