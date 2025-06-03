import { desc, eq, sql } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { authors, blameLines } from '../db/schema'
import { getDistributedTitlesWithAssignment } from '../resources/rankedTitles'

export class AuthorRankingService {
  constructor(private db: LineLordDatabase) {}

  /**
   * Calculate and assign ranks, percentages, and titles to all canonical authors
   * This should be called AFTER author normalization is complete
   */
  async calculateAndAssignRanksAndPercentages(): Promise<void> {
    // First, get the total lines across all canonical authors
    const [totalLinesResult] = await this.db
      .select({ total: sql<number>`count(${blameLines.id})`.mapWith(Number) })
      .from(authors)
      .leftJoin(blameLines, eq(authors.id, blameLines.authorId))
      .where(eq(authors.isCanonical, true))

    const totalProjectLines = totalLinesResult?.total || 0

    if (totalProjectLines === 0) {
      // No lines to analyze, nothing to rank
      return
    }

    // Get author contributions with line counts
    const authorContributions = await this.db
      .select({
        id: authors.id,
        displayName: authors.displayName,
        totalLines: sql<number>`count(${blameLines.id})`.mapWith(Number),
      })
      .from(authors)
      .leftJoin(blameLines, eq(authors.id, blameLines.authorId))
      .where(eq(authors.isCanonical, true))
      .groupBy(authors.id)
      .orderBy(desc(sql`count(${blameLines.id})`))

    // Filter to only authors who have contributed lines
    const contributingAuthors = authorContributions.filter(
      (author) => author.totalLines > 0,
    )

    if (contributingAuthors.length === 0) {
      return
    }

    // Calculate percentages and prepare title assignment
    const authorsWithPercentages = contributingAuthors.map((author) => ({
      ...author,
      percentage: this.calculatePercentage(
        author.totalLines,
        totalProjectLines,
      ),
    }))

    // Get display names for title assignment
    const authorNames = authorsWithPercentages.map(
      (author) => author.displayName,
    )
    const titledAuthors = getDistributedTitlesWithAssignment(authorNames)

    // Update each author with their rank, percentage, and title
    for (let i = 0; i < authorsWithPercentages.length; i++) {
      const author = authorsWithPercentages[i]
      const titleData = titledAuthors[i]

      if (author && titleData) {
        await this.db
          .update(authors)
          .set({
            rank: i + 1, // Rank starts from 1 (best) to lowest
            percentage: author.percentage,
            title: titleData.title,
          })
          .where(eq(authors.id, author.id))
      }
    }

    // Reset rank, percentage, and title for authors with no contributions
    await this.db
      .update(authors)
      .set({
        rank: null,
        percentage: 0,
        title: null,
      })
      .where(
        sql`${authors.isCanonical} = true AND ${authors.id} NOT IN (${sql.join(
          authorsWithPercentages.map((a) => sql`${a.id}`),
          sql`, `,
        )})`,
      )
  }

  /**
   * Calculate percentage with proper rounding
   */
  private calculatePercentage(authorLines: number, totalLines: number): number {
    if (totalLines === 0) return 0
    return Math.round((authorLines / totalLines) * 100 * 100) / 100 // Round to 2 decimal places
  }
}
