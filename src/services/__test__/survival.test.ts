import { describe, expect, it } from 'bun:test'
import { type CohortObservation, computeSurvival } from '../survival'

/**
 * The numbers read out of the cohort matrix.
 *
 * Every expectation here is worked out by hand from the input above it. That
 * is the point of these being pure functions: the answer is knowable without
 * running anything, so a test can state it rather than record whatever came
 * out.
 */

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
/** Every sampled revision, which the reading needs and the rows do not carry. */
const sampled = (...dates: string[]) => dates.map(at)
const GORVEK = 1
const NIGHTSHROUD = 2

/** Shorthand for one cell of the matrix. */
const cell = (
  authorId: number,
  cohort: string,
  snapshot: string,
  lineCount: number,
): CohortObservation => ({
  authorId,
  cohortMonth: at(cohort),
  snapshotAt: at(snapshot),
  lineCount,
})

describe('computeSurvival', () => {
  it('counts what somebody ever had standing, not once per snapshot', () => {
    // Ten lines written in January, seen at three snapshots. Ten lines, not
    // thirty: summing the observations would count the same line again every
    // time it survived.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-31', 10),
      cell(GORVEK, '2025-01-01', '2025-02-28', 10),
      cell(GORVEK, '2025-01-01', '2025-03-31', 4),
    ]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-01-31', '2025-02-28', '2025-03-31'),
    )

    expect(gorvek?.linesEverWritten).toBe(10)
    expect(gorvek?.survivingLines).toBe(4)
    expect(gorvek?.survivalRate).toBeCloseTo(0.4, 10)
  })

  it('adds up the cohorts a person wrote in different months', () => {
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-02-28', 10),
      cell(GORVEK, '2025-02-01', '2025-02-28', 6),
    ]

    const [gorvek] = computeSurvival(rows, sampled('2025-02-28'))

    expect(gorvek?.linesEverWritten).toBe(16)
    expect(gorvek?.survivingLines).toBe(16)
    expect(gorvek?.survivalRate).toBe(1)
  })

  it('measures a cohort against the most it was ever seen to hold', () => {
    // Blame can move back to a cohort when a later change is undone, so an
    // observation can be larger than the one before it. The cohort's size is
    // the largest, not the first.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-31', 8),
      cell(GORVEK, '2025-01-01', '2025-02-28', 10),
      cell(GORVEK, '2025-01-01', '2025-03-31', 5),
    ]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-01-31', '2025-02-28', '2025-03-31'),
    )

    expect(gorvek?.linesEverWritten).toBe(10)
    expect(gorvek?.survivalRate).toBeCloseTo(0.5, 10)
  })

  it("answers the plan's own worked example", () => {
    // A writes 100 lines in month one; B overwrites 90 of them in month
    // three. A should come out at a tenth surviving, and a half-life of
    // roughly two months.
    //
    // Snapshots at the end of January, February, March and April. The cohort
    // is stamped at 1 January, so the observations sit at 30, 58, 89 and 119
    // days. It stands whole at 58 days and is down to a tenth at 89, so the
    // crossing is interpolated between them:
    //   58 + 31 x ((1.0 - 0.5) / (1.0 - 0.1)) = 58 + 31 x 0.5555... = 75.2
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-31', 100),
      cell(GORVEK, '2025-01-01', '2025-02-28', 100),
      cell(GORVEK, '2025-01-01', '2025-03-31', 10),
      cell(GORVEK, '2025-01-01', '2025-04-30', 10),
    ]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30'),
    )

    expect(gorvek?.survivalRate).toBeCloseTo(0.1, 10)
    expect(gorvek?.halfLifeDays).toBeCloseTo(58 + 31 * (0.5 / 0.9), 3)
    // Between one and three months, which is what "about two" has to mean.
    expect(gorvek?.halfLifeDays ?? 0).toBeGreaterThan(30)
    expect(gorvek?.halfLifeDays ?? 0).toBeLessThan(90)
  })

  it('reports no half-life for code that never halved', () => {
    // Not a missing answer. It means the work outlived the window, and the
    // interface says so rather than leaving a blank.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-31', 10),
      cell(GORVEK, '2025-01-01', '2025-06-30', 9),
    ]

    const [gorvek] = computeSurvival(rows, sampled('2025-01-31', '2025-06-30'))

    expect(gorvek?.halfLifeDays).toBe(null)
  })

  it('sees a cohort that was deleted outright, which stores no row at all', () => {
    // Ten lines written in January and every one of them gone by April. The
    // database holds no row saying zero -- there is nothing to count -- so
    // read from the rows alone this looks like work that never halved, which
    // is the exact opposite of what happened.
    const rows = [cell(GORVEK, '2025-01-01', '2025-01-31', 10)]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-01-31', '2025-04-30', '2025-07-31'),
    )

    expect(gorvek?.survivingLines).toBe(0)
    expect(gorvek?.survivalRate).toBe(0)
    // Whole at 30 days, gone at 119: halfway between.
    expect(gorvek?.halfLifeDays).toBeCloseTo(30 + (119 - 30) * 0.5, 3)
  })

  it('does not invent a death before the lines were written', () => {
    // A cohort is stamped at the first instant of its month, so a snapshot
    // earlier in that same month is not evidence of anything. Filling it with
    // a zero would report work as deleted days before it was written.
    const rows = [cell(GORVEK, '2025-03-01', '2025-03-20', 10)]

    const [gorvek] = computeSurvival(rows, sampled('2025-03-05', '2025-03-20'))

    expect(gorvek?.linesEverWritten).toBe(10)
    expect(gorvek?.survivingLines).toBe(10)
    expect(gorvek?.halfLifeDays).toBe(null)
  })

  it('takes the middle cohort, weighted, rather than the average', () => {
    // Three cohorts of ten lines each: two still whole in June, one deleted
    // in full after March. A mean would report a short life for somebody most
    // of whose work is untouched; the weighted median puts the answer in the
    // cohort holding the middle line, which here is one that never halved.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-06-30', 10),
      cell(GORVEK, '2025-02-01', '2025-06-30', 10),
      cell(GORVEK, '2025-03-01', '2025-03-31', 10),
    ]

    const [gorvek] = computeSurvival(rows, sampled('2025-03-31', '2025-06-30'))

    expect(gorvek?.halfLifeDays).toBe(null)
  })

  it('lets one large cohort outweigh two small ones', () => {
    // The same shape with the weights reversed: the deleted cohort is the
    // large one, so the middle line falls inside it.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-06-30', 2),
      cell(GORVEK, '2025-02-01', '2025-06-30', 2),
      cell(GORVEK, '2025-03-01', '2025-03-31', 100),
    ]

    const [gorvek] = computeSurvival(rows, sampled('2025-03-31', '2025-06-30'))

    expect(gorvek?.halfLifeDays).not.toBe(null)
    expect(gorvek?.halfLifeDays ?? 0).toBeGreaterThan(30)
  })

  it('draws a curve that starts whole and falls', () => {
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-31', 10),
      cell(GORVEK, '2025-01-01', '2025-03-31', 5),
      cell(GORVEK, '2025-01-01', '2025-06-30', 1),
    ]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-01-31', '2025-03-31', '2025-06-30'),
    )
    const curve = gorvek?.survivalCurve ?? []

    expect(curve.length).toBeGreaterThan(1)
    expect(curve[0]?.fractionAlive).toBe(1)
    expect(curve.map((point) => point.ageDays)).toEqual(
      [...curve.map((point) => point.ageDays)].sort((a, b) => a - b),
    )
    expect(curve[curve.length - 1]?.fractionAlive).toBeCloseTo(0.1, 10)
  })

  it('weighs a step by how many lines were watched across it', () => {
    // Two cohorts crossing the same step: a hundred lines of which all are
    // gone, and two of which both survive. The step kept two of the hundred
    // and two that entered it, not the half an average of the two cohorts'
    // own fractions would give.
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-01-15', 100),
      cell(GORVEK, '2025-01-01', '2025-02-15', 0),
      cell(NIGHTSHROUD, '2025-01-01', '2025-01-15', 2),
      cell(NIGHTSHROUD, '2025-01-01', '2025-02-15', 2),
    ]

    const [gorvek, nightshroud] = computeSurvival(
      rows,
      sampled('2025-01-15', '2025-02-15'),
    )

    // Each is read on their own, so neither is diluted by the other.
    expect(gorvek?.survivalCurve.at(-1)?.fractionAlive).toBe(0)
    expect(nightshroud?.survivalCurve.at(-1)?.fractionAlive).toBe(1)
  })

  it('never lets the curve rise', () => {
    // A survival curve that goes back up is not one. Each age bracket holds a
    // different set of cohorts -- a cohort only reaches the ages the history
    // was long enough to watch -- so reading each bracket on its own gave a
    // curve that climbed. Measured on this repository: 1.00, 0.61, 0.99.
    const rows = [
      // An old cohort watched a long way, losing ground steadily.
      cell(GORVEK, '2025-01-01', '2025-02-15', 100),
      cell(GORVEK, '2025-01-01', '2025-04-15', 50),
      cell(GORVEK, '2025-01-01', '2025-07-15', 20),
      // A young one, untouched, that only reaches the first bracket.
      cell(GORVEK, '2025-06-01', '2025-07-15', 40),
    ]

    const [gorvek] = computeSurvival(
      rows,
      sampled('2025-02-15', '2025-04-15', '2025-07-15'),
    )
    const curve = gorvek?.survivalCurve ?? []

    expect(curve.length).toBeGreaterThan(2)
    for (const [index, point] of curve.entries()) {
      if (index === 0) continue
      expect(point.fractionAlive).toBeLessThanOrEqual(
        curve[index - 1]?.fractionAlive ?? 1,
      )
    }
  })

  it('keeps people apart', () => {
    const rows = [
      cell(GORVEK, '2025-01-01', '2025-02-28', 10),
      cell(NIGHTSHROUD, '2025-01-01', '2025-02-28', 4),
    ]

    const result = computeSurvival(rows, sampled('2025-02-28'))

    expect(result).toHaveLength(2)
    expect(result[0]?.authorId).toBe(GORVEK)
    expect(result[0]?.linesEverWritten).toBe(10)
    expect(result[1]?.linesEverWritten).toBe(4)
  })

  it('refuses to read rows without the snapshots behind them', () => {
    // An empty list type-checks. Reading the rows alone is exactly the
    // failure the argument exists to prevent, so it is a mistake at the call
    // site rather than something to answer quietly and wrongly.
    const rows = [cell(GORVEK, '2025-01-01', '2025-01-31', 10)]

    expect(() => computeSurvival(rows, [])).toThrow()
  })

  it('has nothing to say about an empty history', () => {
    expect(computeSurvival([], sampled('2025-01-31'))).toEqual([])
  })
})
