import type { StoreProvider } from '../../ports/stores'
import { resolveCachePath } from './cacheLocation'
import {
  acquireCacheLock,
  markCacheUsed,
  tidyCacheDirectory,
} from './cacheMaintenance'
import { createDatabase } from './database'
import { createSqliteStore } from './store'

/**
 * SQLite on disk under the cache directory, or SQLite in memory.
 *
 * Every failure here degrades rather than propagates. A cache is an
 * optimisation; a full disk, a read-only cache directory or a file written
 * by something else are all reasons to analyse from scratch, and none of
 * them are reasons to refuse to analyse at all.
 */
export function createSqliteProvider(): StoreProvider {
  const inMemory = () => ({
    store: createSqliteStore(createDatabase()),
    lock: null,
  })

  return {
    open(repositoryRoot, useCache) {
      if (!useCache) return inMemory()

      const path = resolveCachePath(repositoryRoot)

      // Somebody else is already writing this one. SQLite would keep the
      // file intact, but two analyses interleaving would leave a fingerprint
      // that describes neither, so this run goes to memory and writes
      // nothing.
      const lock = acquireCacheLock(path)
      if (!lock) return inMemory()

      let store: ReturnType<typeof createSqliteStore>
      try {
        store = createSqliteStore(createDatabase({ path }))
      } catch {
        lock.release()
        return inMemory()
      }

      // Age and eviction order come from the file's modification time, and
      // a run that reuses its cache writes nothing at all. Saying so
      // explicitly is what keeps a repository opened daily, but unchanged,
      // from being evicted for looking untouched.
      markCacheUsed(path)

      // Other repositories' caches are tidied here rather than on a timer,
      // because this is the only moment the program is reliably running.
      // The one about to be used is never a candidate.
      try {
        tidyCacheDirectory(path)
      } catch {
        // A directory that will not tidy is not a reason to stop.
      }

      return { store, path, lock }
    },

    lock(repositoryRoot) {
      return acquireCacheLock(resolveCachePath(repositoryRoot))
    },
  }
}
