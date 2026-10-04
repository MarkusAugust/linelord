import { describe, expect, it } from 'bun:test'
import { bar } from '../bars'

describe('bar', () => {
  it('is always exactly as wide as asked', () => {
    for (const fraction of [0, 0.01, 0.33, 0.5, 0.999, 1, 2, -1]) {
      expect([...bar(fraction, 10)]).toHaveLength(10)
    }
  })

  it('fills whole cells and then an eighth at a time', () => {
    expect(bar(1, 4)).toBe('████')
    expect(bar(0.5, 4)).toBe('██  ')
    // 4 cells are 32 eighths; 0.5 + 3/32 is two cells and three eighths.
    expect(bar(0.5 + 3 / 32, 4)).toBe('██▍ ')
    expect(bar(1 / 32, 4)).toBe('▏   ')
  })

  it('shows a share too small to round to an eighth as the thinnest sliver, not as nothing', () => {
    // Somebody holding lines is not somebody holding none.
    expect(bar(0.001, 4)).toBe('▏   ')
  })

  it('is empty for nothing, and never overflows for more than everything', () => {
    expect(bar(0, 4)).toBe('    ')
    expect(bar(-0.2, 4)).toBe('    ')
    expect(bar(1.7, 4)).toBe('████')
  })
})
