import { eq, sql } from 'drizzle-orm'
import type { LineLordDatabase } from '../adapters/sqlite/database'
import { authors } from '../adapters/sqlite/schema'
import type {
  BarbarianRanking,
  BarbarianWarriorMetrics,
} from '../types/analysisTypes'

/**
 * Gorvek's brutal barbarian analysis service.
 *
 * "By the old gods and the new, this service shall reveal
 *  the mightiest warriors who have conquered the digital realm!"
 *
 * A note on what this does and does not measure, because the theming must not
 * hide it. Every metric here counts lines that are still alive in HEAD, and
 * nothing else. It does not count commits, it does not look at when in the day
 * or week anyone worked, and it says nothing about whether the code is any
 * good -- code nobody dares touch scores exactly as well as code that earned
 * its place. The ranking is a joke about conquest, not a measure of anyone's
 * productivity, and it should never be used as one.
 *
 * - Gorvek the Ironbane
 */

/**
 * Where a file counts as big enough to leave a scar on whoever works in it.
 *
 * This is independent of `--threshold`, and the two interact. GitService never
 * records blame lines for a file above the threshold, so this clause can only
 * ever select files between the two numbers: larger than this, smaller than
 * the threshold. With the default 50 KB threshold that is a wide band and most
 * battle scars come from it. Set `--threshold` below this and the clause
 * selects nothing at all, leaving only the extension and path rules -- scars
 * drop sharply, and that is the analysis working as configured, not a fault.
 */
const LEGACY_FILE_SIZE_BYTES = 5000

/** Files that look dangerous enough to leave a mark on whoever works in them. */
const LEGACY_FILE_CONDITION = sql`(
  f.size > ${LEGACY_FILE_SIZE_BYTES}
  OR f.extension IN ('.js', '.php', '.asp', '.jsp')
  OR f.path LIKE '%legacy%'
  OR f.path LIKE '%old%'
  OR f.path LIKE '%deprecated%'
)`

/** A day on which this many of a warrior's surviving lines were last touched. */
const MASSIVE_BATTLE_LINES = 100

interface LineAggregateRow {
  authorId: number
  survivingLines: number
  battleScars: number
  weaponMastery: number
  ancientCodeSurvival: number
}

interface OwnershipRow {
  authorId: number
  territoryConquered: number
  soloQuestVictories: number
}

interface CampaignRow {
  authorId: number
  totalCampaigns: number
  massiveBattles: number
}

const EMPTY_METRICS: BarbarianWarriorMetrics = {
  survivingLines: 0,
  battleScars: 0,
  territoryConquered: 0,
  soloQuestVictories: 0,
  weaponMastery: 0,
  ancientCodeSurvival: 0,
  massiveBattles: 0,
  totalCampaigns: 0,
}

export class BarbarianAnalysisService {
  /**
   * `now` is injected rather than read from the clock inside, so that tests of
   * ancient-code survival are deterministic.
   */
  constructor(
    private db: LineLordDatabase,
    private now: Date = new Date(),
  ) {}

  /**
   * Get complete barbarian rankings for all warriors who hold ground in HEAD.
   */
  async getBarbarianRankings(): Promise<BarbarianRanking[]> {
    const allAuthors = await this.db
      .select({
        id: authors.id,
        name: authors.name,
        email: authors.email,
        displayName: authors.displayName,
        title: authors.title,
      })
      .from(authors)
      .where(eq(authors.isCanonical, true))

    const metricsByAuthor = this.collectMetrics()

    const rankings: BarbarianRanking[] = allAuthors
      .map((author) => {
        const metrics = metricsByAuthor.get(author.id) ?? EMPTY_METRICS
        return {
          authorId: author.id,
          name: author.name,
          email: author.email,
          displayName: author.displayName,
          metrics,
          gorvekScore: this.calculateGorvekScore(metrics),
          title: author.title,
          specialAchievements: [], // assigned to category leaders below
          rank: 0,
        }
      })
      // A warrior with no surviving lines holds no ground, and handing them a
      // title would pad the ranking with people the codebase has forgotten.
      // AuthorRankingService filters the same way.
      .filter((ranking) => ranking.metrics.survivingLines > 0)

    rankings.sort((a, b) => b.gorvekScore - a.gorvekScore)

    rankings.forEach((ranking, index) => {
      ranking.rank = index
    })

    this.assignTopPerformerAchievements(rankings)

    return rankings
  }

  /**
   * Every metric for every warrior, in three set-based queries.
   *
   * The previous shape ran twelve queries per author, two of them with
   * correlated subqueries, which meant a repository with forty contributors
   * issued nearly five hundred queries to render one screen.
   */
  private collectMetrics(): Map<number, BarbarianWarriorMetrics> {
    const oneYearAgo = new Date(this.now)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    // Whole seconds, to compare against the stored author time as a number.
    const ancientCutoff = Math.floor(oneYearAgo.getTime() / 1000)

    const lineAggregates = this.db.all<LineAggregateRow>(sql`
      SELECT
        bl.author_id AS authorId,
        COUNT(*) AS survivingLines,
        SUM(CASE WHEN ${LEGACY_FILE_CONDITION} THEN 1 ELSE 0 END) AS battleScars,
        COUNT(DISTINCT f.extension) AS weaponMastery,
        SUM(
          CASE WHEN bl.commit_timestamp IS NOT NULL
               AND bl.commit_timestamp < ${ancientCutoff}
          THEN 1 ELSE 0 END
        ) AS ancientCodeSurvival
      FROM blame_lines bl
      JOIN files f ON f.id = bl.file_id
      GROUP BY bl.author_id
    `)

    const ownership = this.db.all<OwnershipRow>(sql`
      WITH per_file AS (
        SELECT author_id, file_id, COUNT(*) AS author_lines
        FROM blame_lines
        GROUP BY author_id, file_id
      ),
      file_totals AS (
        SELECT file_id, COUNT(*) AS total_lines
        FROM blame_lines
        GROUP BY file_id
      )
      SELECT
        pf.author_id AS authorId,
        SUM(CASE WHEN pf.author_lines * 2 > ft.total_lines THEN 1 ELSE 0 END)
          AS territoryConquered,
        SUM(CASE WHEN pf.author_lines = ft.total_lines THEN 1 ELSE 0 END)
          AS soloQuestVictories
      FROM per_file pf
      JOIN file_totals ft ON ft.file_id = pf.file_id
      GROUP BY pf.author_id
    `)

    const campaigns = this.db.all<CampaignRow>(sql`
      WITH per_day AS (
        SELECT
          author_id,
          DATE(commit_timestamp, 'unixepoch') AS day,
          COUNT(*) AS day_lines
        FROM blame_lines
        WHERE commit_timestamp IS NOT NULL
        GROUP BY author_id, DATE(commit_timestamp, 'unixepoch')
      )
      SELECT
        author_id AS authorId,
        COUNT(*) AS totalCampaigns,
        SUM(CASE WHEN day_lines > ${MASSIVE_BATTLE_LINES} THEN 1 ELSE 0 END)
          AS massiveBattles
      FROM per_day
      GROUP BY author_id
    `)

    const byAuthor = new Map<number, BarbarianWarriorMetrics>()
    const forAuthor = (authorId: number): BarbarianWarriorMetrics => {
      const existing = byAuthor.get(authorId)
      if (existing) return existing
      const created = { ...EMPTY_METRICS }
      byAuthor.set(authorId, created)
      return created
    }

    for (const row of lineAggregates) {
      const metrics = forAuthor(row.authorId)
      metrics.survivingLines = row.survivingLines
      metrics.battleScars = row.battleScars
      metrics.weaponMastery = row.weaponMastery
      metrics.ancientCodeSurvival = row.ancientCodeSurvival
    }
    for (const row of ownership) {
      const metrics = forAuthor(row.authorId)
      metrics.territoryConquered = row.territoryConquered
      metrics.soloQuestVictories = row.soloQuestVictories
    }
    for (const row of campaigns) {
      const metrics = forAuthor(row.authorId)
      metrics.totalCampaigns = row.totalCampaigns
      metrics.massiveBattles = row.massiveBattles
    }

    return byAuthor
  }

  /**
   * The legendary Gorvek Score.
   *
   * Three categories, each counting a different kind of claim on the codebase:
   * how much ground a warrior holds, how long their work has stood, and how
   * concentrated their bursts of work were. Ownership is weighted hardest,
   * because holding a whole file is a stronger claim than having touched many.
   */
  private calculateGorvekScore(metrics: BarbarianWarriorMetrics): number {
    const conquest =
      metrics.territoryConquered * 8.0 +
      metrics.soloQuestVictories * 12.0 +
      Math.log(Math.max(1, metrics.weaponMastery)) * 6.0

    const endurance =
      metrics.ancientCodeSurvival * 1.5 + metrics.battleScars * 2.0

    const intensity =
      metrics.massiveBattles * 5.0 +
      Math.log(Math.max(1, metrics.totalCampaigns)) * 3.0

    const categories = [conquest, endurance, intensity]
    const weakest = Math.min(...categories)
    const strongest = Math.max(...categories)

    // Reward warriors who are not hopeless in any one category...
    let synergyBonus = 0
    if (weakest > 20) synergyBonus += 15
    if (weakest > 50) synergyBonus += 25
    // ...and specialists who dominate a single one.
    if (strongest > 100) synergyBonus += 10

    const totalScore = conquest + endurance + intensity + synergyBonus

    return Math.round(totalScore * 100) / 100
  }

  /**
   * Award each achievement to the single warrior who leads that category, and
   * only when they actually have something to show for it.
   */
  private assignTopPerformerAchievements(rankings: BarbarianRanking[]): void {
    if (rankings.length === 0) return

    const achievements: Array<{
      metric: keyof BarbarianWarriorMetrics
      title: string
    }> = [
      { metric: 'battleScars', title: '🗡️  Slayer of Legacy Dragons' },
      { metric: 'territoryConquered', title: '🏰 Conqueror of Domains' },
      { metric: 'soloQuestVictories', title: '🛡️  Lone Wolf Warrior' },
      { metric: 'weaponMastery', title: '⚡ Master of Many Weapons' },
      { metric: 'ancientCodeSurvival', title: '🏺 Guardian of Ancient Code' },
      { metric: 'massiveBattles', title: '💥 Breaker of Mountains' },
      { metric: 'totalCampaigns', title: '🔥 Veteran of a Hundred Battles' },
    ]

    for (const { metric, title } of achievements) {
      const leader = rankings.reduce((best, warrior) =>
        warrior.metrics[metric] > best.metrics[metric] ? warrior : best,
      )
      if (leader.metrics[metric] > 0) {
        leader.specialAchievements.push(title)
      }
    }
  }
}
