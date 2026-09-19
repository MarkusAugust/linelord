import { describe, expect, it } from 'bun:test'
import {
  getDistributedTitles,
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

describe('rankedTitles - teams larger than the title table', () => {
  // There are fifty titles. A repository with more contributors than that is
  // ordinary, and used to be handed the literal string "unknown" as a rank:
  // 30 of 100 contributors, 110 of 200. Both this and AuthorRankingService
  // displayed it verbatim.
  const SIZES = [1, 2, 3, 4, 10, 49, 50, 51, 60, 100, 200, 1000]

  it('gives every contributor a real title, however many there are', () => {
    const table = new Set(rankedTitles)

    for (const size of SIZES) {
      const titles = getDistributedTitles(size)
      expect(titles).toHaveLength(size)
      expect(titles.filter((title) => !table.has(title))).toEqual([])
    }
  })

  it('never lets a better placement earn a worse title', () => {
    // Titles may repeat once the table runs out, but the sequence must never
    // move back up the ranking.
    for (const size of SIZES) {
      const ranks = getDistributedTitles(size).map(getRankByTitle)
      const sorted = [...ranks].sort((a, b) => a - b)
      expect(ranks).toEqual(sorted)
    }
  })

  it('still gives the top contributor the best title in the table', () => {
    for (const size of SIZES) {
      expect(getDistributedTitles(size)[0]).toBe(rankedTitles[0] ?? '')
    }
  })

  it('leaves the distribution unchanged for teams that fit', () => {
    // The compression only engages once a tier is oversubscribed, so a team
    // the table can seat must be distributed exactly as it was before.
    expect(getDistributedTitles(10)).toEqual([
      ...rankedTitles.slice(0, 2),
      ...rankedTitles.slice(12, 18),
      ...rankedTitles.slice(38, 40),
    ])
  })
})
