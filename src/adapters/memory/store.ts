import type {
  AliasRecord,
  AnalysisData,
  AuthorRecord,
  BlameLineRecord,
  CohortLineRecord,
  FileRecord,
  HistoryData,
  SnapshotRecord,
} from '../../core/model'
import type { AnalysisStore } from '../../ports/storage'

/**
 * The storage port over a few arrays.
 *
 * For tests of the core, which should not need a database to say what a
 * median is, and for any run that has no cache to write. It passes the same
 * contract the SQLite adapter does, ids included: they count up and are never
 * reused, because ties on age are broken by them.
 */
export function createMemoryStore(): AnalysisStore {
  let files = new Map<number, FileRecord>()
  let authors = new Map<number, AuthorRecord>()
  let aliases: AliasRecord[] = []
  let lines: BlameLineRecord[] = []
  let meta = new Map<string, string>()
  let snapshots: SnapshotRecord[] = []
  let cohortLines: CohortLineRecord[] = []
  let nextFileId = 1
  let nextAuthorId = 1
  let nextLineId = 1
  let nextSnapshotId = 1

  const copy = <T>(value: T): T => structuredClone(value)

  return {
    layoutVersion: 'memory',

    async loadAnalysis(): Promise<AnalysisData> {
      return copy({
        files: [...files.values()],
        authors: [...authors.values()],
        aliases,
        lines,
      })
    },

    async loadHistory(): Promise<HistoryData> {
      return copy({ snapshots, cohortLines })
    },

    async listFiles() {
      return copy([...files.values()])
    },

    async reconcileFiles(plan) {
      for (const file of plan.insert) {
        if ([...files.values()].some((one) => one.path === file.path)) continue
        const id = nextFileId++
        files.set(id, { id, ...file, analysisFailed: false, totalLines: 0 })
      }
      for (const { id, changes } of plan.update) {
        const stored = files.get(id)
        if (stored) files.set(id, { ...stored, ...changes })
      }
      const gone = new Set(plan.remove)
      if (gone.size > 0) {
        lines = lines.filter((line) => !gone.has(line.fileId))
        for (const id of gone) files.delete(id)
      }
    },

    async forgetBlame(fileIds) {
      const ids = new Set(fileIds)
      lines = lines.filter((line) => !ids.has(line.fileId))
      for (const id of ids) {
        const stored = files.get(id)
        if (stored) {
          files.set(id, { ...stored, totalLines: 0, analysisFailed: false })
        }
      }
    },

    async markAnalysisFailed(fileId) {
      const stored = files.get(fileId)
      if (stored) files.set(fileId, { ...stored, analysisFailed: true })
    },

    async storeBlame(fileId, newLines) {
      for (const line of newLines) {
        lines.push({ id: nextLineId++, fileId, ...line })
      }
      const stored = files.get(fileId)
      if (stored) files.set(fileId, { ...stored, totalLines: newLines.length })
    },

    async listAuthors() {
      return copy([...authors.values()])
    },

    async ensureAuthors(identities) {
      const ids = new Map<string, number>()
      for (const identity of identities) {
        const existing = [...authors.values()].find(
          (one) => one.email === identity.email,
        )
        if (existing) {
          ids.set(identity.email, existing.id)
          continue
        }
        const id = nextAuthorId++
        authors.set(id, {
          id,
          name: identity.name,
          email: identity.email,
          displayName: identity.displayName,
          canonicalId: id,
          isCanonical: true,
          title: null,
          rank: null,
          percentage: 0,
        })
        ids.set(identity.email, id)
      }
      return ids
    },

    async updateAuthors(changes) {
      for (const { id, changes: patch } of changes) {
        const stored = authors.get(id)
        if (stored) authors.set(id, { ...stored, ...patch })
      }
    },

    async replaceAliases(next) {
      aliases = copy(next)
    },

    async reassignBlame(fromAuthorId, toAuthorId) {
      lines = lines.map((line) =>
        line.authorId === fromAuthorId
          ? { ...line, authorId: toAuthorId }
          : line,
      )
    },

    async readMeta() {
      return Object.fromEntries(meta)
    },

    async writeMeta(entries) {
      for (const [key, value] of Object.entries(entries)) meta.set(key, value)
    },

    async deleteMeta(keys) {
      for (const key of keys) meta.delete(key)
    },

    async clearHistory() {
      snapshots = []
      cohortLines = []
    },

    async storeSnapshot(snapshot, cohorts) {
      const id = nextSnapshotId++
      snapshots.push({ id, ...snapshot })
      for (const cohort of cohorts)
        cohortLines.push({ snapshotId: id, ...cohort })
    },

    async clear() {
      files = new Map()
      authors = new Map()
      aliases = []
      lines = []
      meta = new Map()
      snapshots = []
      cohortLines = []
    },
  }
}
