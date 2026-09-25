import { describe, expect, it } from 'bun:test'
import { homedir } from 'node:os'
import {
  expandTilde,
  validateConcurrency,
  validateMaxSnapshots,
  validateSnapshotInterval,
  validateThresholdKB,
} from '../cliValidation'

describe('expandTilde', () => {
  it('expands a bare tilde to the home directory', () => {
    expect(expandTilde('~')).toBe(homedir())
  })

  it('expands a tilde that begins a path', () => {
    expect(expandTilde('~/Code/linelord')).toBe(`${homedir()}/Code/linelord`)
  })

  it('leaves a tilde anywhere else alone', () => {
    // Only a leading `~` is a home directory. A tilde inside a filename, or
    // the `~user` form that this does not support, must survive untouched.
    expect(expandTilde('/tmp/back~up')).toBe('/tmp/back~up')
    expect(expandTilde('~notauser/code')).toBe('~notauser/code')
  })

  it('leaves an ordinary path untouched', () => {
    expect(expandTilde('/Users/someone/code')).toBe('/Users/someone/code')
    expect(expandTilde('.')).toBe('.')
  })
})

describe('validateThresholdKB', () => {
  it('accepts a positive number of kilobytes', () => {
    expect(validateThresholdKB(50)).toEqual({ ok: true, thresholdKB: 50 })
    expect(validateThresholdKB(0.5)).toEqual({ ok: true, thresholdKB: 0.5 })
    expect(validateThresholdKB(200)).toEqual({ ok: true, thresholdKB: 200 })
  })

  it('rejects zero, which would treat every file as oversized', () => {
    const result = validateThresholdKB(0)

    expect(result.ok).toBe(false)
    // The message has to say what would have happened, or "invalid" leaves the
    // user guessing why an empty analysis was what they got before.
    expect(result.ok === false && result.message).toContain('analyse nothing')
  })

  it('rejects a negative threshold', () => {
    expect(validateThresholdKB(-5).ok).toBe(false)
  })

  it('rejects NaN, which used to switch the threshold off entirely', () => {
    // Every comparison against NaN is false, so an unparseable value did not
    // narrow the analysis -- it silently removed the limit.
    const result = validateThresholdKB(Number.NaN)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('must be a number')
  })

  it('rejects infinity and non-numbers', () => {
    expect(validateThresholdKB(Number.POSITIVE_INFINITY).ok).toBe(false)
    expect(validateThresholdKB('200').ok).toBe(false)
    expect(validateThresholdKB(undefined).ok).toBe(false)
    expect(validateThresholdKB(null).ok).toBe(false)
  })
})

describe('validateConcurrency', () => {
  it('accepts a sensible number of files at once', () => {
    expect(validateConcurrency(8)).toEqual({ ok: true, concurrency: 8 })
  })

  it('refuses zero, which would blame nothing while looking busy', () => {
    expect(validateConcurrency(0).ok).toBe(false)
  })

  it('refuses a negative number', () => {
    expect(validateConcurrency(-4).ok).toBe(false)
  })

  it('refuses a fraction, which is not a number of processes', () => {
    expect(validateConcurrency(2.5).ok).toBe(false)
  })

  it('refuses something that is not a number at all', () => {
    expect(validateConcurrency('lots').ok).toBe(false)
  })

  it('caps it, because past a point the machine only spawns processes', () => {
    expect(validateConcurrency(500).ok).toBe(false)
  })
})

describe('validateSnapshotInterval', () => {
  it('accepts the three the sampling knows', () => {
    for (const interval of ['week', 'month', 'quarter'] as const) {
      expect(validateSnapshotInterval(interval)).toEqual({ ok: true, interval })
    }
  })

  it('does not mind how it was capitalised', () => {
    expect(validateSnapshotInterval('Month')).toEqual({
      ok: true,
      interval: 'month',
    })
  })

  it('refuses one it does not know rather than quietly using a default', () => {
    expect(validateSnapshotInterval('fortnight').ok).toBe(false)
    expect(validateSnapshotInterval(7).ok).toBe(false)
  })
})

describe('validateMaxSnapshots', () => {
  it('accepts a sensible number of revisions', () => {
    expect(validateMaxSnapshots(24)).toEqual({ ok: true, maxSnapshots: 24 })
  })

  it('refuses zero, which would walk nothing while looking busy', () => {
    expect(validateMaxSnapshots(0).ok).toBe(false)
  })

  it('refuses a fraction and a negative', () => {
    expect(validateMaxSnapshots(2.5).ok).toBe(false)
    expect(validateMaxSnapshots(-1).ok).toBe(false)
  })

  it('refuses something that is not a number', () => {
    expect(validateMaxSnapshots('all of them').ok).toBe(false)
  })

  it('caps it, because each one is a pass over the repository', () => {
    expect(validateMaxSnapshots(5000).ok).toBe(false)
  })
})
