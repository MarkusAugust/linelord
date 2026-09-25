/**
 * How many files are blamed at once.
 *
 * One git process per file, so this is bounded by how fast the machine can
 * spawn and reap them rather than by anything in LineLord. Twelve was the
 * hard-coded ceiling before it could be asked for.
 */
export const DEFAULT_CONCURRENCY = 12

/**
 * The ceiling, shared with the flag that advertises it.
 *
 * Past this the time goes into spawning and reaping git processes rather than
 * into reading blame.
 */
export const MAX_CONCURRENCY = 64

/**
 * Make a usable batch size out of whatever a caller passed.
 *
 * The CLI validates the flag and says why when it refuses, but the analysis
 * takes the number directly and is not entitled to assume it came from there.
 * A NaN is the one that matters: the batching loop advances by this value, so
 * a NaN never advances it and the analysis sits forever, looking exactly like
 * a repository that is simply large.
 */
export function normaliseConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CONCURRENCY
  }
  const whole = Math.floor(value)
  if (whole < 1) return DEFAULT_CONCURRENCY
  return Math.min(whole, MAX_CONCURRENCY)
}
