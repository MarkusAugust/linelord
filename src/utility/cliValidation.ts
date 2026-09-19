import { homedir } from 'node:os'

/** Expand a leading `~` to the user's home directory. */
export function expandTilde(filepath: string): string {
  if (filepath === '~') return homedir()
  if (filepath.startsWith('~/')) return `${homedir()}${filepath.slice(1)}`
  return filepath
}

export type ThresholdResult =
  | { ok: true; thresholdKB: number }
  | { ok: false; message: string }

/**
 * Check a `--threshold` value before it reaches the analysis.
 *
 * Every invalid value used to be accepted and then quietly changed what was
 * analysed, in three different directions:
 *
 * - `0` became a zero-byte threshold, so every file counted as oversized and
 *   the analysis came back empty with nothing to explain why.
 * - A negative value did the same.
 * - A non-numeric value became NaN, and since every comparison against NaN is
 *   false, the threshold silently stopped applying at all -- the opposite
 *   failure, and the one most likely to go unnoticed.
 */
export function validateThresholdKB(value: unknown): ThresholdResult {
  if (value === undefined || value === null) {
    return { ok: false, message: 'No threshold was given.' }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      ok: false,
      message: `--threshold must be a number of kilobytes, but got "${String(
        value,
      )}".`,
    }
  }

  if (value <= 0) {
    return {
      ok: false,
      message: `--threshold must be greater than zero, but got ${value}. A threshold of ${value} would treat every file as oversized and analyse nothing.`,
    }
  }

  return { ok: true, thresholdKB: value }
}
