import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveCacheDirectory } from './cacheLocation'

/**
 * Keeping the cache directory from growing without limit, and keeping two
 * LineLords from writing the same cache at once.
 *
 * Everything here fails quietly. A cache is an optimisation; a directory that
 * cannot be read, a file that cannot be deleted and a lock that cannot be
 * taken are all reasons to do less, and none of them are reasons to stop the
 * analysis the user asked for.
 */

/**
 * How long an unused cache is kept.
 *
 * Fifteen days rather than the ninety first proposed, because the value falls
 * away long before the disk space does: a repository untouched for two weeks
 * has usually moved far enough that the stored revision is no longer an
 * ancestor, so the next run rebuilds from nothing anyway. Keeping it longer
 * buys almost nothing and leaves a copy of every contributor's name and email
 * address lying about for no reason.
 */
export const CACHE_MAX_AGE_DAYS = 15

/** Total size the cache directory is allowed to reach before the least recently used go. */
export const CACHE_MAX_BYTES = 500 * 1024 * 1024

/** A lock older than this is assumed to belong to a process that died. */
const LOCK_STALE_AFTER_MS = 10 * 60 * 1000

interface CacheFile {
  path: string
  bytes: number
  usedAt: number
}

function listCacheFiles(directory: string): CacheFile[] {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }

  const cacheFiles: CacheFile[] = []
  for (const name of names) {
    if (!name.endsWith('.db')) continue
    const path = join(directory, name)
    try {
      const stats = statSync(path)
      cacheFiles.push({
        path,
        // The write-ahead log and its index sit beside the database and can be
        // larger than it is, so a size that ignored them would understate the
        // directory badly.
        bytes: stats.size + sidecarBytes(path),
        usedAt: stats.mtimeMs,
      })
    } catch {
      // Vanished between listing and measuring, which is fine: something else
      // has already done the tidying.
    }
  }
  return cacheFiles
}

function sidecarBytes(databasePath: string): number {
  let total = 0
  for (const suffix of ['-wal', '-shm']) {
    try {
      total += statSync(`${databasePath}${suffix}`).size
    } catch {
      // Not there, which is the usual case for a cleanly closed database.
    }
  }
  return total
}

function removeCache(databasePath: string): void {
  for (const suffix of ['', '-wal', '-shm', '.lock']) {
    try {
      rmSync(`${databasePath}${suffix}`, { force: true })
    } catch {
      // A cache that will not delete is not worth failing an analysis over.
      // It stays, counts against the limit, and is tried again next time.
    }
  }
}

export interface TidyResult {
  removedForAge: number
  removedForSize: number
}

/**
 * Remove caches that are too old, then the least recently used until the
 * directory is back under its limit.
 *
 * `keep` is the cache this run is about to use, which is never removed however
 * the arithmetic comes out: deleting the file currently open would trade a
 * little disk for the work the user is waiting on.
 */
export function tidyCacheDirectory(
  keep?: string,
  now: number = Date.now(),
  directory: string = resolveCacheDirectory(),
): TidyResult {
  const files = listCacheFiles(directory).filter((file) => file.path !== keep)
  const result: TidyResult = { removedForAge: 0, removedForSize: 0 }

  const maxAgeMs = CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const survivors: CacheFile[] = []
  for (const file of files) {
    if (now - file.usedAt > maxAgeMs) {
      removeCache(file.path)
      result.removedForAge += 1
    } else {
      survivors.push(file)
    }
  }

  const keptBytes = keep ? sizeOf(keep) : 0
  let total = survivors.reduce((sum, file) => sum + file.bytes, keptBytes)
  if (total <= CACHE_MAX_BYTES) return result

  // Least recently used first, so the caches someone is actually working in
  // are the last to go.
  survivors.sort((a, b) => a.usedAt - b.usedAt)
  for (const file of survivors) {
    if (total <= CACHE_MAX_BYTES) break
    removeCache(file.path)
    total -= file.bytes
    result.removedForSize += 1
  }

  return result
}

function sizeOf(databasePath: string): number {
  try {
    return statSync(databasePath).size + sidecarBytes(databasePath)
  } catch {
    return 0
  }
}

/** Delete one repository's cache. Returns whether there was one to delete. */
export function removeCacheFor(databasePath: string): boolean {
  const existed = existsSync(databasePath)
  removeCache(databasePath)
  return existed
}

/** Delete every cache. Returns how many repositories were forgotten. */
export function removeAllCaches(
  directory: string = resolveCacheDirectory(),
): number {
  const files = listCacheFiles(directory)
  for (const file of files) removeCache(file.path)
  return files.length
}

export interface CacheLock {
  release(): void
}

/**
 * Claim the right to write one cache, or report that someone else holds it.
 *
 * SQLite's own locking keeps the file itself intact, but it cannot keep two
 * analyses from interleaving into one database and leaving a fingerprint that
 * describes neither. Whoever fails to take the lock runs in memory instead,
 * which costs that run its cache and nothing else.
 */
export function acquireCacheLock(
  databasePath: string,
  now: number = Date.now(),
): CacheLock | null {
  const lockPath = `${databasePath}.lock`

  // On a first run the cache directory does not exist yet, and a lock cannot
  // be created inside a directory that is not there. Without this the very
  // first attempt fails, the run falls back to memory, and no cache is ever
  // written -- the feature quietly never starts.
  try {
    mkdirSync(dirname(databasePath), { recursive: true })
  } catch {
    return null
  }

  const claim = (): CacheLock | null => {
    try {
      // 'wx' fails rather than truncates when the file is already there, which
      // is what makes this a claim rather than a request.
      const handle = openSync(lockPath, 'wx')
      writeSync(handle, `${process.pid} ${now}\n`)
      closeSync(handle)
      return {
        release() {
          try {
            rmSync(lockPath, { force: true })
          } catch {
            // Left behind; the staleness check below will clear it.
          }
        },
      }
    } catch {
      return null
    }
  }

  const lock = claim()
  if (lock) return lock

  // Someone holds it -- or did, and then died without letting go. A lock with
  // no living owner would otherwise keep a repository uncacheable forever.
  try {
    const age = now - statSync(lockPath).mtimeMs
    if (age > LOCK_STALE_AFTER_MS) {
      rmSync(lockPath, { force: true })
      return claim()
    }
  } catch {
    // Gone while we looked at it, which means it is free again.
    return claim()
  }

  return null
}
