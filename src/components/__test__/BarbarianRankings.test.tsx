import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import type { BarbarianRanking } from '../../core/barbarian'
import { BarbarianRankings, fit } from '../BarbarianRankings'
import { stripAnsi } from './fakeAnalysisService'

const gorvek: BarbarianRanking = {
  authorId: 1,
  name: 'Gorvek the Ironbane',
  email: 'gorvek@ashendale.realm',
  displayName: 'Gorvek the Ironbane',
  metrics: {
    survivingLines: 19120,
    battleScars: 14525,
    territoryConquered: 128,
    soloQuestVictories: 120,
    weaponMastery: 7,
    ancientCodeSurvival: 4752,
    massiveBattles: 5,
    totalCampaigns: 9,
  },
  gorvekScore: 36555.58,
  title: 'legend',
  specialAchievements: ['🏰 Conqueror of Domains'],
  rank: 0,
}

const nightshroud: BarbarianRanking = {
  authorId: 2,
  name: 'Sister Nightshroud',
  email: 'nightshroud@alderstone.realm',
  displayName: 'Sister Nightshroud',
  metrics: {
    survivingLines: 300,
    battleScars: 10,
    territoryConquered: 2,
    soloQuestVictories: 1,
    weaponMastery: 3,
    ancientCodeSurvival: 0,
    massiveBattles: 0,
    totalCampaigns: 4,
  },
  gorvekScore: 41.2,
  title: 'peasant',
  specialAchievements: [],
  rank: 1,
}

describe('BarbarianRankings', () => {
  it('lays every warrior out as one row under named columns', () => {
    const { lastFrame } = render(
      <BarbarianRankings rankings={[gorvek, nightshroud]} />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    // A header, so that seven numbers in a row are seven named numbers.
    expect(frame).toMatch(/Warrior\s+Score\s+Lines\s+Scars\s+Terr/)

    const gorvekRow = frame.split('\n').find((line) => line.includes('Gorvek'))
    expect(gorvekRow).toContain('36,556')
    expect(gorvekRow).toContain('19,120')
    // Six characters would fill the six-wide column and run into its
    // neighbour, so the scars are written in thousands.
    expect(gorvekRow).toContain(' 15k')
    expect(gorvekRow).toContain('128')
    expect(gorvekRow).toContain('4,752')

    const nightshroudRow = frame
      .split('\n')
      .find((line) => line.includes('Sister'))
    expect(nightshroudRow).toContain('300')
    expect(nightshroudRow).toContain('41')
  })

  it('shows the title the rest of the app gave, once, beside the name', () => {
    const { lastFrame } = render(
      <BarbarianRankings rankings={[gorvek, nightshroud]} />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('legend')
    expect(frame).toContain('peasant')
    // "legends forged" in the closing quote is not a title.
    expect(frame.match(/\blegend\b/g)?.length).toBe(1)
  })

  it('marks the selected row', () => {
    const { lastFrame } = render(
      <BarbarianRankings rankings={[gorvek, nightshroud]} selected={1} />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    const nightshroudRow = frame
      .split('\n')
      .find((line) => line.includes('Sister'))
    expect(nightshroudRow?.trimStart().startsWith('›')).toBe(true)
    const gorvekRow = frame.split('\n').find((line) => line.includes('Gorvek'))
    expect(gorvekRow?.trimStart().startsWith('›')).toBe(false)
  })

  it('lists the achievements under the table, and only for those who have any', () => {
    const { lastFrame } = render(
      <BarbarianRankings rankings={[gorvek, nightshroud]} />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    const lines = frame.split('\n')
    const at = lines.findIndex((line) => line.includes('Conqueror of Domains'))
    expect(at).toBeGreaterThan(0)
    // Listed under the name of whoever earned it, and under nobody else's.
    expect(lines[at - 1]).toContain('Gorvek')
    expect(frame.slice(frame.indexOf('LEGENDARY'))).not.toContain('Sister')
  })

  it('explains every column in the legend, by its short name', () => {
    const { lastFrame } = render(<BarbarianRankings rankings={[gorvek]} />)
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Scars')
    expect(frame).toContain('large or legacy-looking files')
    expect(frame).toContain('Camp')
    expect(frame).toContain('distinct days')
  })

  it('has something to say when there is nobody to rank', () => {
    const { lastFrame } = render(<BarbarianRankings rankings={[]} />)

    expect(stripAnsi(lastFrame() ?? '')).toContain('NO WARRIORS FOUND')
  })
})

describe('fit', () => {
  it('pads a number that fits, leaving a space to its neighbour', () => {
    expect(fit(128, 6)).toBe('   128')
    expect(fit(14525, 7)).toBe(' 14,525')
  })

  it('writes a number that would fill the column in thousands instead', () => {
    // "14,525" is six characters, which in a six-wide column would run into
    // the number before it and read as one figure.
    expect(fit(14525, 6)).toBe('   15k')
    expect(fit(999_999, 6)).toBe(' 1000k')
  })

  it('goes to millions past that', () => {
    expect(fit(2_450_000, 8)).toBe('    2.5M')
  })
})
