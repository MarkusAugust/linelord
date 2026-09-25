import { appendFile, readFile } from 'node:fs/promises'
import type { FileSystemPort } from '../../ports/files'

/** The file system port over Node's. */
export function createNodeFiles(): FileSystemPort {
  return {
    async readText(path) {
      try {
        return await readFile(path, 'utf8')
      } catch (error) {
        // "Not there" is an answer. Anything else is a failure to read a
        // file that exists, and the caller decides what that means.
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'ENOENT' || code === 'ENOTDIR') return null
        throw error
      }
    },

    async appendText(path, text) {
      await appendFile(path, text)
    },
  }
}
