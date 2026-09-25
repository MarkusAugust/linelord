import { createGit } from '../../adapters/git/spawnGit'
import type { LineLordDatabase } from '../../adapters/sqlite/database'
import { createSqliteStore } from '../../adapters/sqlite/store'
import {
  type AnalysisOutcome,
  analyseRevision,
  NO_IGNORE_REVS,
} from '../../core/analyse'
import type { GitPort } from '../../ports/git'

/**
 * Analyse a repository into a database, the way the tests of the analysis
 * have always done it: real git, real SQLite, one call.
 */
export function analyseInto(
  repoPath: string,
  db: LineLordDatabase,
  options: {
    thresholdBytes?: number
    concurrency?: number
    git?: GitPort
  } = {},
): Promise<AnalysisOutcome> {
  return analyseRevision(
    { git: options.git ?? createGit(repoPath), store: createSqliteStore(db) },
    {
      thresholdBytes: options.thresholdBytes ?? 50 * 1024,
      concurrency: options.concurrency,
      ignoreRevs: NO_IGNORE_REVS,
    },
  )
}
