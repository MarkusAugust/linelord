import { describeAnalysisStore } from '../../../ports/__test__/storageContract'
import { createDatabase } from '../database'
import { createSqliteStore } from '../store'

describeAnalysisStore('SQLite in memory', () =>
  createSqliteStore(createDatabase()),
)
