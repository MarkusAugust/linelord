import type { BlameEntry, GitPort, TreeEntry } from '../ports/git'
import type {
  AnalysisStore,
  AuthorIdentity,
  FilePlan,
  NewBlameLine,
} from '../ports/storage'
import {
  ignoredFileExtensions,
  isIgnoredByPattern,
} from '../resources/ignoreFiles'
import { normaliseConcurrency } from './concurrency'
import type { IgnoreRevs, UnresolvedIgnoreRev } from './ignoreRevs'
import type { FileRecord } from './model'

/**
 * Reading one revision of a repository into the store.
 *
 * The analysis of HEAD: which files the revision holds and what kind each
 * one is, then blame for every file worth reading, written through the
 * storage port. The deciding -- what a file is, what changed since the store
 * last saw the tree, which lines belong to somebody -- is pure, and the
 * ports are asked only for what they alone can answer.
 *
 * Every git command is given the resolved commit, never the symbolic ref.
 * An analysis can take minutes on a large repository, and a commit or a
 * branch switch in another terminal partway through would otherwise leave
 * the file list, the blame output and the SHA on screen describing
 * different trees.
 */

export interface AnalysisContext {
  /** The revision the analysis was run against, or null in a repository with no commits. */
  headSha: string | null
  /** Tracked files whose working-copy content differs from HEAD and is therefore not counted. */
  uncommittedFileCount: number
  /**
   * Commits blame was told to look past, so their lines are credited to
   * whoever wrote them rather than to whoever reformatted them.
   */
  ignoredRevisionCount: number
  /** Which sources named them: the repository's file, `--ignore-rev`, or both. */
  ignoreRevSources: { file: boolean; flag: boolean }
  /** Entries that name no commit here, with where each was named. */
  unresolvedIgnoreRevs: UnresolvedIgnoreRev[]
}

/** A file whose blame could not be read, kept for the interface to report. */
export interface AnalysisFailure {
  path: string
  error: string
}

/** How much of a run was done afresh, and how much came from the store. */
export interface AnalysisRun {
  /** Files blamed during this run. */
  blamed: number
  /** Files whose stored blame was kept as it was. */
  reused: number
}

export interface AnalysisOutcome extends AnalysisRun {
  context: AnalysisContext
  /**
   * Files that could not be read, collected rather than printed.
   *
   * Writing to stdout or stderr while Ink holds the terminal puts text where
   * the UI is drawing. The interface reports these instead.
   */
  failures: AnalysisFailure[]
}

export type ProgressReport = (
  current: number,
  total: number,
  message: string,
) => void

export interface AnalysisPorts {
  git: GitPort
  store: AnalysisStore
}

export interface AnalysisSettings {
  /** Files larger than this are set aside rather than read. */
  thresholdBytes: number
  /** How many files may be blamed at once. */
  concurrency?: number
  /** The commits blame is told to look past, already resolved and checked. */
  ignoreRevs?: IgnoreRevs
}

export const NO_IGNORE_REVS: IgnoreRevs = {
  revisions: [],
  sources: { file: false, flag: false },
  unresolved: [],
}

/** A commit hash of all zeroes is git's marker for a line that is not committed. */
const UNCOMMITTED_SHA = /^0+$/

/** The lower-cased extension with its dot, as `path.extname` gives it, or null. */
export function extensionOf(filePath: string): string | null {
  const slash = filePath.lastIndexOf('/')
  const basename = slash === -1 ? filePath : filePath.slice(slash + 1)
  const dot = basename.lastIndexOf('.')
  if (dot <= 0) return null
  return basename.slice(dot).toLowerCase()
}

export interface FileClassification {
  isBinary: boolean
  isIgnored: boolean
  isLargerThanThreshold: boolean
  size: number
}

/**
 * Decide what to do with one file from the tree.
 *
 * The size comes from the blob at the revision rather than from the working
 * copy, so a file staged for deletion still has one and a modified file is
 * measured as the content being analysed. Binary wins over ignored, and
 * ignored over oversized, so a file lands in exactly one category.
 */
export function classifyFile(
  file: TreeEntry,
  textPaths: Set<string>,
  thresholdBytes: number,
): FileClassification {
  // An empty file has no line for `git grep` to match, so it is absent from
  // the text set without being binary. It has nothing to count either way,
  // but calling it binary would be a lie told in the statistics.
  if (file.size > 0 && !textPaths.has(file.path)) {
    return {
      isBinary: true,
      isIgnored: false,
      isLargerThanThreshold: false,
      size: file.size,
    }
  }

  const ext = extensionOf(file.path) ?? ''
  if (ignoredFileExtensions.has(ext) || isIgnoredByPattern(file.path)) {
    return {
      isBinary: false,
      isIgnored: true,
      isLargerThanThreshold: false,
      size: file.size,
    }
  }

  return {
    isBinary: false,
    isIgnored: false,
    isLargerThanThreshold: file.size > thresholdBytes,
    size: file.size,
  }
}

/**
 * What the store should hold about the files, given what the tree holds.
 *
 * Rows are reconciled rather than replaced, because blame lines reference
 * files by id: deleting and reinserting would renumber them and orphan every
 * line belonging to a file nobody touched -- which is precisely the data an
 * incremental update exists to keep. Only rows whose classification actually
 * moved are updated: on an incremental run almost none have, and updating
 * every file regardless cost fifteen times what re-reading the changed file
 * took. A file that has left the tree is removed, and takes its lines with
 * it, or they would go on counting towards an author's total.
 */
export function planFiles(
  stored: FileRecord[],
  head: TreeEntry[],
  textPaths: Set<string>,
  thresholdBytes: number,
): { plan: FilePlan; analysable: string[] } {
  const existing = new Map(stored.map((file) => [file.path, file]))
  const plan: FilePlan = { insert: [], update: [], remove: [] }
  const analysable: string[] = []
  const inHead = new Set<string>()

  for (const file of head) {
    inHead.add(file.path)
    const kind = classifyFile(file, textPaths, thresholdBytes)
    const known = existing.get(file.path)

    if (known === undefined) {
      plan.insert.push({
        path: file.path,
        extension: extensionOf(file.path),
        size: kind.size,
        isBinary: kind.isBinary,
        isIgnored: kind.isIgnored,
        isLargerThanThreshold: kind.isLargerThanThreshold,
      })
    } else if (
      known.size !== kind.size ||
      known.isBinary !== kind.isBinary ||
      known.isIgnored !== kind.isIgnored ||
      known.isLargerThanThreshold !== kind.isLargerThanThreshold
    ) {
      plan.update.push({
        id: known.id,
        changes: {
          size: kind.size,
          isBinary: kind.isBinary,
          isIgnored: kind.isIgnored,
          isLargerThanThreshold: kind.isLargerThanThreshold,
        },
      })
    }

    if (!kind.isBinary && !kind.isIgnored && !kind.isLargerThanThreshold) {
      analysable.push(file.path)
    }
  }

  for (const file of stored) {
    if (!inHead.has(file.path)) plan.remove.push(file.id)
  }

  return { plan, analysable }
}

/** "Surname, Forename" written the other way round, and whitespace settled. */
export function normalizeDisplayName(name: string): string {
  let normalized = name.trim()
  if (normalized.includes(',')) {
    const parts = normalized.split(',').map((p) => p.trim())
    if (parts.length === 2) {
      normalized = `${parts[1]} ${parts[0]}`
    }
  }
  return normalized.replace(/\s+/g, ' ').trim()
}

/** Whether a blame entry is a line somebody owns. */
function counts(entry: BlameEntry): boolean {
  // Blank and whitespace-only lines belong to nobody. They are still lines
  // of the file, which is why the number comes from git and not from
  // counting the ones kept.
  if (entry.content.trim() === '') return false
  // Blaming a commit should never produce uncommitted lines, but a null sha
  // must never be allowed to create a "Not Committed Yet" author.
  if (UNCOMMITTED_SHA.test(entry.sha)) return false
  return true
}

/** The people a file's blame names, each once, under the first name seen. */
export function identitiesIn(entries: BlameEntry[]): AuthorIdentity[] {
  const seen = new Map<string, AuthorIdentity>()
  for (const entry of entries) {
    if (!counts(entry) || seen.has(entry.authorEmail)) continue
    seen.set(entry.authorEmail, {
      name: entry.author,
      email: entry.authorEmail,
      displayName: normalizeDisplayName(entry.author),
    })
  }
  return [...seen.values()]
}

/** The lines to store for a file, given who each address is. */
export function linesFrom(
  entries: BlameEntry[],
  authorIds: Map<string, number>,
): NewBlameLine[] {
  const lines: NewBlameLine[] = []
  for (const entry of entries) {
    if (!counts(entry)) continue
    const authorId = authorIds.get(entry.authorEmail)
    if (authorId === undefined) {
      throw new Error(`No author was stored for ${entry.authorEmail}`)
    }
    lines.push({
      authorId,
      lineNumber: entry.lineNumber,
      commitHash: entry.sha,
      // Not `|| null`: a commit dated to the epoch has an author time of
      // zero, and treating that as missing would drop the line out of every
      // question asked about age.
      commitTimestamp: entry.authorTime,
    })
  }
  return lines
}

/**
 * Which revision is being described, and how much of the working copy it
 * leaves out. Asked without analysing anything, so that a run that reuses
 * its store can still say what its numbers are about.
 */
export async function describeRevision(
  git: GitPort,
): Promise<Pick<AnalysisContext, 'headSha' | 'uncommittedFileCount'>> {
  const headSha = await git.resolveHead()
  // A repository with no commits yet has no HEAD to resolve, and nothing to
  // count against it.
  if (headSha === null) return { headSha: null, uncommittedFileCount: 0 }
  return { headSha, uncommittedFileCount: await git.countUncommittedFiles() }
}

/** The context an analysis reports, from what was described and what was ignored. */
export function contextFor(
  described: Pick<AnalysisContext, 'headSha' | 'uncommittedFileCount'>,
  ignoreRevs: IgnoreRevs,
): AnalysisContext {
  return {
    ...described,
    ignoredRevisionCount: ignoreRevs.revisions.length,
    ignoreRevSources: ignoreRevs.sources,
    unresolvedIgnoreRevs: ignoreRevs.unresolved,
  }
}

/**
 * Work out the current state of every file in the revision and record it.
 *
 * Discovery runs in full on every kind of run, because it is cheap --
 * measured at about a tenth of an analysis -- and doing it properly is what
 * keeps files that were added, deleted or renamed correct without a second
 * mechanism.
 */
async function discover(
  ports: AnalysisPorts,
  settings: AnalysisSettings,
  context: AnalysisContext,
  onProgress?: ProgressReport,
): Promise<{ analysable: string[]; fileIds: Map<string, number> }> {
  const head =
    context.headSha === null ? [] : await ports.git.listTree(context.headSha)
  onProgress?.(10, 100, `Found ${head.length} files`)

  const textPaths =
    head.length > 0 && context.headSha !== null
      ? await ports.git.listTextPaths(context.headSha)
      : new Set<string>()

  const { plan, analysable } = planFiles(
    await ports.store.listFiles(),
    head,
    textPaths,
    settings.thresholdBytes,
  )
  await ports.store.reconcileFiles(plan)
  onProgress?.(70, 100, `Processing files: ${head.length}`)

  const wanted = new Set(analysable)
  const fileIds = new Map<string, number>()
  for (const file of await ports.store.listFiles()) {
    if (wanted.has(file.path)) fileIds.set(file.path, file.id)
  }
  return { analysable, fileIds }
}

/** Blame the given paths, a batch at a time, and store what they say. */
async function blameAll(
  ports: AnalysisPorts,
  settings: AnalysisSettings,
  revision: string,
  paths: string[],
  fileIds: Map<string, number>,
  onProgress?: ProgressReport,
): Promise<AnalysisFailure[]> {
  const failures: AnalysisFailure[] = []
  const ignored = settings.ignoreRevs?.revisions ?? []
  const authorIds = new Map(
    (await ports.store.listAuthors()).map((one) => [one.email, one.id]),
  )

  const blameOne = async (filePath: string): Promise<void> => {
    const fileId = fileIds.get(filePath)
    if (fileId === undefined) return

    try {
      const entries = await ports.git.blame(revision, filePath, ignored)

      const missing = identitiesIn(entries).filter(
        (one) => !authorIds.has(one.email),
      )
      if (missing.length > 0) {
        // Two files in one batch can both introduce the same person. The
        // store's ensureAuthors is idempotent, so both get the one row.
        for (const [email, id] of await ports.store.ensureAuthors(missing)) {
          authorIds.set(email, id)
        }
      }

      const lines = linesFrom(entries, authorIds)
      if (lines.length > 0) await ports.store.storeBlame(fileId, lines)
    } catch (error) {
      // A file that cannot be read contributes nothing rather than failing
      // the whole run. Written down, and marked in the store too: without
      // that the file still satisfies "not binary, not ignored, not
      // oversized" and is counted as analysed, so the statistics would claim
      // to have read a file the menu screen reports as unread.
      failures.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      await ports.store.markAnalysisFailed(fileId)
    }
  }

  const batchSize = normaliseConcurrency(settings.concurrency)
  let processed = 0
  for (let at = 0; at < paths.length; at += batchSize) {
    const batch = paths.slice(at, at + batchSize)
    await Promise.allSettled(batch.map(blameOne))
    processed += batch.length
    onProgress?.(
      Math.min(70 + (processed / paths.length) * 30, 100),
      100,
      `Analyzed ${Math.min(processed, paths.length)}/${paths.length} files`,
    )
  }

  return failures
}

/** Read the whole revision: every file discovered, every readable file blamed. */
export async function analyseRevision(
  ports: AnalysisPorts,
  settings: AnalysisSettings,
  onProgress?: ProgressReport,
): Promise<AnalysisOutcome> {
  onProgress?.(0, 100, 'Getting repository files...')
  const context = contextFor(
    await describeRevision(ports.git),
    settings.ignoreRevs ?? NO_IGNORE_REVS,
  )

  const { analysable, fileIds } = await discover(
    ports,
    settings,
    context,
    onProgress,
  )
  onProgress?.(
    70,
    100,
    `Processing blame data for ${analysable.length} files...`,
  )

  let failures: AnalysisFailure[] = []
  if (context.headSha !== null && analysable.length > 0) {
    // Whatever is about to be read must lose its old lines first, or a file
    // read twice would own both versions.
    await ports.store.forgetBlame([...fileIds.values()])
    failures = await blameAll(
      ports,
      settings,
      context.headSha,
      analysable,
      fileIds,
      onProgress,
    )
  }

  onProgress?.(100, 100, 'Git analysis complete!')
  return { blamed: analysable.length, reused: 0, context, failures }
}

/**
 * Bring a stored analysis up to date instead of rebuilding it.
 *
 * Discovery runs in full; what is skipped is blame, which is the other nine
 * tenths. `touched` must be every path any commit in the interval touched,
 * not the paths that differ between the endpoints: a change made and undone
 * within the interval leaves the two ends identical while moving every line
 * it touched to a different commit.
 */
export async function updateAnalysis(
  ports: AnalysisPorts,
  settings: AnalysisSettings,
  touched: Set<string>,
  onProgress?: ProgressReport,
): Promise<AnalysisOutcome> {
  onProgress?.(0, 100, 'Checking what changed...')
  const context = contextFor(
    await describeRevision(ports.git),
    settings.ignoreRevs ?? NO_IGNORE_REVS,
  )

  const { analysable, fileIds } = await discover(
    ports,
    settings,
    context,
    onProgress,
  )
  const toBlame = analysable.filter((filePath) => touched.has(filePath))
  onProgress?.(
    70,
    100,
    `Re-reading ${toBlame.length} changed file${toBlame.length === 1 ? '' : 's'}...`,
  )

  let failures: AnalysisFailure[] = []
  if (context.headSha !== null && toBlame.length > 0) {
    await ports.store.forgetBlame(
      toBlame.flatMap((filePath) => {
        const id = fileIds.get(filePath)
        return id === undefined ? [] : [id]
      }),
    )
    failures = await blameAll(
      ports,
      settings,
      context.headSha,
      toBlame,
      fileIds,
      onProgress,
    )
  }

  onProgress?.(100, 100, 'Git analysis complete!')
  return {
    blamed: toBlame.length,
    reused: analysable.length - toBlame.length,
    context,
    failures,
  }
}
