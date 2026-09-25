import { describeAnalysisStore } from '../../../ports/__test__/storageContract'
import { createMemoryStore } from '../store'

describeAnalysisStore('in memory', () => createMemoryStore())
