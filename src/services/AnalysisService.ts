import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authorAliases, authors, blameLines, files } from '../db/schema'

export interface FileContribution {
  filename: string
  path: string
  authorLines: number
  totalLines: number
  percentage: number
}

export interface AuthorContribution {
  id: number
  name: string
  email: string
  displayName: string
  totalLines: number
  totalFiles: number
  percentage: number
  title: string | null
  rank: number | null
  aliases?: Array<{ name: string; email: string }>
}

export interface RepositoryStats {
  totalFiles: number
  totalAnalyzedFiles: number
  totalBinaryFiles: number
  totalIgnoredFiles: number
  totalLargeFiles: number
  totalLines: number
  totalAuthors: number
}

export class AnalysisService {
  constructor(private db: LineLordDatabase) {}

  async getRepositoryStats(): Promise<RepositoryStats> {
    const [totalFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)

    const [analyzedFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false`,
      )

    const [binaryFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(eq(files.isBinary, true))

    const [ignoredFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(sql`${files.isIgnored} = true AND ${files.isBinary} = false`)

    const [largeFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        sql`${files.isLargerThanThreshold} = true AND ${files.isBinary} = false AND ${files.isIgnored} = false`,
      )

    const [totalLinesResult] = await this.db
      .select({ total: sql<number>`sum(total_lines)` })
      .from(files)
      .where(
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false`,
      )

    const [totalAuthorsResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(authors)

    return {
      totalFiles: totalFilesResult?.count || 0,
      totalAnalyzedFiles: analyzedFilesResult?.count || 0,
      totalBinaryFiles: binaryFilesResult?.count || 0,
      totalIgnoredFiles: ignoredFilesResult?.count || 0,
      totalLargeFiles: largeFilesResult?.count || 0,
      totalLines: totalLinesResult?.total || 0,
      totalAuthors: totalAuthorsResult?.count || 0,
    }
  }

  /**
   * Get author contributions - now simply reads from the database
   * since rank and percentage are already calculated and stored
   */
  async getAuthorContributions(): Promise<AuthorContribution[]> {
    const authorContributions = await this.db
      .select({
        id: authors.id,
        name: authors.name,
        email: authors.email,
        displayName: authors.displayName,
        title: authors.title,
        rank: authors.rank,
        percentage: authors.percentage,
        totalLines: sql<number>`count(${blameLines.id})`.mapWith(Number),
        totalFiles: sql<number>`count(DISTINCT ${blameLines.fileId})`.mapWith(
          Number,
        ),
      })
      .from(authors)
      .leftJoin(blameLines, eq(authors.id, blameLines.authorId))
      .where(eq(authors.isCanonical, true))
      .groupBy(authors.id)
      .orderBy(
        sql`CASE WHEN ${authors.rank} IS NULL THEN 999999 ELSE ${authors.rank} END ASC`,
      )

    // Filter to only authors with contributions and return results
    return authorContributions
      .filter((author) => author.totalLines > 0)
      .map((author) => ({
        id: author.id,
        name: author.name,
        email: author.email,
        displayName: author.displayName,
        totalLines: author.totalLines,
        totalFiles: author.totalFiles,
        percentage: author.percentage || 0, // Use stored percentage
        title: author.title,
        rank: author.rank,
      }))
  }

  async getAuthorFileContributions(
    canonicalAuthorId: number,
  ): Promise<FileContribution[]> {
    // Get all author IDs that belong to this canonical author
    const allAuthorIds = await this.db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.canonicalId, canonicalAuthorId))

    const authorIdsList = allAuthorIds.map((a) => a.id)

    // Get file contributions for this author
    const results = await this.db
      .select({
        path: files.path,
        authorLines: sql<number>`count(${blameLines.id})`,
        totalLines: files.totalLines,
      })
      .from(files)
      .innerJoin(blameLines, eq(files.id, blameLines.fileId))
      .where(inArray(blameLines.authorId, authorIdsList))
      .groupBy(files.id)
      .orderBy(desc(sql`count(${blameLines.id})`))

    return results.map((result) => {
      // Extract filename from path
      const filename = result.path.split('/').pop() || result.path

      return {
        filename,
        path: result.path,
        authorLines: result.authorLines,
        totalLines: result.totalLines || 0,
        percentage:
          (result.totalLines ?? 0) > 0
            ? Math.round((result.authorLines / (result.totalLines ?? 0)) * 100)
            : 0,
      }
    })
  }

  async getAllAuthors(): Promise<
    Array<{
      id: number
      name: string
      email: string
      displayName: string
      aliases: string[]
    }>
  > {
    const canonicalAuthors = await this.db
      .select({
        id: authors.id,
        name: authors.name,
        email: authors.email,
        displayName: authors.displayName,
      })
      .from(authors)
      .where(eq(authors.isCanonical, true))
      .orderBy(authors.displayName)

    const result = []

    for (const author of canonicalAuthors) {
      const aliases = await this.db
        .select({ name: authorAliases.aliasName })
        .from(authorAliases)
        .where(eq(authorAliases.canonicalAuthorId, author.id))

      result.push({
        ...author,
        aliases: aliases.map((a) => a.name),
      })
    }

    return result
  }

  // Helper method to find author by any name/email combination
  async findCanonicalAuthorByEmail(email: string): Promise<number | null> {
    // First try to find by canonical author using EMAIL ONLY
    const [canonical] = await this.db
      .select({ id: authors.id })
      .from(authors)
      .where(sql`${authors.email} = ${email} AND ${authors.isCanonical} = true`)

    if (canonical) return canonical.id

    // Try to find by alias email
    const [alias] = await this.db
      .select({ canonicalAuthorId: authorAliases.canonicalAuthorId })
      .from(authorAliases)
      .where(sql`${authorAliases.aliasEmail} = ${email}`)

    return alias?.canonicalAuthorId || null
  }
}
