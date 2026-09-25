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
  /** Files that were meant to be analysed but could not be read. */
  totalFailedFiles: number
  totalLines: number
  totalAuthors: number
}

export class AnalysisService {
  constructor(private db: LineLordDatabase) {}

  async getRepositoryStats(): Promise<RepositoryStats> {
    const [totalFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)

    // "Analysed" has to mean the file was actually read. A file whose blame
    // failed is none of binary, ignored or oversized, so without the last
    // condition it would be counted here while the UI reports it as unread.
    const [analyzedFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false AND ${files.analysisFailed} = false`,
      )

    const [failedFilesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(eq(files.analysisFailed, true))

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
        sql`${files.isBinary} = false AND ${files.isIgnored} = false AND ${files.isLargerThanThreshold} = false AND ${files.analysisFailed} = false`,
      )

    // Canonical authors who actually hold lines: the same population the
    // contributor list shows. A plain count over the authors table counted
    // every merged-away identity as a separate developer, so the two numbers
    // contradicted each other on the same screen.
    const [totalAuthorsResult] = await this.db
      .select({ count: sql<number>`count(DISTINCT ${authors.id})` })
      .from(authors)
      .innerJoin(blameLines, eq(authors.id, blameLines.authorId))
      .where(eq(authors.isCanonical, true))

    return {
      totalFiles: totalFilesResult?.count || 0,
      totalAnalyzedFiles: analyzedFilesResult?.count || 0,
      totalBinaryFiles: binaryFilesResult?.count || 0,
      totalIgnoredFiles: ignoredFilesResult?.count || 0,
      totalLargeFiles: largeFilesResult?.count || 0,
      totalFailedFiles: failedFilesResult?.count || 0,
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
      .orderBy(desc(sql`count(${blameLines.id})`), files.path)

    return results.map((result) => this.toFileContribution(result))
  }

  /**
   * The files each canonical author holds the most lines in, for everyone at
   * once.
   *
   * One query in place of one per author: a screen that lists every
   * contributor's top files was asking the database once per person, which on
   * a repository with a hundred of them is a hundred round trips for what a
   * window function answers in one. Aliases are folded into their canonical
   * author, the same as the one-author query does, and a tie in line count is
   * broken by path so that the answer is the same on every run.
   */
  async getTopFilesForAuthors(
    limit: number,
  ): Promise<Map<number, FileContribution[]>> {
    const rows = await this.db.all<{
      canonicalId: number
      path: string
      totalLines: number | null
      authorLines: number
    }>(sql`
      SELECT canonical_id AS canonicalId,
             path,
             total_lines AS totalLines,
             author_lines AS authorLines
      FROM (
        SELECT a.canonical_id AS canonical_id,
               f.path AS path,
               f.total_lines AS total_lines,
               count(b.id) AS author_lines,
               row_number() OVER (
                 PARTITION BY a.canonical_id
                 ORDER BY count(b.id) DESC, f.path ASC
               ) AS position
        FROM blame_lines b
        JOIN files f ON f.id = b.file_id
        JOIN authors a ON a.id = b.author_id
        GROUP BY a.canonical_id, f.id
      )
      WHERE position <= ${limit}
      ORDER BY canonical_id, position
    `)

    const byAuthor = new Map<number, FileContribution[]>()
    for (const row of rows) {
      const list = byAuthor.get(row.canonicalId) ?? []
      list.push(this.toFileContribution(row))
      byAuthor.set(row.canonicalId, list)
    }
    return byAuthor
  }

  private toFileContribution(row: {
    path: string
    authorLines: number
    totalLines: number | null
  }): FileContribution {
    const totalLines = row.totalLines ?? 0
    return {
      filename: row.path.split('/').pop() || row.path,
      path: row.path,
      authorLines: row.authorLines,
      totalLines,
      percentage:
        totalLines > 0 ? Math.round((row.authorLines / totalLines) * 100) : 0,
    }
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
