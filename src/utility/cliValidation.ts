import { homedir } from 'node:os'
import { MAX_CONCURRENCY } from '../services/GitService'

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

/** How many files may be blamed at once. */
export type ConcurrencyResult =
  | { ok: true; concurrency: number }
  | { ok: false; message: string }

/**
 * Check --concurrency before it reaches the analysis.
 *
 * Zero or a negative number would make the batching loop spin without ever
 * blaming a file, which looks exactly like a repository that takes forever;
 * a non-number would do the same by way of NaN.
 */
export function validateConcurrency(value: unknown): ConcurrencyResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      ok: false,
      message: `--concurrency must be a whole number of files, but got "${String(
        value,
      )}".`,
    }
  }

  if (!Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      message: `--concurrency must be a whole number greater than zero, but got ${value}.`,
    }
  }

  if (value > MAX_CONCURRENCY) {
    return {
      ok: false,
      message: `--concurrency is capped at ${MAX_CONCURRENCY}, but got ${value}. LineLord runs one git process per file, and past this the machine spends its time spawning them rather than reading blame.`,
    }
  }

  return { ok: true, concurrency: value }
}

/** How far apart the sampled revisions are. */
export type SnapshotIntervalResult =
  | { ok: true; interval: 'week' | 'month' | 'quarter' }
  | { ok: false; message: string }

const INTERVALS = ['week', 'month', 'quarter'] as const

export function validateSnapshotInterval(
  value: unknown,
): SnapshotIntervalResult {
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `--snapshot-interval must be one of ${INTERVALS.join(', ')}.`,
    }
  }
  const interval = INTERVALS.find((one) => one === value.toLowerCase())
  if (!interval) {
    return {
      ok: false,
      message: `--snapshot-interval must be one of ${INTERVALS.join(
        ', ',
      )}, but got "${value}".`,
    }
  }
  return { ok: true, interval }
}

/** How many revisions the history may read. */
export type MaxSnapshotsResult =
  | { ok: true; maxSnapshots: number }
  | { ok: false; message: string }

/**
 * Check --max-snapshots before the walk starts.
 *
 * Each snapshot is a pass over the repository, so this is the one number
 * standing between a run of seconds and a run of hours. Zero would walk
 * nothing while looking like it had worked.
 */
export function validateMaxSnapshots(value: unknown): MaxSnapshotsResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      ok: false,
      message: `--max-snapshots must be a whole number of revisions, but got "${String(
        value,
      )}".`,
    }
  }
  if (!Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      message: `--max-snapshots must be a whole number greater than zero, but got ${value}.`,
    }
  }
  if (value > 500) {
    return {
      ok: false,
      message: `--max-snapshots is capped at 500, but got ${value}. Each one is a pass over the repository, and past this the wait is measured in hours.`,
    }
  }
  return { ok: true, maxSnapshots: value }
}
