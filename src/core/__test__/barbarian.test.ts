import { describe, expect, it } from 'bun:test'
import { barbarianRankings, looksLegacy } from '../barbarian'
import { EMPTY_ANALYSIS } from '../model'
import { analysis, author, file, lines } from './fixtures'

const NOW = new Date('2025-09-01T00:00:00Z')
/** Author time in whole seconds, as blame reports it and the store keeps it. */
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
const ANCIENT = seconds('2020-01-15T10:00:00.000Z')
const RECENT = seconds('2025-06-01T10:00:00.000Z')

const GORVEK = 1
const SARN = 2
const GHOST = 3

/**
 * A small repository with known ownership:
 *
 *   src/a.ts         3 lines, all Gorvek's, all ancient
 *   src/legacy/b.ts  2 ancient Gorvek lines + 1 recent Sarn line
 *   src/big.ts       1 recent Gorvek line, file over the 5000-byte mark
 *   src/c.js         2 recent Sarn lines
 *
 * Ghost is a canonical author with no surviving lines at all.
 */
const seeded = analysis({
  authors: [
    author(GORVEK, {
      name: 'Gorvek of Bonereach',
      email: 'gorvek@bonereach.realm',
      title: 'legend',
    }),
    author(SARN, {
      name: 'Sarn the Faceless',
      email: 'sarn@kell.realm',
      title: 'peasant',
    }),
    author(GHOST, {
      name: 'Ghost of Commits Past',
      email: 'ghost@bonereach.realm',
    }),
  ],
  files: [
    file(1, 'src/a.ts'),
    file(2, 'src/legacy/b.ts'),
    file(3, 'src/big.ts', { size: 6000 }),
    file(4, 'src/c.js'),
  ],
  lines: lines(
    { fileId: 1, authorId: GORVEK, timestamps: [ANCIENT, ANCIENT, ANCIENT] },
    { fileId: 2, authorId: GORVEK, timestamps: [ANCIENT, ANCIENT] },
    { fileId: 3, authorId: GORVEK, timestamps: [RECENT] },
    { fileId: 2, authorId: SARN, timestamps: [RECENT] },
    { fileId: 4, authorId: SARN, timestamps: [RECENT, RECENT] },
  ),
})

describe('barbarianRankings', () => {
  it('leaves out canonical authors who hold no surviving lines', () => {
    const rankings = barbarianRankings(seeded, NOW)

    expect(rankings.map((r) => r.authorId)).not.toContain(GHOST)
    expect(rankings).toHaveLength(2)
  })

  it('counts ownership from surviving lines rather than from commits', () => {
    const rankings = barbarianRankings(seeded, NOW)
    const gorvek = rankings.find((r) => r.authorId === GORVEK)
    const sarn = rankings.find((r) => r.authorId === SARN)

    expect(gorvek?.metrics).toEqual({
      survivingLines: 6,
      // 2 lines in src/legacy/b.ts plus 1 in the oversized src/big.ts
      battleScars: 3,
      // owns 3/3, 2/3 and 1/1
      territoryConquered: 3,
      // sole owner of src/a.ts and src/big.ts
      soloQuestVictories: 2,
      // only ever .ts
      weaponMastery: 1,
      ancientCodeSurvival: 5,
      massiveBattles: 0,
      totalCampaigns: 2,
    })

    expect(sarn?.metrics).toEqual({
      survivingLines: 3,
      // 1 line in the legacy path plus 2 in a .js file
      battleScars: 3,
      territoryConquered: 1,
      soloQuestVictories: 1,
      weaponMastery: 2,
      ancientCodeSurvival: 0,
      massiveBattles: 0,
      totalCampaigns: 1,
    })
  })

  it('measures code age against the injected clock, not the wall clock', () => {
    // Move "now" to before the ancient lines were written, and nothing is old.
    const rankings = barbarianRankings(seeded, new Date('2020-06-01T00:00:00Z'))
    const gorvek = rankings.find((r) => r.authorId === GORVEK)

    expect(gorvek?.metrics.ancientCodeSurvival).toBe(0)
  })

  it('ranks by Gorvek score, highest first, with zero-based ranks', () => {
    const rankings = barbarianRankings(seeded, NOW)

    expect(rankings.map((r) => r.authorId)).toEqual([GORVEK, SARN])
    expect(rankings.map((r) => r.rank)).toEqual([0, 1])
    expect(rankings[0]?.gorvekScore).toBeGreaterThan(
      rankings[1]?.gorvekScore ?? 0,
    )
    // conquest 3*8 + 2*12 + ln(1)*6, endurance 5*1.5 + 3*2, intensity ln(2)*3
    expect(rankings[0]?.gorvekScore).toBeCloseTo(63.58, 2)
  })

  it('carries the title the line-share ranking gave, rather than handing out a second', () => {
    const rankings = barbarianRankings(seeded, NOW)

    expect(rankings[0]?.title).toBe('legend')
    expect(rankings[1]?.title).toBe('peasant')
  })

  it('leaves the title empty for a warrior the ranking never titled', () => {
    const untitled = analysis({
      ...seeded,
      authors: seeded.authors.map((one) => ({ ...one, title: null })),
    })

    expect(barbarianRankings(untitled, NOW).map((r) => r.title)).toEqual([
      null,
      null,
    ])
  })

  it('awards each achievement to a single category leader, and never for zero', () => {
    const rankings = barbarianRankings(seeded, NOW)
    const gorvek = rankings.find((r) => r.authorId === GORVEK)
    const sarn = rankings.find((r) => r.authorId === SARN)

    // Sarn leads only on weapon mastery (2 extensions against 1).
    expect(sarn?.specialAchievements).toEqual(['⚡ Master of Many Weapons'])

    expect(gorvek?.specialAchievements).toContain('🏰 Conqueror of Domains')
    expect(gorvek?.specialAchievements).toContain('🏺 Guardian of Ancient Code')

    // Nobody had a day over 100 lines, so that achievement goes unawarded.
    const allAwarded = rankings.flatMap((r) => r.specialAchievements)
    expect(allAwarded).not.toContain('💥 Breaker of Mountains')

    // Each achievement is held by exactly one warrior.
    expect(new Set(allAwarded).size).toBe(allAwarded.length)
  })

  it('counts a day of more than a hundred lines as a massive battle', () => {
    const busy = analysis({
      authors: [author(GORVEK, { name: 'Gorvek', email: 'g@x' })],
      files: [file(1, 'src/a.ts')],
      lines: lines({
        fileId: 1,
        authorId: GORVEK,
        timestamps: Array.from({ length: 101 }, () => RECENT),
      }),
    })

    const [gorvek] = barbarianRankings(busy, NOW)
    expect(gorvek?.metrics.massiveBattles).toBe(1)
    expect(gorvek?.metrics.totalCampaigns).toBe(1)
    expect(gorvek?.specialAchievements).toContain('💥 Breaker of Mountains')
  })

  it('does not count a file without an extension as a weapon', () => {
    const plain = analysis({
      authors: [author(GORVEK, { name: 'Gorvek', email: 'g@x' })],
      files: [file(1, 'Makefile'), file(2, 'src/a.ts')],
      lines: lines(
        { fileId: 1, authorId: GORVEK },
        { fileId: 2, authorId: GORVEK },
      ),
    })

    expect(barbarianRankings(plain, NOW)[0]?.metrics.weaponMastery).toBe(1)
  })

  it('returns nothing for a repository with no blame data', () => {
    expect(barbarianRankings(EMPTY_ANALYSIS, NOW)).toEqual([])
  })
})

describe('looksLegacy', () => {
  it('scars on size, on a legacy extension and on a legacy word in the path', () => {
    expect(looksLegacy(file(1, 'src/wide.ts', { size: 6000 }))).toBe(true)
    expect(looksLegacy(file(2, 'src/script.js'))).toBe(true)
    expect(looksLegacy(file(3, 'src/legacy/helper.ts'))).toBe(true)
    expect(looksLegacy(file(4, 'src/OldThing.ts'))).toBe(true)
    expect(looksLegacy(file(5, 'src/clean.ts'))).toBe(false)
  })
})
