import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { clearDatabase, createDatabase } from '../database'
import { readAllMeta, readMeta, writeMeta } from '../meta'
import { authors } from '../schema'

describe('createDatabase on disk', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { force: true, recursive: true })
    directory = undefined
  })

  async function cachePath(...segments: string[]) {
    directory = await mkdtemp(join(tmpdir(), 'linelord-cache-'))
    return join(directory, ...segments)
  }

  it('creates the directory it is pointed at', async () => {
    // A first run has no cache directory, and the analysis must not fail over
    // one that does not exist yet.
    const path = await cachePath('not', 'yet', 'there', 'cache.db')

    createDatabase({ path })

    expect(existsSync(path)).toBe(true)
  })

  it('can reopen a database it has already written', async () => {
    // The schema statements run on every open, so they have to tolerate the
    // tables already being there. Without that, the second run of any cached
    // repository would fail on `table authors already exists`.
    const path = await cachePath('cache.db')

    const first = createDatabase({ path })
    writeMeta(first, { head_sha: 'abc123' })

    const second = createDatabase({ path })

    expect(readMeta(second, 'head_sha')).toBe('abc123')
  })

  it('keeps analysis rows across a reopen', async () => {
    const path = await cachePath('cache.db')

    const first = createDatabase({ path })
    await first.insert(authors).values({
      id: 1,
      name: 'Gorvek of Bonereach',
      email: 'gorvek@bonereach.realm',
      displayName: 'Gorvek of Bonereach',
      isCanonical: true,
    })

    const second = createDatabase({ path })
    const rows = await second.select().from(authors)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.email).toBe('gorvek@bonereach.realm')
  })

  it('uses write-ahead logging, so a reader is not blocked by the writer', async () => {
    const path = await cachePath('cache.db')
    const db = createDatabase({ path })

    const [mode] = db.all<{ journal_mode: string }>(sql`PRAGMA journal_mode`)

    expect(mode?.journal_mode).toBe('wal')
  })

  it('still defaults to memory, which leaves nothing behind', async () => {
    const db = createDatabase()

    const [mode] = db.all<{ journal_mode: string }>(sql`PRAGMA journal_mode`)

    expect(mode?.journal_mode).toBe('memory')
    expect(readAllMeta(db)).toEqual({})
  })
})

describe('clearDatabase', () => {
  it('clears the metadata along with the rows it describes', async () => {
    // meta says which revision the rows came from and under which settings.
    // Emptying the tables but keeping it would leave a description of data
    // that is no longer there -- and the caller that empties the database to
    // analyse a different repository would be handed the previous
    // repository's fingerprint as though it were its own.
    const db = createDatabase()
    await db.insert(authors).values({
      id: 1,
      name: 'Gorvek of Bonereach',
      email: 'gorvek@bonereach.realm',
      displayName: 'Gorvek of Bonereach',
      isCanonical: true,
    })
    writeMeta(db, { head_sha: 'abc123', threshold_bytes: '51200' })

    clearDatabase(db)

    expect(await db.select().from(authors)).toHaveLength(0)
    expect(readAllMeta(db)).toEqual({})
  })
})

describe('meta', () => {
  it('returns null for a key that was never written', () => {
    // A first run, and a cache written before this key existed, look the same
    // from here. Both mean the same thing to a caller: do not trust it.
    expect(readMeta(createDatabase(), 'head_sha')).toBe(null)
  })

  it('replaces a key rather than accumulating rows', () => {
    const db = createDatabase()

    writeMeta(db, { head_sha: 'first' })
    writeMeta(db, { head_sha: 'second' })

    expect(readMeta(db, 'head_sha')).toBe('second')
    expect(Object.keys(readAllMeta(db))).toEqual(['head_sha'])
  })

  it('writes several keys together', () => {
    const db = createDatabase()

    writeMeta(db, {
      head_sha: 'abc',
      analysis_version: '1',
      threshold: '51200',
    })

    expect(readAllMeta(db)).toEqual({
      head_sha: 'abc',
      analysis_version: '1',
      threshold: '51200',
    })
  })

  it('does nothing when given nothing', () => {
    const db = createDatabase()

    writeMeta(db, {})

    expect(readAllMeta(db)).toEqual({})
  })
})
