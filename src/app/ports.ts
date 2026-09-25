import { createNodeFiles } from '../adapters/fs/nodeFiles'
import { createGitFactory } from '../adapters/git/spawnGit'
import { createSqliteProvider } from '../adapters/sqlite/provider'
import type { LineLordPorts } from '../core/lineLord'

/**
 * The composition root: the real adapters, wired together once.
 *
 * Everything that runs a process, opens a file or touches a database is
 * chosen here and nowhere else. The core is handed this and asks it
 * questions; a test hands in something else.
 */
export function defaultPorts(): LineLordPorts {
  return {
    git: createGitFactory(),
    files: createNodeFiles(),
    stores: createSqliteProvider(),
  }
}
