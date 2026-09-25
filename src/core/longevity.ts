import type {
  AnalysisData,
  AuthorRecord,
  BlameLineRecord,
  HistoryData,
} from './model'
import {
  type AuthorSurvival,
  computeSurvival,
  type SurvivalPoint,
} from './survival'

/**
 * How old the code still standing is, and whose.
 *
 * For every surviving line with a date on it: how long ago was the commit
 * that last touched it -- per author, per file, and for the repository as a
 * whole. Arithmetic over the loaded analysis, with `now` handed in so that
 * every figure on a screen is measured against the same instant.
 *
 * Medians and percentiles are nearest-rank rather than interpolated: the
 * value at rank ceil(p/100 × n) counting from the newest line, so with an
 * even number of lines the median is the younger of the two middles rather
 * than an age no line actually has. Ties on time are broken by the line's
 * id, so two runs over the same repository name the same oldest line.
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
   * How old it is, in days. Carried rather than left for the caller to work
   * out, so that nothing on screen computes an age against a different `now`
   * than the rest of the figures it sits beside.
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
   * The middle age, in days. The primary key everything is sorted by,
   * because a mean is dominated by whichever single ancient file somebody
   * happens to still own.
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

export type { SurvivalPoint }

/** What the cohort walk found, with the person attached. */
export interface AuthorSurvivalWithIdentity extends AuthorSurvival {
  name: string
  email: string
}

/** The history as stored, and which revision it claims to describe. */
export interface HistoryReading {
  history: HistoryData
  /**
   * The revision the walk ended at, or null if no history was gathered.
   * Compared against the revision being analysed: a history about some
   * other revision is a curve about a repository that has changed since.
   */
  describes: string | null
}

const EMPTY_HISTOGRAM: AgeHistogram = {
  underAWeek: 0,
  weekToMonth: 0,
  oneToThreeMonths: 0,
  threeToTwelveMonths: 0,
  oneToTwoYears: 0,
  overTwoYears: 0,
}

type DatedLine = BlameLineRecord & { commitTimestamp: number }

const isDated = (line: BlameLineRecord): line is DatedLine =>
  line.commitTimestamp !== null

const nowSeconds = (now: Date): number => Math.floor(now.getTime() / 1000)

const ageInDays = (now: number, timestamp: number): number =>
  (now - timestamp) / DAY_SECONDS

/**
 * Newest first, ties by id descending: the one order every rank is taken in.
 *
 * Ranked by timestamp descending because that is age ascending -- the
 * newest line is the youngest. Ordering the other way and mapping the
 * percentiles across is the same answer only when the arithmetic is exact,
 * and with nearest ranks it is off by one row.
 */
function newestFirst(lines: BlameLineRecord[]): DatedLine[] {
  return lines
    .filter(isDated)
    .sort((a, b) => b.commitTimestamp - a.commitTimestamp || b.id - a.id)
}

/** The line at a one-based rank counting from the newest, clamped into the list. */
function atRank(ordered: DatedLine[], rank: number): DatedLine | undefined {
  return ordered[Math.min(Math.max(rank, 1), ordered.length) - 1]
}

/** Nearest rank of the median: the lower middle of an even count. */
const medianRank = (count: number): number => Math.floor((count + 1) / 2)
/** Nearest rank of a percentile: ceil(p × n / 100), in integer arithmetic. */
const percentileRank = (count: number, percent: number): number =>
  Math.floor((count * percent + 99) / 100)

/**
 * Count lines into the buckets by timestamp, with the edges where the
 * labels say they are: a bucket holds ages from `younger` up to but not
 * including `older`, so a line exactly seven days old belongs to "a week to
 * a month" and not to "under a week". In timestamps that reverses: older
 * than an edge means a timestamp at or before its cutoff.
 */
function histogramOf(lines: DatedLine[], now: number): AgeHistogram {
  const cutoff = (days: number) => now - days * DAY_SECONDS
  const week = cutoff(7)
  const month = cutoff(30)
  const quarter = cutoff(90)
  const year = cutoff(365)
  const twoYears = cutoff(730)

  const histogram = { ...EMPTY_HISTOGRAM }
  for (const { commitTimestamp: at } of lines) {
    if (at > week) histogram.underAWeek += 1
    else if (at > month) histogram.weekToMonth += 1
    else if (at > quarter) histogram.oneToThreeMonths += 1
    else if (at > year) histogram.threeToTwelveMonths += 1
    else if (at > twoYears) histogram.oneToTwoYears += 1
    else histogram.overTwoYears += 1
  }
  return histogram
}

function toSurvivingLine(
  line: DatedLine,
  pathOf: Map<number, string>,
  now: number,
): SurvivingLine {
  return {
    timestamp: line.commitTimestamp,
    ageDays: ageInDays(now, line.commitTimestamp),
    path: pathOf.get(line.fileId) ?? '',
    lineNumber: line.lineNumber,
  }
}

const pathsById = (data: AnalysisData): Map<number, string> =>
  new Map(data.files.map((file) => [file.id, file.path]))

/**
 * Every author who still owns a dated line, oldest median first.
 *
 * Lines are counted against the author they are stored under. A canonical
 * author with nothing left in the analysed revision is not a row with
 * zeroes; they are simply not in the answer.
 */
export function ageOfAuthors(data: AnalysisData, now: Date): AuthorLongevity[] {
  const at = nowSeconds(now)
  const paths = pathsById(data)
  const authors = new Map(data.authors.map((author) => [author.id, author]))

  const byAuthor = new Map<number, DatedLine[]>()
  for (const line of data.lines) {
    if (!isDated(line)) continue
    const held = byAuthor.get(line.authorId)
    if (held) held.push(line)
    else byAuthor.set(line.authorId, [line])
  }

  const result: AuthorLongevity[] = []
  for (const authorId of [...byAuthor.keys()].sort((a, b) => a - b)) {
    const author = authors.get(authorId)
    const held = byAuthor.get(authorId)
    if (!author || !held) continue

    const ordered = newestFirst(held)
    const count = ordered.length
    const newest = ordered[0]
    const oldest = ordered[count - 1]
    if (!newest || !oldest) continue

    let sum = 0
    for (const line of ordered) sum += line.commitTimestamp

    result.push({
      authorId,
      name: author.displayName,
      email: author.email,
      survivingLines: count,
      medianAgeDays: ageInDays(
        at,
        atRank(ordered, medianRank(count))?.commitTimestamp ??
          oldest.commitTimestamp,
      ),
      meanAgeDays: ageInDays(at, sum / count),
      p10AgeDays: ageInDays(
        at,
        atRank(ordered, percentileRank(count, 10))?.commitTimestamp ??
          newest.commitTimestamp,
      ),
      p90AgeDays: ageInDays(
        at,
        atRank(ordered, percentileRank(count, 90))?.commitTimestamp ??
          oldest.commitTimestamp,
      ),
      oldestLine: toSurvivingLine(oldest, paths, at),
      newestLine: toSurvivingLine(newest, paths, at),
      ageHistogram: histogramOf(ordered, at),
      activeSpanDays:
        (newest.commitTimestamp - oldest.commitTimestamp) / DAY_SECONDS,
    })
  }

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
export function filesByAge(
  data: AnalysisData,
  authorId: number,
  now: Date,
  limit = 5,
): AuthorFileLongevity[] {
  const at = nowSeconds(now)
  const paths = pathsById(data)

  const byFile = new Map<number, DatedLine[]>()
  for (const line of data.lines) {
    if (line.authorId !== authorId || !isDated(line)) continue
    const held = byFile.get(line.fileId)
    if (held) held.push(line)
    else byFile.set(line.fileId, [line])
  }

  const result: AuthorFileLongevity[] = []
  for (const [fileId, held] of byFile) {
    const ordered = newestFirst(held)
    const middle = atRank(ordered, medianRank(ordered.length))
    if (!middle) continue
    result.push({
      path: paths.get(fileId) ?? '',
      lines: ordered.length,
      medianAgeDays: ageInDays(at, middle.commitTimestamp),
    })
  }

  return result
    .sort(
      (a, b) =>
        b.medianAgeDays - a.medianAgeDays || a.path.localeCompare(b.path),
    )
    .slice(0, limit)
}

/** The same question asked of the codebase as a whole. */
export function ageOfRepository(
  data: AnalysisData,
  now: Date,
): RepositoryLongevity {
  const at = nowSeconds(now)
  const ordered = newestFirst(data.lines)
  const count = ordered.length

  if (count === 0) {
    return {
      survivingLines: 0,
      medianAgeDays: null,
      ageHistogram: { ...EMPTY_HISTOGRAM },
      writtenInLast90Days: 0,
      oldestLine: null,
    }
  }

  const ninetyDaysAgo = at - 90 * DAY_SECONDS
  let recent = 0
  for (const line of ordered) {
    if (line.commitTimestamp >= ninetyDaysAgo) recent += 1
  }

  // Offset to the same nearest rank the per-author percentiles use, so a
  // repository with one contributor reports the same median as that
  // contributor for the very same lines.
  const middle = atRank(ordered, Math.ceil(count / 2))
  const oldest = ordered[count - 1]

  return {
    survivingLines: count,
    medianAgeDays: middle ? ageInDays(at, middle.commitTimestamp) : null,
    ageHistogram: histogramOf(ordered, at),
    writtenInLast90Days: recent / count,
    oldestLine: oldest ? toSurvivingLine(oldest, pathsById(data), at) : null,
  }
}

/**
 * How long each person's work lasted, from the cohort walk.
 *
 * Empty when no history has been gathered, which is the ordinary case: the
 * walk only runs when it is asked for.
 */
export function survivalByAuthor(
  history: HistoryData,
  authors: AuthorRecord[],
): AuthorSurvivalWithIdentity[] {
  if (history.snapshots.length === 0) return []

  const snapshotAt = new Map(
    history.snapshots.map((one) => [one.id, one.snapshotTimestamp]),
  )
  const identities = new Map(authors.map((one) => [one.id, one]))

  const observations = history.cohortLines.flatMap((row) => {
    const at = snapshotAt.get(row.snapshotId)
    return at === undefined
      ? []
      : [
          {
            authorId: row.authorId,
            cohortMonth: row.cohortMonth,
            snapshotAt: at,
            lineCount: row.lineCount,
          },
        ]
  })

  return computeSurvival(
    observations,
    history.snapshots.map((one) => one.snapshotTimestamp),
  ).map((one) => ({
    ...one,
    name: identities.get(one.authorId)?.displayName ?? '',
    email: identities.get(one.authorId)?.email ?? '',
  }))
}
