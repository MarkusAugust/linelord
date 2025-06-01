import { describe, it, expect } from 'bun:test'
import {
  getDistributedTitles,
  getRankByTitle,
  getDistributedTitlesWithAssignment
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
      expectedHighborn + expectedMiddle
    )
    const lowbornTitles = result.slice(expectedHighborn + expectedMiddle)

    expect(highbornTitles).toHaveLength(2)
    expect(middleTitles).toHaveLength(6)
    expect(lowbornTitles).toHaveLength(2)

    // Verify titles are from correct ranges
    highbornTitles.forEach((title) => {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(0)
      expect(rank).toBeLessThanOrEqual(11)
    })

    middleTitles.forEach((title) => {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(12)
      expect(rank).toBeLessThanOrEqual(37)
    })

    lowbornTitles.forEach((title) => {
      const rank = getRankByTitle(title)
      expect(rank).toBeGreaterThanOrEqual(38)
      expect(rank).toBeLessThanOrEqual(49)
    })

    // All titles should be valid (not 'unknown')
    result.forEach((title) => {
      expect(title).not.toBe('unknown')
      expect(getRankByTitle(title)).not.toBe(-1)
    })
  })

  it('should handle edge cases correctly', () => {
    // Test 0 devs
    expect(getDistributedTitles(0)).toEqual([])

    // Test 1 dev - should get highborn
    const oneDevResult = getDistributedTitles(1)
    expect(oneDevResult).toHaveLength(1)
    const oneDevRank = getRankByTitle(oneDevResult[0]!)
    expect(oneDevRank).toBeGreaterThanOrEqual(0)
    expect(oneDevRank).toBeLessThanOrEqual(11)

    // Test 2 devs - should get 1 highborn, 1 lowborn
    const twoDevResult = getDistributedTitles(2)
    expect(twoDevResult).toHaveLength(2)
    expect(getRankByTitle(twoDevResult[0]!)).toBeLessThanOrEqual(11) // highborn
    expect(getRankByTitle(twoDevResult[1]!)).toBeGreaterThanOrEqual(38) // lowborn

    // Test 3 devs - should get 1 from each category
    const threeDevResult = getDistributedTitles(3)
    expect(threeDevResult).toHaveLength(3)
    expect(getRankByTitle(threeDevResult[0]!)).toBeLessThanOrEqual(11) // highborn
    expect(getRankByTitle(threeDevResult[1]!)).toBeGreaterThanOrEqual(12) // middle
    expect(getRankByTitle(threeDevResult[1]!)).toBeLessThanOrEqual(37)
    expect(getRankByTitle(threeDevResult[2]!)).toBeGreaterThanOrEqual(38) // lowborn
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
      'Jack'
    ]

    const result = getDistributedTitlesWithAssignment(devNames)

    expect(result).toHaveLength(10)

    // Each result should have name, title, and rank
    result.forEach((assignment, index) => {
      expect(assignment.name).toBe(devNames[index]!)
      expect(typeof assignment.title).toBe('string')
      expect(assignment.title).not.toBe('unknown')
      expect(typeof assignment.rank).toBe('number')
      expect(assignment.rank).toBeGreaterThanOrEqual(0)
      expect(assignment.rank).toBeLessThanOrEqual(49)
    })

    // Verify hierarchical order (ranks should generally increase)
    const ranks = result.map((r) => r.rank)

    // First 2 should be highborn (ranks 0-11)
    expect(ranks[0]!).toBeLessThanOrEqual(11)
    expect(ranks[1]!).toBeLessThanOrEqual(11)

    // Last 2 should be lowborn (ranks 38-49)
    expect(ranks[8]!).toBeGreaterThanOrEqual(38)
    expect(ranks[9]!).toBeGreaterThanOrEqual(38)
  })

  it('should maintain distribution ratios for different team sizes', () => {
    const testSizes = [5, 15, 20, 50]

    testSizes.forEach((size) => {
      const result = getDistributedTitles(size)
      expect(result).toHaveLength(size)

      // Count titles in each category
      let highbornCount = 0
      let middleCount = 0
      let lowbornCount = 0

      result.forEach((title) => {
        const rank = getRankByTitle(title)
        if (rank <= 11) highbornCount++
        else if (rank <= 37) middleCount++
        else lowbornCount++
      })

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
    })
  })
})
