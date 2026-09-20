import { eq, sql } from 'drizzle-orm'
import type { LineLordDatabase } from '../db/database'
import { HISTORY_HEAD_KEY, readMeta } from '../db/meta'
import { authors, cohortLines, snapshots } from '../db/schema'
import {
  type AuthorSurvival,
  computeSurvival,
  type SurvivalPoint,
} from './survival'

/**
 * How old the code is that somebody still owns.
 *
 * This measures the age of surviving lines: for every line still standing in
 * the analysed revision, how long ago was the commit that last touched it.
 * That is not the same as how long the line has lived, and it is emphatically
 * not a measure of anyone's work -- see the note in the README. It is cheap,
 * because the blame data already holds it, and it answers a real question:
 * how much of this codebase is old, and whose.
 *
 * `now` is a parameter rather than a call to `Date.now()`, so that a test can
 * state an age instead of computing one.
 */

const DAY_SECONDS = 24 * 60 * 60

/** Lines grouped by how old they are, for the sparkline in the dashboard. */
export interface AgeHistogram {
  underAWeek: number
  weekToMonth: number
  oneToThreeMonths: number
  threeToTwelveMonths: number
  oneToTwoYears: number
  overTwoYears: number
}

/** A line still present in the analysed revision, and where to find it. */
export interface SurvivingLine {
  /** Author time of the commit that last touched it, in whole seconds. */
  timestamp: number
  /**
   * How old it is, in days.
   *
   * Carried rather than left for the caller to work out, so that nothing on
   * screen computes an age against a different `now` than the rest of the
   * figures it sits beside.
   */
  ageDays: number
  path: string
  lineNumber: number
}

export interface AuthorLongevity {
  authorId: number
  name: string
  email: string
  /** Lines this author owns in the analysed revision. */
  survivingLines: number
  /**
   * The middle age, in days.
   *
   * The primary key everything is sorted by, because a mean is dominated by
   * whichever single ancient file somebody happens to still own.
   */
  medianAgeDays: number
  meanAgeDays: number
  /** Where the spread sits: a tenth of the lines are younger, a tenth older. */
  p10AgeDays: number
  p90AgeDays: number
  oldestLine: SurvivingLine | null
  newestLine: SurvivingLine | null
  ageHistogram: AgeHistogram
  /** Days between the oldest and newest line still standing. */
  activeSpanDays: number
}

/** One file, from one author's point of view. */
export interface AuthorFileLongevity {
  path: string
  /** Lines in this file owned by that author. */
  lines: number
  medianAgeDays: number
}

export interface RepositoryLongevity {
  survivingLines: number
  /** Null rather than zero when there is nothing to take a middle of. */
  medianAgeDays: number | null
  ageHistogram: AgeHistogram
  /** Fraction of surviving lines last touched within ninety days, 0 to 1. */
  writtenInLast90Days: number
  oldestLine: SurvivingLine | null
}

interface AggregateRow {
  authorId: number
  name: string
  email: string
  survivingLines: number
  meanTimestamp: number
  oldestTimestamp: number
  newestTimestamp: number
}

interface PercentileRow {
  authorId: number
  medianTimestamp: number
  p10Timestamp: number
  p90Timestamp: number
}

interface HistogramRow extends AgeHistogram {
  authorId: number
}

interface ExtremeRow {
  authorId: number
  timestamp: number
  path: string
  lineNumber: number
  isOldest: number
  isNewest: number
}

const EMPTY_HISTOGRAM: AgeHistogram = {
  underAWeek: 0,
  weekToMonth: 0,
  oneToThreeMonths: 0,
  threeToTwelveMonths: 0,
  oneToTwoYears: 0,
  overTwoYears: 0,
}

/** What the cohort walk found, with the person attached. */
export type { SurvivalPoint }

export interface AuthorSurvivalWithIdentity extends AuthorSurvival {
  name: string
  email: string
}

export class LongevityService {
  constructor(
    private db: LineLordDatabase,
    private now: Date = new Date(),
  ) {}

  private get nowSeconds(): number {
    return Math.floor(this.now.getTime() / 1000)
  }

  private ageInDays(timestamp: number): number {
    return (this.nowSeconds - timestamp) / DAY_SECONDS
  }

  /**
   * Every author who still owns a line, oldest median first.
   *
   * Four set-based queries rather than a handful per author: a repository with
   * forty contributors would otherwise issue a query storm to draw one screen,
   * which is the mistake BarbarianAnalysisService was already corrected for.
   */
  async forAuthors(): Promise<AuthorLongevity[]> {
    const aggregates = this.db.all<AggregateRow>(sql`
      SELECT
        bl.author_id AS authorId,
        a.display_name AS name,
        a.email AS email,
        COUNT(*) AS survivingLines,
        AVG(bl.commit_timestamp) AS meanTimestamp,
        MIN(bl.commit_timestamp) AS oldestTimestamp,
        MAX(bl.commit_timestamp) AS newestTimestamp
      FROM blame_lines bl
      JOIN authors a ON a.id = bl.author_id
      WHERE bl.commit_timestamp IS NOT NULL
      GROUP BY bl.author_id
    `)

    if (aggregates.length === 0) return []

    const percentiles = new Map(
      this.percentilesByAuthor().map((row) => [row.authorId, row]),
    )
    const histograms = new Map(
      this.histogramsByAuthor().map((row) => [row.authorId, row]),
    )
    const extremes = this.extremeLinesByAuthor()

    const result = aggregates.map((row): AuthorLongevity => {
      const percentile = percentiles.get(row.authorId)
      const histogram = histograms.get(row.authorId)
      const ends = extremes.get(row.authorId)

      return {
        authorId: row.authorId,
        name: row.name,
        email: row.email,
        survivingLines: row.survivingLines,
        // The percentiles are already ranked by age, so each maps straight
        // across. The fallbacks are the two ends, which is what a single
        // surviving line makes every percentile anyway.
        medianAgeDays: this.ageInDays(
          percentile?.medianTimestamp ?? row.oldestTimestamp,
        ),
        meanAgeDays: this.ageInDays(row.meanTimestamp),
        p10AgeDays: this.ageInDays(
          percentile?.p10Timestamp ?? row.newestTimestamp,
        ),
        p90AgeDays: this.ageInDays(
          percentile?.p90Timestamp ?? row.oldestTimestamp,
        ),
        oldestLine: ends?.oldest ?? null,
        newestLine: ends?.newest ?? null,
        ageHistogram: histogram
          ? stripAuthorId(histogram)
          : { ...EMPTY_HISTOGRAM },
        activeSpanDays:
          (row.newestTimestamp - row.oldestTimestamp) / DAY_SECONDS,
      }
    })

    // Oldest median first: the question the dashboard asks is whose code has
    // been standing longest.
    return result.sort((a, b) => b.medianAgeDays - a.medianAgeDays)
  }

  /**
   * The files where one author's surviving code is oldest.
   *
   * The detail view's answer to "where is this old code, then" -- a median
   * age on its own says a person's code is old without saying where to look.
   * Ranked by the same nearest-rank median as everything else.
   */
  async filesForAuthor(
    authorId: number,
    limit = 5,
  ): Promise<AuthorFileLongevity[]> {
    return this.db.all<AuthorFileLongevity>(sql`
      WITH ranked AS (
        SELECT
          bl.file_id AS fileId,
          bl.commit_timestamp AS ts,
          ROW_NUMBER() OVER (
            PARTITION BY bl.file_id ORDER BY bl.commit_timestamp DESC, bl.id DESC
          ) AS rn,
          COUNT(*) OVER (PARTITION BY bl.file_id) AS total
        FROM blame_lines bl
        WHERE bl.author_id = ${authorId} AND bl.commit_timestamp IS NOT NULL
      )
      SELECT
        f.path AS path,
        MAX(r.total) AS lines,
        (${this.nowSeconds} - MAX(CASE WHEN r.rn >= (r.total + 1) / 2 THEN r.ts END))
          / 86400.0 AS medianAgeDays
      FROM ranked r
      JOIN files f ON f.id = r.fileId
      GROUP BY r.fileId
      ORDER BY medianAgeDays DESC
      LIMIT ${limit}
    `)
  }

  /**
   * Which revision the stored history describes, or null if there is none.
   *
   * The caller compares this against the revision being analysed. Cohort rows
   * outlive the analysis that produced them, so a history from before HEAD
   * moved is still there and still readable -- and a curve drawn from it
   * would be about a repository that has changed since.
   */
  historyDescribes(): string | null {
    return readMeta(this.db, HISTORY_HEAD_KEY)
  }

  /**
   * How long each person's work lasted, from the cohort walk.
   *
   * Empty when no history has been gathered, which is the ordinary case:
   * tier 2 only runs when it is asked for.
   */
  async survivalByAuthor(): Promise<AuthorSurvivalWithIdentity[]> {
    const sampled = await this.db
      .select({ at: snapshots.snapshotTimestamp })
      .from(snapshots)
    if (sampled.length === 0) return []

    const rows = await this.db
      .select({
        authorId: cohortLines.authorId,
        cohortMonth: cohortLines.cohortMonth,
        snapshotAt: snapshots.snapshotTimestamp,
        lineCount: cohortLines.lineCount,
      })
      .from(cohortLines)
      .innerJoin(snapshots, eq(snapshots.id, cohortLines.snapshotId))

    const identities = new Map(
      (
        await this.db
          .select({
            id: authors.id,
            name: authors.displayName,
            email: authors.email,
          })
          .from(authors)
      ).map((one) => [one.id, one]),
    )

    return computeSurvival(
      rows,
      sampled.map((one) => one.at),
    ).map((one) => ({
      ...one,
      name: identities.get(one.authorId)?.name ?? '',
      email: identities.get(one.authorId)?.email ?? '',
    }))
  }

  /** The same question asked of the codebase as a whole. */
  async forRepository(): Promise<RepositoryLongevity> {
    const [totals] = this.db.all<{
      survivingLines: number
      recentLines: number
    }>(sql`
      SELECT
        COUNT(*) AS survivingLines,
        SUM(
          CASE WHEN commit_timestamp >= ${this.nowSeconds - 90 * DAY_SECONDS}
          THEN 1 ELSE 0 END
        ) AS recentLines
      FROM blame_lines
      WHERE commit_timestamp IS NOT NULL
    `)

    const survivingLines = totals?.survivingLines ?? 0
    if (survivingLines === 0) {
      return {
        survivingLines: 0,
        medianAgeDays: null,
        ageHistogram: { ...EMPTY_HISTOGRAM },
        writtenInLast90Days: 0,
        oldestLine: null,
      }
    }

    // Ordered by age ascending -- newest first -- and offset to the same
    // nearest rank the per-author percentiles use. Ordering the other way
    // picks the other of the two middles when the count is even, which had
    // this reporting a different median from the per-author figures for the
    // very same lines.
    const [median] = this.db.all<{ medianTimestamp: number }>(sql`
      SELECT commit_timestamp AS medianTimestamp
      FROM blame_lines
      WHERE commit_timestamp IS NOT NULL
      ORDER BY commit_timestamp DESC, id DESC
      LIMIT 1 OFFSET ${Math.ceil(survivingLines / 2) - 1}
    `)

    const [histogram] = this.db.all<AgeHistogram>(sql`
      SELECT ${this.histogramColumns()}
      FROM blame_lines
      WHERE commit_timestamp IS NOT NULL
    `)

    const [oldest] = this.db.all<{
      timestamp: number
      path: string
      lineNumber: number
    }>(sql`
      SELECT
        bl.commit_timestamp AS timestamp,
        f.path AS path,
        bl.line_number AS lineNumber
      FROM blame_lines bl
      JOIN files f ON f.id = bl.file_id
      WHERE bl.commit_timestamp IS NOT NULL
      ORDER BY bl.commit_timestamp ASC, bl.id ASC
      LIMIT 1
    `)

    return {
      survivingLines,
      medianAgeDays: median ? this.ageInDays(median.medianTimestamp) : null,
      ageHistogram: histogram ?? { ...EMPTY_HISTOGRAM },
      writtenInLast90Days: (totals?.recentLines ?? 0) / survivingLines,
      oldestLine: oldest
        ? { ...oldest, ageDays: this.ageInDays(oldest.timestamp) }
        : null,
    }
  }

  /**
   * Median and the tenth and ninetieth percentiles of *age*, in one query.
   *
   * Ranked by timestamp descending, because that is age ascending: the newest
   * line is the youngest. Ordering the other way and mapping the percentiles
   * across -- the tenth of age being the ninetieth of timestamp -- is the same
   * answer only when the arithmetic is exact, and with nearest ranks it is
   * off by one row.
   *
   * Nearest-rank rather than interpolated: the value at rank ceil(p/100 x n),
   * so with an even number of lines the median is the younger of the two
   * middles rather than an age no line actually has. Ranks come from a window function, so every author is answered
   * by one pass rather than by a query each.
   */
  private percentilesByAuthor(): PercentileRow[] {
    return this.db.all<PercentileRow>(sql`
      WITH ranked AS (
        SELECT
          author_id,
          commit_timestamp AS ts,
          ROW_NUMBER() OVER (
            PARTITION BY author_id ORDER BY commit_timestamp DESC, id DESC
          ) AS rn,
          COUNT(*) OVER (PARTITION BY author_id) AS total
        FROM blame_lines
        WHERE commit_timestamp IS NOT NULL
      )
      SELECT
        author_id AS authorId,
        MAX(CASE WHEN rn >= (total + 1) / 2 THEN ts END) AS medianTimestamp,
        MAX(CASE WHEN rn >= (total * 10 + 99) / 100 THEN ts END)
          AS p10Timestamp,
        MAX(CASE WHEN rn >= (total * 90 + 99) / 100 THEN ts END)
          AS p90Timestamp
      FROM ranked
      GROUP BY author_id
    `)
  }

  private histogramsByAuthor(): HistogramRow[] {
    return this.db.all<HistogramRow>(sql`
      SELECT author_id AS authorId, ${this.histogramColumns()}
      FROM blame_lines
      WHERE commit_timestamp IS NOT NULL
      GROUP BY author_id
    `)
  }

  /**
   * The bucket edges, as seconds before now.
   *
   * Written once and used for both the per-author and the repository-wide
   * histogram, so the two cannot drift into describing different buckets.
   */
  private histogramColumns() {
    const cutoff = (days: number) => this.nowSeconds - days * DAY_SECONDS
    // A bucket holds ages from `younger` up to but not including `older`, so
    // a line exactly seven days old belongs to "a week to a month" and not to
    // "under a week". In timestamps that reverses: older than an edge means a
    // timestamp at or before its cutoff.
    const bucket = (younger: number | null, older: number | null) => {
      if (younger === null) return sql`commit_timestamp > ${cutoff(older ?? 0)}`
      if (older === null) return sql`commit_timestamp <= ${cutoff(younger)}`
      return sql`commit_timestamp <= ${cutoff(younger)} AND commit_timestamp > ${cutoff(older)}`
    }
    const count = (condition: ReturnType<typeof bucket>) =>
      sql`SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`

    return sql`
      ${count(bucket(null, 7))} AS underAWeek,
      ${count(bucket(7, 30))} AS weekToMonth,
      ${count(bucket(30, 90))} AS oneToThreeMonths,
      ${count(bucket(90, 365))} AS threeToTwelveMonths,
      ${count(bucket(365, 730))} AS oneToTwoYears,
      ${count(bucket(730, null))} AS overTwoYears
    `
  }

  /** The oldest and newest surviving line for each author, with its path. */
  private extremeLinesByAuthor(): Map<
    number,
    { oldest: SurvivingLine; newest: SurvivingLine }
  > {
    const rows = this.db.all<ExtremeRow>(sql`
      WITH ends AS (
        SELECT
          bl.author_id AS authorId,
          bl.commit_timestamp AS timestamp,
          f.path AS path,
          bl.line_number AS lineNumber,
          ROW_NUMBER() OVER (
            PARTITION BY bl.author_id
            ORDER BY bl.commit_timestamp ASC, bl.id ASC
          ) AS oldestRank,
          ROW_NUMBER() OVER (
            PARTITION BY bl.author_id
            ORDER BY bl.commit_timestamp DESC, bl.id DESC
          ) AS newestRank
        FROM blame_lines bl
        JOIN files f ON f.id = bl.file_id
        WHERE bl.commit_timestamp IS NOT NULL
      )
      SELECT
        authorId, timestamp, path, lineNumber,
        CASE WHEN oldestRank = 1 THEN 1 ELSE 0 END AS isOldest,
        CASE WHEN newestRank = 1 THEN 1 ELSE 0 END AS isNewest
      FROM ends
      WHERE oldestRank = 1 OR newestRank = 1
    `)

    const byAuthor = new Map<
      number,
      { oldest: SurvivingLine; newest: SurvivingLine }
    >()
    for (const row of rows) {
      const line: SurvivingLine = {
        timestamp: row.timestamp,
        ageDays: this.ageInDays(row.timestamp),
        path: row.path,
        lineNumber: row.lineNumber,
      }
      const existing = byAuthor.get(row.authorId) ?? {
        oldest: line,
        newest: line,
      }
      // A single surviving line is both ends at once, which is why these are
      // flags on one row rather than two separate queries.
      if (row.isOldest === 1) existing.oldest = line
      if (row.isNewest === 1) existing.newest = line
      byAuthor.set(row.authorId, existing)
    }
    return byAuthor
  }
}

function stripAuthorId(row: HistogramRow): AgeHistogram {
  const { authorId: _authorId, ...histogram } = row
  return histogram
}
