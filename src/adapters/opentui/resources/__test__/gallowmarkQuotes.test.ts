import { describe, expect, it } from 'bun:test'
import { pickQuote } from '../../quotes'
import { type GallowmarkPool, gallowmarkQuotes } from '../gallowmarkQuotes'

describe('the quotes from the Gallowmark canon', () => {
  it('fills every pool with non-empty, distinct lines', () => {
    for (const [pool, lines] of Object.entries(gallowmarkQuotes)) {
      expect(lines.length, pool).toBeGreaterThan(0)
      expect(new Set(lines).size, pool).toBe(lines.length)
      for (const line of lines) expect(line.trim(), pool).toBe(line)
    }
  })
})

describe('pickQuote', () => {
  const pools: GallowmarkPool[] = [
    'farewell',
    'initializing',
    'scanning',
    'analyzing',
    'complete',
  ]

  it('answers from the pool it was asked for, and nowhere else', () => {
    for (const pool of pools) {
      expect(gallowmarkQuotes[pool]).toContain(pickQuote(pool))
    }
  })

  it('reaches both ends of the pool', () => {
    const lines = gallowmarkQuotes.farewell
    expect(pickQuote('farewell', () => 0)).toBe(lines[0] ?? '')
    expect(pickQuote('farewell', () => 0.999999)).toBe(lines.at(-1) ?? '')
  })
})
