/**
 * What the cohort snapshots add up to.
 *
 * The walk records how many lines each person wrote in each month were still
 * alive at each sampled revision. That is a matrix, and these are the numbers
 * read out of it: how much somebody ever wrote, how much of it is left, and
 * how long a month's work tends to last before it is rewritten.
 *
 * Pure functions over rows, deliberately. Every one of these is arithmetic
 * with an exactly known answer, so it is worth being able to state the input
 * and the expected output and compare them, rather than inferring either from
 * a repository.
 */

/** One cell of the matrix: a cohort, a snapshot, and what was alive. */
export interface CohortObservation {
  authorId: number
  /** Start of the month the lines were written, in whole seconds. */
  cohortMonth: number
  /** The snapshot this was counted at, in whole seconds. */
  snapshotAt: number
  lineCount: number
}

/** One point on a survival curve. */
export interface SurvivalPoint {
  /** How long after the cohort was written, in days. */
  ageDays: number
  /** How much of it was still alive then, from 1 down to 0. */
  fractionAlive: number
}

export interface AuthorSurvival {
  authorId: number
  /**
   * Every line this person ever had standing, counted once.
   *
   * The sum over their cohorts of the most that cohort was ever observed to
   * hold. Not the sum of every observation, which would count the same line
   * again at every snapshot it survived.
   */
  linesEverWritten: number
  /** What is left of it at the newest snapshot. */
  survivingLines: number
  /** The one over the other, from 1 down to 0. */
  survivalRate: number
  /**
   * How long until half of a month's work is gone, in days.
   *
   * Null when the curve never falls to half within the history that was
   * sampled -- which is a real answer and not a missing one: it means their
   * code has outlived the window, and the interface says so as "> N days"
   * rather than leaving a blank.
   */
  halfLifeDays: number | null
  /** The curve the half-life is read off, oldest cohorts included. */
  survivalCurve: SurvivalPoint[]
}

const DAY_SECONDS = 24 * 60 * 60

/**
 * The width of one step on the curve, in days.
 *
 * Thirty, because cohorts are months and a curve with a point per snapshot
 * would be drawn through observations that no two cohorts share: cohort ages
 * are all different, so aggregating needs a grid to aggregate onto.
 */
const CURVE_STEP_DAYS = 30

/**
 * Read the survival figures for every author in the matrix.
 *
 * `snapshotTimes` is every sampled revision. It is required, not defaulted,
 * because leaving it out does not produce a smaller answer but a wrong one.
 * A cohort with nothing left of it writes no row at all -- there is no row
 * saying zero -- so the rows alone show only the snapshots where something
 * still stood. Read that way, work that was deleted in its entirety looks
 * like work that never fell below half, which is the exact opposite of what
 * happened. The missing observations are filled in as zeroes here.
 */
export function computeSurvival(
  observations: CohortObservation[],
  snapshotTimes: number[],
): AuthorSurvival[] {
  if (observations.length === 0) return []

  // Required is not the same as supplied. An empty list type-checks, and
  // reading these rows without the snapshots they were counted at is the one
  // failure this argument exists to prevent -- cohorts deleted outright look
  // like cohorts that never halved. Observations only exist because snapshots
  // do, so having the first without the second is a mistake at the call site
  // rather than a state the data can be in.
  if (snapshotTimes.length === 0) {
    throw new Error(
      'computeSurvival needs the snapshots the observations were counted at; ' +
        'without them a cohort with nothing left of it cannot be told from ' +
        'one that was never touched.',
    )
  }

  const everySnapshot = [
    ...new Set([
      ...snapshotTimes,
      ...observations.map((one) => one.snapshotAt),
    ]),
  ].sort((a, b) => a - b)
  const newestSnapshot = everySnapshot[everySnapshot.length - 1] ?? 0

  const byAuthor = new Map<number, CohortObservation[]>()
  for (const observation of observations) {
    const existing = byAuthor.get(observation.authorId)
    if (existing) existing.push(observation)
    else byAuthor.set(observation.authorId, [observation])
  }

  const result: AuthorSurvival[] = []
  for (const [authorId, rows] of byAuthor) {
    result.push(
      survivalForAuthor(
        authorId,
        withEmptyObservations(authorId, rows, everySnapshot),
        newestSnapshot,
      ),
    )
  }
  return result.sort((a, b) => b.linesEverWritten - a.linesEverWritten)
}

/**
 * Add the zeroes the database does not store.
 *
 * A cohort is known to have existed from the first snapshot that saw it; at
 * every later snapshot with no row, nothing of it was left. Earlier snapshots
 * are left alone rather than filled with zeroes: a cohort is stamped at the
 * first instant of its month, so a snapshot earlier in that same month would
 * otherwise record a death before the lines were written.
 */
function withEmptyObservations(
  authorId: number,
  rows: CohortObservation[],
  everySnapshot: number[],
): CohortObservation[] {
  const seenByCohort = new Map<number, Set<number>>()
  const firstSeen = new Map<number, number>()
  for (const row of rows) {
    const seen = seenByCohort.get(row.cohortMonth) ?? new Set<number>()
    seen.add(row.snapshotAt)
    seenByCohort.set(row.cohortMonth, seen)

    const earliest = firstSeen.get(row.cohortMonth)
    if (earliest === undefined || row.snapshotAt < earliest) {
      firstSeen.set(row.cohortMonth, row.snapshotAt)
    }
  }

  const filled = [...rows]
  for (const [cohortMonth, seen] of seenByCohort) {
    const earliest = firstSeen.get(cohortMonth) ?? 0
    for (const snapshotAt of everySnapshot) {
      if (snapshotAt <= earliest || seen.has(snapshotAt)) continue
      filled.push({
        authorId,
        cohortMonth,
        snapshotAt,
        lineCount: 0,
      })
    }
  }
  return filled
}

function survivalForAuthor(
  authorId: number,
  rows: CohortObservation[],
  newestSnapshot: number,
): AuthorSurvival {
  // The most a cohort was ever seen to hold. Normally its first observation,
  // since lines are only ever lost; taking the maximum rather than the first
  // means a cohort that gains a line -- blame moving back to it when a later
  // change is undone -- is still measured against its true size.
  const peaks = new Map<number, number>()
  for (const row of rows) {
    const standing = peaks.get(row.cohortMonth) ?? 0
    if (row.lineCount > standing) peaks.set(row.cohortMonth, row.lineCount)
  }

  let linesEverWritten = 0
  for (const peak of peaks.values()) linesEverWritten += peak

  let survivingLines = 0
  for (const row of rows) {
    if (row.snapshotAt === newestSnapshot) survivingLines += row.lineCount
  }

  return {
    authorId,
    linesEverWritten,
    survivingLines,
    survivalRate:
      linesEverWritten === 0 ? 0 : survivingLines / linesEverWritten,
    halfLifeDays: halfLifeAcrossCohorts(rows, peaks),
    survivalCurve: buildCurve(rows, peaks),
  }
}

/**
 * Every cohort's decay, laid over one another as one falling curve.
 *
 * Not the obvious thing, which is to take the lines alive at each age over
 * the lines those cohorts started with. That is a different set of cohorts at
 * every age -- a cohort only reaches the ages the history is long enough to
 * have watched it reach -- so the result is not a comparison of like with
 * like, and it does not fall. Measured on this repository it came out as
 * 1.00, 0.61, 0.99, 0.61, 0.89: code apparently coming back to life.
 *
 * So what is measured per step is how much survived *that step*, among the
 * cohorts that were watched across it, and the curve is those multiplied
 * together. Cohorts entering and leaving the window then change how well one
 * step is measured rather than moving the curve up and down, and the result
 * cannot rise, which a survival curve must not.
 */
function buildCurve(
  rows: CohortObservation[],
  peaks: Map<number, number>,
): SurvivalPoint[] {
  const byCohort = new Map<number, CohortObservation[]>()
  for (const row of rows) {
    if ((peaks.get(row.cohortMonth) ?? 0) === 0) continue
    const existing = byCohort.get(row.cohortMonth)
    if (existing) existing.push(row)
    else byCohort.set(row.cohortMonth, [row])
  }

  // Lines entering each step, and lines still there at the end of it.
  const enteringStep = new Map<number, number>()
  const leavingStep = new Map<number, number>()
  let lastStep = 0

  for (const observations of byCohort.values()) {
    const ordered = [...observations].sort(
      (a, b) => a.snapshotAt - b.snapshotAt,
    )
    let previous: CohortObservation | null = null
    for (const observation of ordered) {
      const step = stepOf(observation)
      if (previous) {
        const previousStep = stepOf(previous)
        // A cohort watched across several steps at once has its whole change
        // put on the step it arrives at. Spreading it would be guessing at
        // when within that gap the lines went.
        if (step > previousStep) {
          enteringStep.set(
            step,
            (enteringStep.get(step) ?? 0) + previous.lineCount,
          )
          leavingStep.set(
            step,
            (leavingStep.get(step) ?? 0) + observation.lineCount,
          )
          if (step > lastStep) lastStep = step
        }
      }
      previous = observation
    }
  }

  const curve: SurvivalPoint[] = [{ ageDays: 0, fractionAlive: 1 }]
  let alive = 1
  for (let step = 1; step <= lastStep; step++) {
    const entering = enteringStep.get(step)
    if (entering !== undefined && entering > 0) {
      // Clamped: blame moving back to a cohort can leave more lines than
      // entered the step, and a survival curve that rises is not one.
      const ratio = Math.min(1, (leavingStep.get(step) ?? 0) / entering)
      alive *= ratio
    }
    curve.push({ ageDays: step * CURVE_STEP_DAYS, fractionAlive: alive })
  }
  return curve
}

/** Which step of the grid an observation falls in. */
function stepOf(observation: CohortObservation): number {
  const ageDays =
    (observation.snapshotAt - observation.cohortMonth) / DAY_SECONDS
  return Math.max(0, Math.floor(ageDays / CURVE_STEP_DAYS))
}

/**
 * When one cohort fell to half, from its own observations at their own ages.
 *
 * Not read off the drawn curve: that curve is aggregated onto a grid so it
 * can be drawn, and the grid moves the crossing. On the plan's own worked
 * example a thirty-day grid puts it at 47 days where the observations
 * bracket it between 58 and 89.
 *
 * The cohort is whole at the moment it is written, so the series is anchored
 * at (0, 1) -- otherwise a history that first sees a cohort already half gone
 * would report no half-life at all, which is the opposite of what it found.
 */
function halfLifeOfCohort(
  observations: CohortObservation[],
  peak: number,
): number | null {
  if (peak <= 0) return null

  const points = observations
    .map((row) => ({
      ageDays: Math.max(0, (row.snapshotAt - row.cohortMonth) / DAY_SECONDS),
      fractionAlive: row.lineCount / peak,
    }))
    .sort((a, b) => a.ageDays - b.ageDays)

  let previous: SurvivalPoint = { ageDays: 0, fractionAlive: 1 }
  for (const point of points) {
    if (point.fractionAlive > 0.5) {
      previous = point
      continue
    }

    const spanDays = point.ageDays - previous.ageDays
    const fell = previous.fractionAlive - point.fractionAlive
    if (spanDays <= 0 || fell <= 0) return point.ageDays

    // Linear between the two observations. These are samples, so anything
    // more elaborate would be inventing a shape nobody measured.
    return previous.ageDays + spanDays * ((previous.fractionAlive - 0.5) / fell)
  }

  // Never fell to half within the history that was sampled.
  return null
}

/**
 * One half-life for a person, from all their cohorts.
 *
 * The weighted median rather than the mean, for the reason medians are used
 * everywhere else here: one month of work that happened to be deleted
 * wholesale would drag a mean across the chart. Weighted by how large each
 * cohort was, so a month of three lines does not pull as hard as one of three
 * hundred.
 *
 * Cohorts still standing sort last and keep their weight rather than being
 * dropped. Discarding them would leave only the short-lived months in the
 * reckoning, and report a half-life of weeks for somebody most of whose work
 * is untouched. When they carry more than half the weight the answer is null,
 * which is the honest one: within this history, it has not halved.
 */
function halfLifeAcrossCohorts(
  rows: CohortObservation[],
  peaks: Map<number, number>,
): number | null {
  const byCohort = new Map<number, CohortObservation[]>()
  for (const row of rows) {
    const existing = byCohort.get(row.cohortMonth)
    if (existing) existing.push(row)
    else byCohort.set(row.cohortMonth, [row])
  }

  const weighed: Array<{ halfLife: number | null; weight: number }> = []
  let totalWeight = 0
  for (const [cohortMonth, observations] of byCohort) {
    const peak = peaks.get(cohortMonth) ?? 0
    if (peak <= 0) continue
    weighed.push({
      halfLife: halfLifeOfCohort(observations, peak),
      weight: peak,
    })
    totalWeight += peak
  }

  if (totalWeight === 0) return null

  weighed.sort((a, b) => {
    if (a.halfLife === null) return b.halfLife === null ? 0 : 1
    if (b.halfLife === null) return -1
    return a.halfLife - b.halfLife
  })

  let seen = 0
  for (const one of weighed) {
    seen += one.weight
    if (seen * 2 >= totalWeight) return one.halfLife
  }
  return null
}
