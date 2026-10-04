import { describe, expect, it } from 'bun:test'
import {
  EPIC_TITLES,
  getDistributedTitles,
  getDistributedTitlesWithAssignment,
  getRankByTitle,
  rankedTitles,
} from '../rankedTitles'

/**
 * Titles are a joke, and the joke works only if few are crowned and somebody
 * is always at the bottom: the top three to five take the epic titles, and
 * everyone else is spread from the humbler middle down to the very last
 * title, so the last place is always a peasant.
 */
describe('getDistributedTitles', () => {
  it('crowns only the top few, and always puts somebody at the bottom', () => {
    expect(getDistributedTitles(5)).toEqual([
      'legend',
      'line breaker',
      'conqueror',
      'barbarian',
      'peasant',
    ])
    expect(getDistributedTitles(10)).toEqual([
      'legend',
      'line breaker',
      'conqueror',
      'destroyer',
      'warlord',
      'barbarian',
      'blacksmith',
      'peddler',
      'woodcutter',
      'peasant',
    ])
  })

  it('gives one warrior the crown, and two a crown and a peasant', () => {
    expect(getDistributedTitles(0)).toEqual([])
    expect(getDistributedTitles(1)).toEqual(['legend'])
    expect(getDistributedTitles(2)).toEqual(['legend', 'peasant'])
    expect(getDistributedTitles(3)).toEqual([
      'legend',
      'line breaker',
      'peasant',
    ])
    expect(getDistributedTitles(4)).toEqual([
      'legend',
      'line breaker',
      'conqueror',
      'peasant',
    ])
  })

  it('never crowns more than five, however many warriors there are', () => {
    for (const size of [6, 10, 16, 40, 120]) {
      const titles = getDistributedTitles(size)
      const epic = titles.filter((title) => EPIC_TITLES.includes(title))
      expect(epic.length, String(size)).toBeGreaterThanOrEqual(3)
      expect(epic.length, String(size)).toBeLessThanOrEqual(5)
    }
  })

  it('ends with a peasant for every size above one, and never rises on the way down', () => {
    for (let size = 2; size <= 120; size++) {
      const titles = getDistributedTitles(size)
      expect(titles).toHaveLength(size)
      expect(titles.at(-1), String(size)).toBe('peasant')
      const ranks = titles.map(getRankByTitle)
      for (let at = 1; at < ranks.length; at++) {
        expect(ranks[at], `${size} at ${at}`).toBeGreaterThanOrEqual(
          ranks[at - 1] ?? 0,
        )
      }
    }
  })

  it('gives nobody below the crowned a title from the epic part of the list', () => {
    for (const size of [6, 16, 40]) {
      const rest = getDistributedTitles(size).slice(5)
      for (const title of rest)
        expect(getRankByTitle(title)).toBeGreaterThanOrEqual(
          getRankByTitle('barbarian'),
        )
    }
  })
})

describe('getDistributedTitlesWithAssignment', () => {
  it('pairs each name with its title and that title’s place in the list', () => {
    const assigned = getDistributedTitlesWithAssignment([
      'Gorvek of Bonereach',
      'Sarn the Faceless',
      'Captain Drusk',
    ])
    expect(assigned).toEqual([
      { name: 'Gorvek of Bonereach', title: 'legend', rank: 0 },
      { name: 'Sarn the Faceless', title: 'line breaker', rank: 1 },
      {
        name: 'Captain Drusk',
        title: 'peasant',
        rank: rankedTitles.length - 1,
      },
    ])
  })
})
