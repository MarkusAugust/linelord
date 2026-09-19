import { describe, expect, it } from 'bun:test'
import {
  getRankByTitle,
  getTitleByRank,
  getTitleRange,
  rankedTitles,
} from '../rankedTitles'

describe('rankedTitles - lookup helpers', () => {
  it('returns the title at a rank, counting from the top', () => {
    expect(getTitleByRank(0)).toBe(rankedTitles[0] ?? '')
    expect(getTitleByRank(rankedTitles.length - 1)).toBe(
      rankedTitles.at(-1) ?? '',
    )
  })

  it('returns "unknown" rather than undefined for a rank off either end', () => {
    expect(getTitleByRank(-1)).toBe('unknown')
    expect(getTitleByRank(rankedTitles.length)).toBe('unknown')
    expect(getTitleByRank(9999)).toBe('unknown')
  })

  it('round-trips a title back to its rank, case-insensitively', () => {
    const title = rankedTitles[12]
    expect(title).toBeDefined()
    expect(getRankByTitle(title ?? '')).toBe(12)
    expect(getRankByTitle((title ?? '').toUpperCase())).toBe(12)
  })

  it('returns -1 for a title that is not in the list', () => {
    expect(getRankByTitle('supreme galactic overlord')).toBe(-1)
  })

  it('returns an inclusive range of titles', () => {
    const range = getTitleRange(0, 2)
    expect(range).toEqual(rankedTitles.slice(0, 3))
    expect(getTitleRange(5, 5)).toEqual([rankedTitles[5] ?? ''])
  })

  it('holds fifty distinct lower-case titles, which the tiers index directly', () => {
    // getDistributedTitles slices 0-11, 12-37 and 38-49 by hand, and
    // getRankByTitle lower-cases before looking up. Both assume this shape.
    expect(rankedTitles).toHaveLength(50)
    expect(new Set(rankedTitles).size).toBe(50)
    expect(rankedTitles.every((title) => title === title.toLowerCase())).toBe(
      true,
    )
  })
})
