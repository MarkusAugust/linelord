import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acquireCacheLock,
  CACHE_MAX_AGE_DAYS,
  CACHE_MAX_BYTES,
  removeAllCaches,
  removeCacheFor,
  tidyCacheDirectory,
} from '../cacheMaintenance'

const DAY_MS = 24 * 60 * 60 * 1000

describe('tidyCacheDirectory', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'linelord-tidy-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  /** A cache file of a given size, last used a given number of days ago. */
  function cache(name: string, bytes: number, daysAgo: number): string {
    const path = join(directory, `${name}.db`)
    writeFileSync(path, Buffer.alloc(bytes))
    const when = new Date(Date.now() - daysAgo * DAY_MS)
    utimesSync(path, when, when)
    return path
  }

  it('forgets a repository nobody has looked at for a fortnight', async () => {
    const stale = cache('stale', 1024, CACHE_MAX_AGE_DAYS + 1)
    const fresh = cache('fresh', 1024, 1)

    const result = tidyCacheDirectory(undefined, Date.now(), directory)

    expect(result.removedForAge).toBe(1)
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
  })

  it('never removes the cache the current run is using', async () => {
    // Deleting the file being read would trade a little disk for the work the
    // user is waiting on.
    const inUse = cache('in-use', 1024, CACHE_MAX_AGE_DAYS + 5)

    tidyCacheDirectory(inUse, Date.now(), directory)

    expect(existsSync(inUse)).toBe(true)
  })

  it('removes the least recently used first when over the size limit', async () => {
    const third = (CACHE_MAX_BYTES / 3) | 0
    const oldest = cache('oldest', third, 10)
    const middle = cache('middle', third, 5)
    const newest = cache('newest', third, 1)
    // Three thirds is under the limit; a fourth pushes it over.
    const extra = cache('extra', third, 2)

    const result = tidyCacheDirectory(undefined, Date.now(), directory)

    expect(result.removedForSize).toBeGreaterThan(0)
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(newest)).toBe(true)
    void middle
    void extra
  })

  it('leaves a directory that is not there alone', () => {
    expect(() =>
      tidyCacheDirectory(undefined, Date.now(), join(directory, 'absent')),
    ).not.toThrow()
  })

  it('takes the write-ahead log with it', async () => {
    // The log can be larger than the database, so a cleanup that left it
    // behind would both understate the directory and orphan the bigger file.
    const stale = cache('stale', 1024, CACHE_MAX_AGE_DAYS + 1)
    writeFileSync(`${stale}-wal`, Buffer.alloc(4096))

    tidyCacheDirectory(undefined, Date.now(), directory)

    expect(existsSync(`${stale}-wal`)).toBe(false)
  })
})

describe('removeCacheFor and removeAllCaches', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'linelord-remove-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('says whether there was anything to forget', () => {
    const path = join(directory, 'one.db')

    expect(removeCacheFor(path)).toBe(false)

    writeFileSync(path, 'x')
    expect(removeCacheFor(path)).toBe(true)
    expect(existsSync(path)).toBe(false)
  })

  it('counts the repositories it forgot', () => {
    writeFileSync(join(directory, 'a.db'), 'x')
    writeFileSync(join(directory, 'b.db'), 'x')
    // Not a cache, and not to be touched.
    writeFileSync(join(directory, 'notes.txt'), 'x')

    expect(removeAllCaches(directory)).toBe(2)
    expect(existsSync(join(directory, 'notes.txt'))).toBe(true)
  })
})

describe('acquireCacheLock', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'linelord-lock-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('creates the directory it needs, which a first run does not have', () => {
    // Without this the very first attempt fails, the run falls back to memory,
    // and no cache is ever written: the feature quietly never starts.
    const path = join(directory, 'not', 'yet', 'there', 'cache.db')

    expect(acquireCacheLock(path)).not.toBe(null)
  })

  it('lets one holder in and keeps the next out', () => {
    const path = join(directory, 'cache.db')

    const first = acquireCacheLock(path)
    expect(first).not.toBe(null)
    expect(acquireCacheLock(path)).toBe(null)

    first?.release()
    expect(acquireCacheLock(path)).not.toBe(null)
  })

  it('takes over a lock left behind by a process that died', () => {
    // Otherwise one crash would make a repository uncacheable for good.
    const path = join(directory, 'cache.db')
    acquireCacheLock(path)

    const muchLater = Date.now() + 60 * 60 * 1000

    expect(acquireCacheLock(path, muchLater)).not.toBe(null)
  })

  it('leaves a lock that is merely recent alone', () => {
    const path = join(directory, 'cache.db')
    acquireCacheLock(path)

    const shortlyAfter = Date.now() + 60 * 1000

    expect(acquireCacheLock(path, shortlyAfter)).toBe(null)
  })
})
