import { exec, spawn } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authors, blameLines, files } from '../db/schema'
import {
  ignoredFileExtensions,
  isIgnoredByPattern,
} from '../resources/ignoreFiles'

const execAsync = promisify(exec)

/** A commit hash of all zeroes is git's marker for a line that is not committed. */
const UNCOMMITTED_SHA = /^0+$/

export interface AnalysisContext {
  /** The revision the analysis was run against, or null in a repository with no commits. */
  headSha: string | null
  /** Tracked files whose working-copy content differs from HEAD and is therefore not counted. */
  uncommittedFileCount: number
}

/** One blob in the HEAD tree: the path it is stored under, and its size there. */
interface HeadFile {
  path: string
  size: number
}

/**
 * Rows per insert statement. Five columns each, so 500 rows binds 2,500
 * parameters -- comfortably inside what SQLite accepts, with room for the
 * schema to gain a column without anyone having to remember this number.
 */
const BLAME_INSERT_CHUNK = 500

type BlameLineInsert = {
  fileId: number
  authorId: number
  lineNumber: number
  commitHash: string | null
  commitDate: string | null
}

/** A file whose blame could not be read, kept for the UI to report. */
export interface AnalysisFailure {
  path: string
  error: string
}

export class GitService {
  private authorCache = new Map<string, number>() // email -> id
  private fileIdCache = new Map<string, number>() // filepath -> id
  private analysisContext: AnalysisContext = {
    headSha: null,
    uncommittedFileCount: 0,
  }
  /**
   * Files that could not be read, collected rather than printed.
   *
   * Writing to stdout or stderr while Ink holds the terminal puts text where
   * the UI is drawing. Ink's patchConsole relocates it above the frame rather
   * than letting it overwrite the app, so the result is a disturbed display
   * rather than a destroyed one -- but the message still appears from nowhere,
   * is lost on the next render, and never reaches anyone who has scrolled.
   * The UI reports these instead.
   */
  private failures: AnalysisFailure[] = []

  constructor(
    private repoPath: string,
    private db: LineLordDatabase,
    private largeFileThresholdBytes: number = 50 * 1024,
    private concurrency = 25, // Increased concurrency
  ) {}

  async initialize(
    onProgress?: (current: number, total: number, message: string) => void,
  ) {
    onProgress?.(0, 100, 'Getting repository files...')

    this.failures = []
    this.analysisContext = await this.resolveAnalysisContext()

    const allFiles = await this.listHeadFiles()
    onProgress?.(10, 100, `Found ${allFiles.length} files`)

    const textPaths =
      allFiles.length > 0 ? await this.listTextFiles() : new Set<string>()

    // Process files in bigger batches
    const filesToAnalyze = await this.processFilesInBatches(
      allFiles,
      textPaths,
      onProgress,
    )

    onProgress?.(
      70,
      100,
      `Processing blame data for ${filesToAnalyze.length} files...`,
    )

    // Pre-populate caches for faster lookups
    await this.populateCaches(filesToAnalyze)

    // Process blame in batches
    await this.processBlameInBatches(filesToAnalyze, onProgress)

    onProgress?.(100, 100, 'Git analysis complete!')
  }

  private async processFilesInBatches(
    allFiles: HeadFile[],
    textPaths: Set<string>,
    onProgress?: (current: number, total: number, message: string) => void,
  ): Promise<string[]> {
    const filesToAnalyze: string[] = []
    const batchSize = Math.min(this.concurrency * 2, 100) // Larger batches
    let processed = 0

    // Collect all file data first
    const fileDataBatch: Array<{
      path: string
      extension: string | null
      size: number
      isBinary: boolean
      isLargerThanThreshold: boolean
      isIgnored: boolean
      totalLines: number
    }> = []

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize)

      for (const file of batch) {
        const classification = this.classifyFile(file, textPaths)
        const ext = path.extname(file.path).toLowerCase()

        fileDataBatch.push({
          path: file.path,
          extension: ext || null,
          size: classification.size,
          isBinary: classification.isBinary,
          isLargerThanThreshold: classification.isLargerThanThreshold,
          isIgnored: classification.isIgnored,
          totalLines: 0,
        })

        if (
          !classification.isBinary &&
          !classification.isIgnored &&
          !classification.isLargerThanThreshold
        ) {
          filesToAnalyze.push(file.path)
        }
      }

      processed += batch.length
      onProgress?.(
        10 + (processed / allFiles.length) * 60,
        100,
        `Processing files: ${processed}/${allFiles.length}`,
      )

      // Insert in larger batches (every 500 files)
      if (fileDataBatch.length >= 500) {
        await this.db.insert(files).values(fileDataBatch).onConflictDoNothing()
        fileDataBatch.length = 0
      }
    }

    // Insert remaining files
    if (fileDataBatch.length > 0) {
      await this.db.insert(files).values(fileDataBatch).onConflictDoNothing()
    }

    return filesToAnalyze
  }

  private async populateCaches(filesToAnalyze: string[]) {
    // Get all authors at once
    const allAuthors = await this.db
      .select({ id: authors.id, email: authors.email })
      .from(authors)
    for (const author of allAuthors) {
      this.authorCache.set(author.email, author.id)
    }

    // Get file IDs for files we'll analyze.
    //
    // The membership test used to be `filesToAnalyze.includes(...)` inside a
    // loop over every file row, which is a linear scan per row: quadratic in
    // the number of files, and invisible until a repository is large enough
    // for it to matter.
    const wanted = new Set(filesToAnalyze)
    const fileRecords = await this.db
      .select({ id: files.id, path: files.path })
      .from(files)

    for (const record of fileRecords) {
      if (wanted.has(record.path)) {
        this.fileIdCache.set(record.path, record.id)
      }
    }
  }

  private async processBlameInBatches(
    filesToAnalyze: string[],
    onProgress?: (current: number, total: number, message: string) => void,
  ) {
    const batchSize = Math.min(this.concurrency, 12) // Don't overwhelm git
    let processed = 0

    for (let i = 0; i < filesToAnalyze.length; i += batchSize) {
      const batch = filesToAnalyze.slice(i, i + batchSize)

      await Promise.allSettled(batch.map((file) => this.processFileBlame(file)))

      processed += batch.length
      const progress = 70 + (processed / filesToAnalyze.length) * 30
      onProgress?.(
        Math.min(progress, 100),
        100,
        `Analyzed ${Math.min(processed, filesToAnalyze.length)}/${
          filesToAnalyze.length
        } files`,
      )
    }
  }

  /**
   * Decide what to do with one file from HEAD.
   *
   * This used to stat the working copy, which was wrong in two ways once the
   * analysis is defined as HEAD: a file staged for deletion is not on disk at
   * all, and a modified file reports the size of content that is not being
   * analysed. The size now comes from the HEAD blob, so there is nothing left
   * that can fail -- and with it goes the old catch block, which reported an
   * unreadable file as both binary and ignored, hiding it with no trace.
   */
  private classifyFile(
    file: HeadFile,
    textPaths: Set<string>,
  ): {
    isBinary: boolean
    isIgnored: boolean
    isLargerThanThreshold: boolean
    size: number
  } {
    const ext = path.extname(file.path).toLowerCase()

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

    if (this.isFileIgnored(file.path, ext)) {
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
      isLargerThanThreshold: file.size > this.largeFileThresholdBytes,
      size: file.size,
    }
  }

  private async processFileBlame(filePath: string) {
    try {
      const stdout = await this.execGitBlame(filePath)
      const lines = stdout.trim().split('\n')

      const fileId = this.fileIdCache.get(filePath)
      if (!fileId) return

      const blameData: BlameLineInsert[] = []

      let currentAuthor = ''
      let currentEmail = ''
      let currentCommitHash = ''
      let currentCommitDate = ''
      let lineNumber = 0

      for (const line of lines) {
        if (line.startsWith('author ')) {
          currentAuthor = line.substring(7).trim()
        } else if (line.startsWith('author-mail ')) {
          currentEmail = line.substring(12).trim().replace(/[<>]/g, '')
        } else if (line.match(/^[a-f0-9]{40}/)) {
          currentCommitHash = line.split(' ')[0] || ''
        } else if (line.startsWith('author-time ')) {
          const timestamp = Number.parseInt(line.substring(12).trim(), 10)
          currentCommitDate = new Date(timestamp * 1000).toISOString()
        } else if (line.startsWith('\t')) {
          const content = line.substring(1)
          if (content.trim() === '') continue

          // Defensive: blaming HEAD should never produce uncommitted lines, but
          // a null sha must never be allowed to create a "Not Committed Yet"
          // author row if one ever slips through.
          if (UNCOMMITTED_SHA.test(currentCommitHash)) continue

          lineNumber++
          const authorId = await this.getOrCreateAuthor(
            currentAuthor,
            currentEmail,
          )

          blameData.push({
            fileId,
            authorId,
            lineNumber,
            commitHash: currentCommitHash || null,
            commitDate: currentCommitDate || null,
          })
        }
      }

      if (blameData.length > 0) {
        this.storeBlameLines(fileId, blameData)
      }
    } catch (error) {
      // There used to be a guard here that swallowed "no such path", for a file
      // staged but never committed. That case cannot arise any more: the file
      // list is enumerated from the tree of the same revision blame is given,
      // so every path reaching this point exists in it. What the guard did
      // instead was hide the real cause of that message -- an object missing
      // from the repository -- turning a corrupt blob into a file that quietly
      // contributed nothing.
      const message = error instanceof Error ? error.message : String(error)
      this.failures.push({ path: filePath, error: message })

      // Mark it in the database too. Without this the file still satisfies
      // "not binary, not ignored, not oversized" and is counted as analysed,
      // so the statistics would claim to have read a file the menu screen is
      // simultaneously reporting as unread.
      const fileId = this.fileIdCache.get(filePath)
      if (fileId !== undefined) {
        await this.db
          .update(files)
          .set({ analysisFailed: true })
          .where(eq(files.id, fileId))
      }
    }
  }

  /**
   * Store one file's blame lines, in chunks, inside a transaction.
   *
   * Each row binds six values, and an insert is a single statement with one
   * placeholder per value, so one `values()` call for a long file asks SQLite
   * to bind more parameters than it will accept. The insert then threw, the
   * catch above swallowed it, and the file's entire blame was lost -- not a
   * crash, and not a partial result either: nothing at all, for that file.
   * Measured before this change, a 10,000-line file stored all of its lines
   * and a 20,000-line file stored none of them.
   *
   * The transaction makes the rows and the line count on the file row land
   * together, so a failure part-way cannot leave a file claiming a total it
   * does not have.
   */
  private storeBlameLines(fileId: number, rows: BlameLineInsert[]): void {
    this.db.transaction((tx) => {
      for (let start = 0; start < rows.length; start += BLAME_INSERT_CHUNK) {
        tx.insert(blameLines)
          .values(rows.slice(start, start + BLAME_INSERT_CHUNK))
          .run()
      }

      tx.update(files)
        .set({ totalLines: rows.length })
        .where(eq(files.id, fileId))
        .run()
    })
  }

  /**
   * The exact commit every git command in this run must be told to read.
   *
   * Resolving HEAD once and then passing the symbolic ref to each command
   * afterwards would let the analysis straddle two revisions: a commit or a
   * branch switch in another terminal partway through -- and an analysis can
   * take minutes on a large repository -- would leave the file list, the
   * blame output and the SHA the UI reports describing different trees.
   * Pinning to the resolved SHA makes the run atomic with respect to that.
   */
  private analysedRevision(): string {
    const { headSha } = this.analysisContext
    if (headSha === null) {
      throw new Error(
        'No revision was resolved for this analysis; the repository has no commits.',
      )
    }
    return headSha
  }

  /**
   * Run git and return its stdout, streamed rather than buffered through a
   * shell. `ls-tree` on a large repository can exceed exec's buffer, and a
   * shell would mangle awkward paths on the way back regardless.
   *
   * `successCodes` exists because not every non-zero exit is a failure: git
   * grep reports "nothing matched" as exit 1, which for this caller is an
   * answer rather than an error.
   */
  private runGit(args: string[], successCodes = [0]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: this.repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const chunks: Buffer[] = []
      let stderr = ''

      child.stdout.on('data', (chunk) => chunks.push(chunk))
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== null && successCodes.includes(code)) {
          resolve(Buffer.concat(chunks).toString())
        } else {
          reject(
            new Error(
              `git ${args.join(' ')} failed with code ${code}: ${stderr.trim()}`,
            ),
          )
        }
      })
    })
  }

  /**
   * The files in HEAD, each with the size its blob has there.
   *
   * `git ls-files` lists the index, which is a different set of files. A file
   * staged for deletion leaves the index while remaining part of HEAD, so it
   * vanished from an analysis that claims to describe HEAD; a newly staged
   * file appears in the index with no content in HEAD to blame. Enumerating
   * HEAD directly settles both.
   *
   * -z separates records with NUL, so paths containing spaces, non-ASCII
   * characters or newlines arrive intact rather than quoted or split. -l
   * carries the blob size, which replaces a stat() per file against the
   * working copy -- the wrong content to measure, and absent entirely for a
   * file staged for deletion.
   */
  /**
   * The paths git itself considers text at the given revision.
   *
   * Binary detection used to be extension matching against a fixed list, and
   * it was wrong in both directions. A binary file with an unknown extension,
   * or no extension at all, was blamed as text and contributed invented lines
   * to a real author: a 3 KB blob produced thirteen of them. Meanwhile .svg
   * sat on the list, so every SVG -- which is XML somebody wrote -- was thrown
   * out as binary.
   *
   * git already makes this judgement, using the same rule it applies when
   * deciding whether to print a diff, and it honours any override in
   * .gitattributes. Asking it costs one command; on this repository, nine
   * milliseconds.
   */
  private async listTextFiles(): Promise<Set<string>> {
    const revision = this.analysedRevision()
    // -I drops what git calls binary, -e '' matches every line of what
    // remains, and -z keeps awkward paths intact on the way back.
    const stdout = await this.runGit(
      ['grep', '-I', '-z', '--name-only', '--full-name', '-e', '', revision],
      // 1 means nothing matched. A repository holding only binary blobs, or
      // only empty files, is an ordinary repository with no text in it -- not
      // a reason to fail the analysis, which is what treating this as an
      // error did. Anything above 1 is a real failure and still throws.
      [0, 1],
    )

    const prefix = `${revision}:`
    const paths = new Set<string>()
    for (const record of stdout.split('\0')) {
      if (record.startsWith(prefix)) {
        paths.add(record.slice(prefix.length))
      }
    }
    return paths
  }

  private async listHeadFiles(): Promise<HeadFile[]> {
    if (this.analysisContext.headSha === null) return []

    const stdout = await this.runGit([
      'ls-tree',
      '-r',
      '-l',
      '-z',
      this.analysedRevision(),
    ])
    const entries: HeadFile[] = []

    for (const record of stdout.split('\0')) {
      if (!record) continue

      // "<mode> <type> <sha> <size>\t<path>", and the path may contain
      // anything at all, so split on the first tab rather than on whitespace.
      const tab = record.indexOf('\t')
      if (tab === -1) continue

      const [, type, , rawSize] = record.slice(0, tab).split(/\s+/)
      // Submodules appear as commit entries with no size; they hold no lines.
      if (type !== 'blob') continue

      const size = Number.parseInt(rawSize ?? '', 10)
      entries.push({
        path: record.slice(tab + 1),
        size: Number.isNaN(size) ? 0 : size,
      })
    }

    return entries
  }

  /**
   * Records which revision the analysis describes, and how much of the working
   * copy it deliberately leaves out, so the UI can say so rather than present
   * HEAD's numbers as if they covered unsaved work.
   */
  private async resolveAnalysisContext(): Promise<AnalysisContext> {
    let headSha: string | null = null
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', {
        cwd: this.repoPath,
      })
      headSha = stdout.trim() || null
    } catch {
      // A repository with no commits yet has no HEAD to resolve.
      return { headSha: null, uncommittedFileCount: 0 }
    }

    let uncommittedFileCount = 0
    try {
      const { stdout } = await execAsync(
        'git status --porcelain -z --untracked-files=no',
        {
          cwd: this.repoPath,
          maxBuffer: 50 * 1024 * 1024,
        },
      )
      uncommittedFileCount = stdout.split('\0').filter(Boolean).length
    } catch {
      // Status is advisory only; failing to read it must not fail the analysis.
    }

    return { headSha, uncommittedFileCount }
  }

  getAnalysisContext(): AnalysisContext {
    return { ...this.analysisContext }
  }

  /** Files this run could not read. Empty when everything was analysed. */
  getFailures(): AnalysisFailure[] {
    return [...this.failures]
  }

  private async execGitBlame(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'git',
        // A commit, not the working copy: blaming the working copy attributes
        // unsaved edits to the pseudo-author "Not Committed Yet". The resolved
        // SHA rather than the symbolic ref, so that every file in the run is
        // blamed against the same tree even if HEAD moves meanwhile -- this
        // runs once per file, so a symbolic ref could straddle revisions
        // within a single analysis. `--` keeps a path that starts with a dash
        // from being read as an option.
        [
          'blame',
          '-w',
          '--line-porcelain',
          this.analysedRevision(),
          '--',
          filePath,
        ],
        {
          cwd: this.repoPath,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      const chunks: Buffer[] = []
      let stderr = ''

      child.stdout.on('data', (data) => chunks.push(data))
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString())
        } else {
          reject(new Error(`git blame failed with code ${code}: ${stderr}`))
        }
      })
      child.on('error', reject)
    })
  }

  private async getOrCreateAuthor(
    name: string,
    email: string,
  ): Promise<number> {
    if (this.authorCache.has(email)) {
      const cachedId = this.authorCache.get(email)
      if (cachedId === undefined) {
        throw new Error(`Author cache inconsistency for email: ${email}`)
      }
      return cachedId
    }

    const [existing] = await this.db
      .select()
      .from(authors)
      .where(eq(authors.email, email))
    if (existing) {
      this.authorCache.set(email, existing.id)
      return existing.id
    }

    const [newAuthor] = await this.db
      .insert(authors)
      .values({
        name,
        email,
        displayName: this.normalizeDisplayName(name),
        isCanonical: true,
      })
      .returning()

    if (!newAuthor) throw new Error(`Failed to insert author: ${email}`)

    await this.db
      .update(authors)
      .set({ canonicalId: newAuthor.id })
      .where(eq(authors.id, newAuthor.id))
    this.authorCache.set(email, newAuthor.id)
    return newAuthor.id
  }

  private normalizeDisplayName(name: string): string {
    let normalized = name.trim()
    if (normalized.includes(',')) {
      const parts = normalized.split(',').map((p) => p.trim())
      if (parts.length === 2) {
        normalized = `${parts[1]} ${parts[0]}`
      }
    }
    return normalized.replace(/\s+/g, ' ').trim()
  }

  private isFileIgnored(filePath: string, ext: string): boolean {
    return ignoredFileExtensions.has(ext) || isIgnoredByPattern(filePath)
  }
}
