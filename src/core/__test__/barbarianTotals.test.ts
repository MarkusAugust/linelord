import { describe, expect, it } from 'bun:test'
import {
  type BarbarianWarriorMetrics,
  barbarianRankings,
  placeAmong,
  REALM_MEASURES,
  realmTotals,
} from '../barbarian'
import { EMPTY_ANALYSIS } from '../model'
import { analysis, author, file, lines } from './fixtures'

const NOW = new Date('2025-09-01T00:00:00Z')
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
const ANCIENT = seconds('2020-01-15T10:00:00.000Z')
const ANCIENT_OTHER_DAY = seconds('2020-03-02T10:00:00.000Z')
const RECENT = seconds('2025-06-01T10:00:00.000Z')

const GORVEK = 1
const SARN = 2
const DRUSK = 3

/**
 *   src/a.ts         3 ancient Gorvek lines
 *   src/legacy/b.ts  2 ancient Gorvek lines + 1 recent Sarn line   (legacy path)
 *   src/big.ts       1 recent Gorvek line                          (over 5000 bytes)
 *   src/c.js         2 recent Sarn lines                           (legacy extension)
 *   src/d.ts         1 Sarn line and 1 Drusk line, split evenly -- nobody holds it
 *   README.md        1 Drusk line on another ancient day
 */
const realm = analysis({
  authors: [
    author(GORVEK, {
      name: 'Gorvek of Bonereach',
      email: 'gorvek@bonereach.realm',
    }),
    author(SARN, { name: 'Sarn the Faceless', email: 'sarn@kell.realm' }),
    author(DRUSK, { name: 'Captain Drusk', email: 'drusk@greycloaks.realm' }),
  ],
  files: [
    file(1, 'src/a.ts'),
    file(2, 'src/legacy/b.ts'),
    file(3, 'src/big.ts', { size: 6000 }),
    file(4, 'src/c.js', { extension: '.js' }),
    file(5, 'src/d.ts'),
    file(6, 'README.md', { extension: '.md' }),
  ],
  lines: lines(
    { fileId: 1, authorId: GORVEK, timestamps: [ANCIENT, ANCIENT, ANCIENT] },
    { fileId: 2, authorId: GORVEK, timestamps: [ANCIENT, ANCIENT] },
    { fileId: 3, authorId: GORVEK, timestamps: [RECENT] },
    { fileId: 2, authorId: SARN, timestamps: [RECENT] },
    { fileId: 4, authorId: SARN, timestamps: [RECENT, RECENT] },
    { fileId: 5, authorId: SARN, timestamps: [RECENT] },
    { fileId: 5, authorId: DRUSK, timestamps: [RECENT] },
    { fileId: 6, authorId: DRUSK, timestamps: [ANCIENT_OTHER_DAY] },
  ),
})

const totals = realmTotals(realm, NOW)
const rankings = barbarianRankings(realm, NOW)

describe('realmTotals', () => {
  it('counts what the metrics count, over everybody at once', () => {
    expect(totals).toEqual({
      lines: 12,
      legacyLines: 6, // b.ts (3), big.ts (1), c.js (2)
      ancientLines: 6,
      files: 6,
      extensions: 3, // .ts .js .md
      days: 3, // the two ancient days and the recent one
    })
  })

  it('is the sum of the warriors for everything a line can only belong to one of', () => {
    const sum = (read: (m: BarbarianWarriorMetrics) => number) =>
      rankings.reduce((total, one) => total + read(one.metrics), 0)

    expect(sum((m) => m.survivingLines)).toBe(totals.lines)
    expect(sum((m) => m.battleScars)).toBe(totals.legacyLines)
    expect(sum((m) => m.ancientCodeSurvival)).toBe(totals.ancientLines)
  })

  it('never lets one warrior hold more than the whole', () => {
    // Files held, file types and days can be shared, so the warriors need not
    // add up to the total -- but nobody can exceed it, or a bar runs past full.
    for (const one of rankings) {
      for (const measure of REALM_MEASURES) {
        expect(measure.read(one.metrics)).toBeLessThanOrEqual(
          totals[measure.of],
        )
      }
    }
  })

  it('counts a file nobody holds a majority of among the files, though no warrior conquered it', () => {
    const conquered = rankings.reduce(
      (n, one) => n + one.metrics.territoryConquered,
      0,
    )
    expect(conquered).toBe(5)
    expect(totals.files).toBe(6)
  })

  it('is all zeroes for a repository with nothing in it', () => {
    expect(realmTotals(EMPTY_ANALYSIS, NOW)).toEqual({
      lines: 0,
      legacyLines: 0,
      ancientLines: 0,
      files: 0,
      extensions: 0,
      days: 0,
    })
  })
})

describe('REALM_MEASURES', () => {
  it('names a whole for every metric the rankings show, and its unit', () => {
    expect(REALM_MEASURES.map((m) => [m.key, m.of, m.unit])).toEqual([
      ['battleScars', 'legacyLines', 'lines'],
      ['territoryConquered', 'files', 'files'],
      ['soloQuestVictories', 'files', 'files'],
      ['weaponMastery', 'extensions', 'file types'],
      ['ancientCodeSurvival', 'ancientLines', 'lines'],
      ['massiveBattles', 'days', 'days'],
      ['totalCampaigns', 'days', 'days'],
    ])
  })
})

describe('placeAmong', () => {
  const read = (m: BarbarianWarriorMetrics) => m.ancientCodeSurvival

  it('is one more than the number of warriors with strictly more', () => {
    // Gorvek 5 ancient lines, Drusk 1, Sarn 0.
    expect(placeAmong(rankings, read, GORVEK)).toEqual({
      place: 1,
      of: 3,
      shared: false,
    })
    expect(placeAmong(rankings, read, DRUSK)).toEqual({
      place: 2,
      of: 3,
      shared: false,
    })
    expect(placeAmong(rankings, read, SARN)).toEqual({
      place: 3,
      of: 3,
      shared: false,
    })
  })

  it('gives warriors who tie the same place, and says it is shared', () => {
    // Sarn holds .ts and .js, Drusk .ts and .md: two file types each.
    const types = (m: BarbarianWarriorMetrics) => m.weaponMastery
    expect(placeAmong(rankings, types, SARN)).toEqual({
      place: 1,
      of: 3,
      shared: true,
    })
    expect(placeAmong(rankings, types, DRUSK)).toEqual({
      place: 1,
      of: 3,
      shared: true,
    })
  })

  it('is null for somebody who is not in the ranking', () => {
    expect(placeAmong(rankings, read, 99)).toBeNull()
  })
})
