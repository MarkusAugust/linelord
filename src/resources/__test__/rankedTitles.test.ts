import { describe, expect, it } from 'bun:test'
import {
  getDistributedTitles,
  getDistributedTitlesWithAssignment,
  getRankByTitle,
} from '../rankedTitles'

describe('rankedTitles - Distribution Logic', () => {
  it('should distribute titles correctly for 10 developers', () => {
    const result = getDistributedTitles(10)

    // Should return exactly 10 titles
    expect(result).toHaveLength(10)

    // Calculate expected distribution for 10 devs
    const expectedHighborn = Math.max(1, Math.floor(10 * 0.2)) // 2 highborn
    const expectedLowborn = Math.max(1, Math.floor(10 * 0.2)) // 2 lowborn
    const expectedMiddle = 10 - expectedHighborn - expectedLowborn // 6 middle

    expect(expectedHighborn).toBe(2)
    expect(expectedLowborn).toBe(2)
    expect(expectedMiddle).toBe(6)

    // Verify we get the right counts from each tier
    const highbornTitles = result.slice(0, expectedHighborn)
    const middleTitles = result.slice(
      expectedHighborn,
      expectedHighborn + expectedMiddle,
    )
    const lowbornTitles = result.slice(expectedHighborn + expectedMiddle)

    expect(highbornTitles).toHaveLength(2)
    expect(middleTitles).toHaveLength(6)
    expect(lowbornTitles).toHaveLength(2)

    // Verify titles are from correct ranges
    for (const title of highbornTitles) {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(0)
      expect(rank).toBeLessThanOrEqual(11)
    }

    for (const title of middleTitles) {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(12)
      expect(rank).toBeLessThanOrEqual(37)
    }

    for (const title of lowbornTitles) {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(38)
      expect(rank).toBeLessThanOrEqual(49)
    }

    // All titles should be valid (not 'unknown')
    for (const title of result) {
      expect(title).not.toBe('unknown')
      expect(getRankByTitle(title)).not.toBe(-1)
    }
  })

  it('should handle edge cases correctly', () => {
    // Test 0 devs
    expect(getDistributedTitles(0)).toEqual([])

    // Test 1 dev - should get highborn
    const oneDevResult = getDistributedTitles(1)
    expect(oneDevResult).toHaveLength(1)
    const oneDevTitle = oneDevResult[0]
    expect(oneDevTitle).toBeDefined()
    if (oneDevTitle) {
      const oneDevRank = getRankByTitle(oneDevTitle)
      expect(oneDevRank).toBeGreaterThanOrEqual(0)
      expect(oneDevRank).toBeLessThanOrEqual(11)
    }

    // Test 2 devs - should get 1 highborn, 1 lowborn
    const twoDevResult = getDistributedTitles(2)
    expect(twoDevResult).toHaveLength(2)
    const firstTitle = twoDevResult[0]
    const secondTitle = twoDevResult[1]

    expect(firstTitle).toBeDefined()
    if (firstTitle) {
      expect(getRankByTitle(firstTitle)).toBeLessThanOrEqual(11) // highborn
    }

    expect(secondTitle).toBeDefined()
    if (secondTitle) {
      expect(getRankByTitle(secondTitle)).toBeGreaterThanOrEqual(38) // lowborn
    }

    // Test 3 devs - should get 1 from each category
    const threeDevResult = getDistributedTitles(3)
    expect(threeDevResult).toHaveLength(3)

    const firstThreeTitle = threeDevResult[0]
    const secondThreeTitle = threeDevResult[1]
    const thirdThreeTitle = threeDevResult[2]

    expect(firstThreeTitle).toBeDefined()
    if (firstThreeTitle) {
      expect(getRankByTitle(firstThreeTitle)).toBeLessThanOrEqual(11) // highborn
    }

    expect(secondThreeTitle).toBeDefined()
    if (secondThreeTitle) {
      const middleRank = getRankByTitle(secondThreeTitle)
      expect(middleRank).toBeGreaterThanOrEqual(12) // middle
      expect(middleRank).toBeLessThanOrEqual(37)
    }

    expect(thirdThreeTitle).toBeDefined()
    if (thirdThreeTitle) {
      expect(getRankByTitle(thirdThreeTitle)).toBeGreaterThanOrEqual(38) // lowborn
    }
  })

  it('should work with getDistributedTitlesWithAssignment for 10 devs', () => {
    const devNames = [
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
      'Eve',
      'Frank',
      'Grace',
      'Henry',
      'Ivy',
      'Jack',
    ]

    const result = getDistributedTitlesWithAssignment(devNames)

    expect(result).toHaveLength(10)

    // Each result should have name, title, and rank
    result.forEach((assignment, index) => {
      // biome-ignore lint/style/noNonNullAssertion: This is just a test
      const expectedName = devNames[index]!
      expect(assignment.name).toBe(expectedName)
      expect(typeof assignment.title).toBe('string')
      expect(assignment.title).not.toBe('unknown')
      expect(typeof assignment.rank).toBe('number')
      expect(assignment.rank).toBeGreaterThanOrEqual(0)
      expect(assignment.rank).toBeLessThanOrEqual(49)
    })

    // Verify hierarchical order (ranks should generally increase)
    const ranks = result.map((r) => r.rank)

    // First 2 should be highborn (ranks 0-11)
    const firstRank = ranks[0]
    const secondRank = ranks[1]
    if (firstRank !== undefined) {
      expect(firstRank).toBeLessThanOrEqual(11)
    }
    if (secondRank !== undefined) {
      expect(secondRank).toBeLessThanOrEqual(11)
    }

    // Last 2 should be lowborn (ranks 38-49)
    const eighthRank = ranks[8]
    const ninthRank = ranks[9]
    if (eighthRank !== undefined) {
      expect(eighthRank).toBeGreaterThanOrEqual(38)
    }
    if (ninthRank !== undefined) {
      expect(ninthRank).toBeGreaterThanOrEqual(38)
    }
  })

  it('should maintain distribution ratios for different team sizes', () => {
    const testSizes = [5, 15, 20, 50]

    for (const size of testSizes) {
      const result = getDistributedTitles(size)
      expect(result).toHaveLength(size)

      // Count titles in each category
      let highbornCount = 0
      let middleCount = 0
      let lowbornCount = 0

      for (const title of result) {
        const rank = getRankByTitle(title)
        if (rank <= 11) highbornCount++
        else if (rank <= 37) middleCount++
        else lowbornCount++
      }

      // Verify we have at least 1 from highborn and lowborn categories
      expect(highbornCount).toBeGreaterThanOrEqual(1)
      expect(lowbornCount).toBeGreaterThanOrEqual(1)

      // Verify total adds up
      expect(highbornCount + middleCount + lowbornCount).toBe(size)

      // For larger teams, middle should be the majority
      if (size >= 10) {
        expect(middleCount).toBeGreaterThan(highbornCount)
        expect(middleCount).toBeGreaterThan(lowbornCount)
      }
    }
  })
})
