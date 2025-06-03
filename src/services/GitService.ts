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

  constructor(
    private repoPath: string,
    private db: LineLordDatabase,
    private largeFileThresholdBytes: number = 50 * 1024,
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

    // Process all files and determine which ones to analyze
    const filesToAnalyze: string[] = []
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i]
      if (!file) {
        continue
      }
      const fileInfo = await this.getFileInfo(file)

      // Insert file record with all metadata
      await this.insertFileRecord(file, fileInfo)

      // Only analyze files that are not binary, not ignored, and not larger than threshold
      if (
        !fileInfo.isBinary &&
        !fileInfo.isIgnored &&
        !fileInfo.isLargerThanThreshold
      ) {
        filesToAnalyze.push(file)
      }

      if (i % 100 === 0) {
        onProgress?.(
          10 + (i / allFiles.length) * 60, // Changed from 20 to 60 since we removed the final step
          100,
          `Processing files: ${i}/${allFiles.length}`,
        )
      }
    }

    onProgress?.(
      70,
      100,
      `Processing blame data for ${filesToAnalyze.length} files...`,
    )

    // Process blame data in batches
    const batchSize = 10
    for (let i = 0; i < filesToAnalyze.length; i += batchSize) {
      const batch = filesToAnalyze.slice(i, i + batchSize)

      await Promise.all(batch.map((file) => this.processFileBlame(file)))

      const progress = 70 + ((i + batchSize) / filesToAnalyze.length) * 30
      onProgress?.(
        Math.min(progress, 100),
        100,
        `Analyzed ${Math.min(i + batchSize, filesToAnalyze.length)}/${
          filesToAnalyze.length
        } files`,
      )
    }

    onProgress?.(100, 100, 'Git analysis complete!')
  }

  private async getFileInfo(filePath: string): Promise<{
    isBinary: boolean
    isIgnored: boolean
    isLargerThanThreshold: boolean
    size: number
  }> {
    const ext = path.extname(filePath).toLowerCase()

    const isBinary = binaryExts.has(ext)
    const isIgnored = this.isFileIgnored(filePath, ext)

    // Check file size
    let size = 0
    let isLargerThanThreshold = false

    try {
      const fullPath = path.join(this.repoPath, filePath)
      const stats = await stat(fullPath)
      size = stats.size
      isLargerThanThreshold = size > this.largeFileThresholdBytes
    } catch {
      // File might not exist, treat as binary
      return {
        isBinary: true,
        isIgnored: true,
        isLargerThanThreshold: false,
        size: 0,
      }
    }

    return { isBinary, isIgnored, isLargerThanThreshold, size }
  }

  private isFileIgnored(filePath: string, ext: string): boolean {
    // Check if extension is in ignored list
    if (ignoredFileExtensions.has(ext)) {
      return true
    }

    // Check if file matches any ignored patterns
    for (const pattern of ignoredFilePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return true
      }
    }

    return false
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')

    const regex = new RegExp(`^${regexPattern}$`)

    // Test both the full path and just the filename
    const filename = path.basename(filePath)
    return (
      regex.test(filePath) ||
      regex.test(filename) ||
      filePath.includes(pattern.replace(/\*/g, ''))
    )
  }

  private async insertFileRecord(
    filePath: string,
    fileInfo: {
      isBinary: boolean
      isIgnored: boolean
      isLargerThanThreshold: boolean
      size: number
    },
  ) {
    const ext = path.extname(filePath).toLowerCase()

    await this.db
      .insert(files)
      .values({
        path: filePath,
        extension: ext || null,
        size: fileInfo.size,
        isBinary: fileInfo.isBinary,
        isLargerThanThreshold: fileInfo.isLargerThanThreshold,
        isIgnored: fileInfo.isIgnored,
        totalLines: 0,
      })
      .onConflictDoNothing()
  }

  private async execGitBlame(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', ['blame', '--line-porcelain', filePath], {
        cwd: this.repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`git blame failed with code ${code}: ${stderr}`))
        }
      })

      child.on('error', (error) => {
        reject(error)
      })
    })
  }

  private async processFileBlame(filePath: string) {
    try {
      const stdout = await this.execGitBlame(filePath)
      const lines = stdout.trim().split('\n')
      let currentAuthor = ''
      let currentEmail = ''
      let currentCommitHash = ''
      let currentCommitDate = ''
      let lineNumber = 0

      // Get file ID
      const [fileRecord] = await this.db
        .select()
        .from(files)
        .where(eq(files.path, filePath))
      if (!fileRecord) return

      const blameData: Array<{
        fileId: number
        authorId: number
        lineNumber: number
        content: string | null
        commitHash: string | null
        commitDate: string | null
      }> = []

      for (const line of lines) {
        if (line.startsWith('author ')) {
          currentAuthor = line.substring(7).trim()
        } else if (line.startsWith('author-mail ')) {
          currentEmail = line.substring(12).trim().replace(/[<>]/g, '')
        } else if (line.match(/^[a-f0-9]{40}/)) {
          currentCommitHash = line.split(' ')[0] || ''
        } else if (line.startsWith('author-time ')) {
          const timestamp = Number.parseInt(line.substring(12).trim())
          currentCommitDate = new Date(timestamp * 1000).toISOString()
        } else if (line.startsWith('\t')) {
          // This is a code line
          lineNumber++

          // Get or create author
          const authorId = await this.getOrCreateAuthor(
            currentAuthor,
            currentEmail,
          )

          blameData.push({
            fileId: fileRecord.id,
            authorId,
            lineNumber,
            content: line.substring(1), // Remove tab
            commitHash: currentCommitHash || null,
            commitDate: currentCommitDate || null,
          })
        }
      }

      // Batch insert blame data
      if (blameData.length > 0) {
        await this.db.insert(blameLines).values(blameData)

        // Update file total lines
        await this.db
          .update(files)
          .set({ totalLines: blameData.length })
          .where(eq(files.id, fileRecord.id))
      }
    } catch (error) {
      console.warn(`Failed to process blame for ${filePath}:`, error)
    }
  }

  private async getOrCreateAuthor(
    name: string,
    email: string,
  ): Promise<number> {
    // Check cache first
    if (this.authorCache.has(email)) {
      const cachedId = this.authorCache.get(email)
      if (cachedId !== undefined) {
        return cachedId
      }
      throw new Error(`Author ID for email ${email} not found in cache.`)
    }

    // Check database
    const [existing] = await this.db
      .select()
      .from(authors)
      .where(eq(authors.email, email))

    if (existing) {
      this.authorCache.set(email, existing.id)
      return existing.id
    }

    // Create new author as canonical
    const [newAuthor] = await this.db
      .insert(authors)
      .values({
        name,
        email,
        displayName: this.normalizeDisplayName(name),
        isCanonical: true,
      })
      .returning()

    if (!newAuthor) {
      throw new Error(`Failed to insert new author for email: ${email}`)
    }

    await this.db
      .update(authors)
      .set({ canonicalId: newAuthor.id })
      .where(eq(authors.id, newAuthor.id))

    this.authorCache.set(email, newAuthor.id)
    return newAuthor.id
  }

  private normalizeDisplayName(name: string): string {
    let normalizedDisplayName = name.trim()

    if (normalizedDisplayName.includes(',')) {
      // "LastName, FirstName" -> "FirstName LastName"
      const parts = normalizedDisplayName.split(',').map((p) => p.trim())
      if (parts.length === 2) {
        normalizedDisplayName = `${parts[1]} ${parts[0]}`
      }
    }
    // Remove extra whitespace
    normalizedDisplayName = normalizedDisplayName.replace(/\s+/g, ' ').trim()

    return normalizedDisplayName
  }
}
