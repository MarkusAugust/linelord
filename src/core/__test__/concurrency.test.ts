import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  normaliseConcurrency,
} from '../concurrency'

/**
 * How many files may be blamed at once, whatever the caller passes.
 *
 * The CLI validates the flag, but the services take the number directly and
 * a test may too. The batching loop advances by this value, so a NaN never
 * advances it at all: initialization would sit there, looking exactly like a
 * repository that is simply large.
 */

describe('normaliseConcurrency', () => {
  it('keeps a sensible number', () => {
    expect(normaliseConcurrency(4)).toBe(4)
  })

  it('falls back when handed something that is not a number', () => {
    // NaN is the dangerous one: the loop index never advances past it.
    expect(normaliseConcurrency(Number.NaN)).toBe(DEFAULT_CONCURRENCY)
    expect(normaliseConcurrency(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CONCURRENCY,
    )
    expect(normaliseConcurrency(undefined)).toBe(DEFAULT_CONCURRENCY)
  })

  it('refuses to blame nothing at a time', () => {
    expect(normaliseConcurrency(0)).toBe(DEFAULT_CONCURRENCY)
    expect(normaliseConcurrency(-5)).toBe(DEFAULT_CONCURRENCY)
  })

  it('rounds a fraction down to whole processes', () => {
    expect(normaliseConcurrency(3.7)).toBe(3)
  })

  it('holds the same ceiling the flag advertises', () => {
    expect(normaliseConcurrency(1000)).toBe(MAX_CONCURRENCY)
  })
})
