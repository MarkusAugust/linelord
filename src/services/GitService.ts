import { exec, spawn } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authors, blameLines, files } from '../db/schema'
import {
  binaryExts,
  ignoredFileExtensions,
  ignoredFilePatterns,
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

export class GitService {
  private authorCache = new Map<string, number>() // email -> id
  private fileIdCache = new Map<string, number>() // filepath -> id
  private analysisContext: AnalysisContext = {
    headSha: null,
    uncommittedFileCount: 0,
  }

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

    this.analysisContext = await this.resolveAnalysisContext()

    const allFiles = await this.listHeadFiles()
    onProgress?.(10, 100, `Found ${allFiles.length} files`)

    // Process files in bigger batches
    const filesToAnalyze = await this.processFilesInBatches(
      allFiles,
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
        const classification = this.classifyFile(file)
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

    // Get file IDs for files we'll analyze
    const fileRecords = await this.db
      .select({ id: files.id, path: files.path })
      .from(files)

    for (const record of fileRecords) {
      if (filesToAnalyze.includes(record.path)) {
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
  private classifyFile(file: HeadFile): {
    isBinary: boolean
    isIgnored: boolean
    isLargerThanThreshold: boolean
    size: number
  } {
    const ext = path.extname(file.path).toLowerCase()

    if (binaryExts.has(ext)) {
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

      const blameData: Array<{
        fileId: number
        authorId: number
        lineNumber: number
        content: string | null
        commitHash: string | null
        commitDate: string | null
      }> = []

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
            content,
            commitHash: currentCommitHash || null,
            commitDate: currentCommitDate || null,
          })
        }
      }

      if (blameData.length > 0) {
        await this.db.insert(blameLines).values(blameData)
        await this.db
          .update(files)
          .set({ totalLines: blameData.length })
          .where(eq(files.id, fileId))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A tracked file that has been staged but never committed has no content
      // in HEAD. Excluding it is the correct outcome of a HEAD analysis, not a
      // failure worth reporting.
      if (message.includes('no such path')) return

      console.warn(`Failed to process blame for ${filePath}:`, error)
    }
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
   */
  private runGit(args: string[]): Promise<string> {
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
        if (code === 0) {
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
    if (ignoredFileExtensions.has(ext)) return true

    for (const pattern of ignoredFilePatterns) {
      if (this.matchesPattern(filePath, pattern)) return true
    }
    return false
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')

    const regex = new RegExp(`^${regexPattern}$`)
    const filename = path.basename(filePath)
    return (
      regex.test(filePath) ||
      regex.test(filename) ||
      filePath.includes(pattern.replace(/\*/g, ''))
    )
  }
}
