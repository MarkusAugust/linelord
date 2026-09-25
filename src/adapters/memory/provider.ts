import type { StoreProvider } from '../../ports/stores'
import { createMemoryStore } from './store'

/** A store provider that never touches the disk, for tests of the core. */
export function createMemoryProvider(): StoreProvider {
  return {
    open() {
      return { store: createMemoryStore(), lock: null }
    },
    lock() {
      return { release() {} }
    },
  }
}
