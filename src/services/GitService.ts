import { exec, spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
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

export class GitService {
  private authorCache = new Map<string, number>() // email -> id
  private fileIdCache = new Map<string, number>() // filepath -> id

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

    // Get all tracked files
    const { stdout } = await execAsync('git ls-files', {
      cwd: this.repoPath,
      maxBuffer: 50 * 1024 * 1024,
    })

    const allFiles = stdout.trim().split('\n').filter(Boolean)
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
    allFiles: string[],
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

      const batchResults = await Promise.allSettled(
        batch.map(async (file) => {
          const fileInfo = await this.getFileInfo(file)
          const ext = path.extname(file).toLowerCase()

          return {
            file,
            data: {
              path: file,
              extension: ext || null,
              size: fileInfo.size,
              isBinary: fileInfo.isBinary,
              isLargerThanThreshold: fileInfo.isLargerThanThreshold,
              isIgnored: fileInfo.isIgnored,
              totalLines: 0,
            },
            shouldAnalyze:
              !fileInfo.isBinary &&
              !fileInfo.isIgnored &&
              !fileInfo.isLargerThanThreshold,
          }
        }),
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          fileDataBatch.push(result.value.data)
          if (result.value.shouldAnalyze) {
            filesToAnalyze.push(result.value.file)
          }
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

  private async getFileInfo(filePath: string): Promise<{
    isBinary: boolean
    isIgnored: boolean
    isLargerThanThreshold: boolean
    size: number
  }> {
    const ext = path.extname(filePath).toLowerCase()

    const isBinary = binaryExts.has(ext)
    if (isBinary) {
      return {
        isBinary: true,
        isIgnored: false,
        isLargerThanThreshold: false,
        size: 0,
      }
    }

    const isIgnored = this.isFileIgnored(filePath, ext)
    if (isIgnored) {
      return {
        isBinary: false,
        isIgnored: true,
        isLargerThanThreshold: false,
        size: 0,
      }
    }

    try {
      const fullPath = path.join(this.repoPath, filePath)
      const stats = await stat(fullPath)
      const size = stats.size
      const isLargerThanThreshold = size > this.largeFileThresholdBytes
      return { isBinary, isIgnored, isLargerThanThreshold, size }
    } catch {
      return {
        isBinary: true,
        isIgnored: true,
        isLargerThanThreshold: false,
        size: 0,
      }
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
      console.warn(`Failed to process blame for ${filePath}:`, error)
    }
  }

  private async execGitBlame(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'git',
        ['blame', '-w', '--line-porcelain', filePath],
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
