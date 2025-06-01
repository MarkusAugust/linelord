import { eq, sql, desc, inArray } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authors, files, blameLines, authorAliases } from '../db/schema'

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
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false`
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
        sql`${files.isLargerThanThreshold} = true AND ${files.isBinary} = false AND ${files.isIgnored} = false`
      )

    const [totalLinesResult] = await this.db
      .select({ total: sql<number>`sum(total_lines)` })
      .from(files)
      .where(
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false`
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
      totalAuthors: totalAuthorsResult?.count || 0
    }
  }

  async getAuthorContributions(): Promise<AuthorContribution[]> {
    // Get canonical authors with their contribution data
    const canonicalAuthors = await this.db
      .select({
        id: authors.id,
        name: authors.name,
        email: authors.email,
        displayName: authors.displayName
      })
      .from(authors)
      .where(eq(authors.isCanonical, true))

    const stats = await this.getRepositoryStats()
    const totalProjectLines = stats.totalLines

    const results: AuthorContribution[] = []

    for (const author of canonicalAuthors) {
      // Get all author IDs that belong to this canonical author
      const allAuthorIds = await this.db
        .select({ id: authors.id })
        .from(authors)
        .where(eq(authors.canonicalId, author.id))

      const authorIdsList = allAuthorIds.map((a) => a.id)

      // Get total lines for this canonical author
      const [linesResult] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(blameLines)
        .where(inArray(blameLines.authorId, authorIdsList))

      // Get total files for this canonical author
      const [filesResult] = await this.db
        .select({ count: sql<number>`count(distinct ${blameLines.fileId})` })
        .from(blameLines)
        .where(inArray(blameLines.authorId, authorIdsList))

      // Get aliases
      const aliases = await this.db
        .select({
          name: authorAliases.aliasName,
          email: authorAliases.aliasEmail
        })
        .from(authorAliases)
        .where(eq(authorAliases.canonicalAuthorId, author.id))

      const totalLines = linesResult?.count || 0
      const totalFiles = filesResult?.count || 0

      results.push({
        id: author.id,
        name: author.name,
        email: author.email,
        displayName: author.displayName,
        totalLines,
        totalFiles,
        percentage:
          totalProjectLines > 0
            ? Math.round((totalLines / totalProjectLines) * 100)
            : 0,
        aliases: aliases.map((a) => ({ name: a.name, email: a.email }))
      })
    }

    return results
      .filter((r) => r.totalLines > 0)
      .sort((a, b) => b.totalLines - a.totalLines)
  }

  async getAuthorFileContributions(
    canonicalAuthorId: number
  ): Promise<FileContribution[]> {
    // Get all author IDs that belong to this canonical author
    const allAuthorIds = await this.db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.canonicalId, canonicalAuthorId))

    const authorIdsList = allAuthorIds.map((a) => a.id)

    // Simplified query - extract filename in JavaScript
    const results = await this.db
      .select({
        path: files.path,
        authorLines: sql<number>`count(${blameLines.id})`,
        totalLines: files.totalLines
      })
      .from(files)
      .innerJoin(blameLines, eq(files.id, blameLines.fileId))
      .where(inArray(blameLines.authorId, authorIdsList))
      .groupBy(files.id)
      .orderBy(desc(sql`count(${blameLines.id})`))

    return results.map((result) => {
      // Extract filename from path in JavaScript
      const filename = result.path.split('/').pop() || result.path

      return {
        filename,
        path: result.path,
        authorLines: result.authorLines,
        totalLines: result.totalLines || 0,
        percentage:
          (result.totalLines ?? 0) > 0
            ? Math.round((result.authorLines / (result.totalLines ?? 0)) * 100)
            : 0
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
        displayName: authors.displayName
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
        aliases: aliases.map((a) => a.name)
      })
    }

    return result
  }

  // Helper method to find author by any name/email combination
  async findAuthorByNameOrEmail(
    name: string,
    email: string
  ): Promise<number | null> {
    // First try to find by canonical author
    const [canonical] = await this.db
      .select({ id: authors.id })
      .from(authors)
      .where(
        sql`(${authors.name} = ${name} OR ${authors.email} = ${email}) AND ${authors.isCanonical} = true`
      )

    if (canonical) return canonical.id

    // Try to find by alias
    const [alias] = await this.db
      .select({ canonicalAuthorId: authorAliases.canonicalAuthorId })
      .from(authorAliases)
      .where(
        sql`${authorAliases.aliasName} = ${name} OR ${authorAliases.aliasEmail} = ${email}`
      )

    return alias?.canonicalAuthorId || null
  }
}
