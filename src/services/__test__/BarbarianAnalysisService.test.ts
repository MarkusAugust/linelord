import { beforeEach, describe, expect, it } from 'bun:test'
import { createDatabase } from '../../db/database'
import { authors, blameLines, files } from '../../db/schema'
import { BarbarianAnalysisService } from '../BarbarianAnalysisService'

const NOW = new Date('2025-09-01T00:00:00Z')
const ANCIENT = '2020-01-15T10:00:00.000Z'
const RECENT = '2025-06-01T10:00:00.000Z'

const GORVEK = 1
const NIGHTSHROUD = 2
const GHOST = 3

/**
 * A small repository with known ownership:
 *
 *   src/a.ts         3 lines, all Gorvek's, all ancient
 *   src/legacy/b.ts  2 ancient Gorvek lines + 1 recent Nightshroud line
 *   src/big.ts       1 recent Gorvek line, file over the 5000-byte mark
 *   src/c.js         2 recent Nightshroud lines
 *
 * Ghost is a canonical author with no surviving lines at all.
 */
async function seed(db: ReturnType<typeof createDatabase>) {
  await db.insert(authors).values([
    {
      id: GORVEK,
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
      displayName: 'Gorvek the Ironbane',
      isCanonical: true,
    },
    {
      id: NIGHTSHROUD,
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
      displayName: 'Sister Nightshroud',
      isCanonical: true,
    },
    {
      id: GHOST,
      name: 'Ghost of Commits Past',
      email: 'ghost@ashendale.realm',
      displayName: 'Ghost of Commits Past',
      isCanonical: true,
    },
  ])

  await db.insert(files).values([
    { id: 1, path: 'src/a.ts', extension: '.ts', size: 100 },
    { id: 2, path: 'src/legacy/b.ts', extension: '.ts', size: 100 },
    { id: 3, path: 'src/big.ts', extension: '.ts', size: 6000 },
    { id: 4, path: 'src/c.js', extension: '.js', size: 100 },
  ])

  const lines: Array<{
    fileId: number
    authorId: number
    lineNumber: number
    commitDate: string
  }> = []
  const add = (
    fileId: number,
    authorId: number,
    count: number,
    commitDate: string,
  ) => {
    for (let i = 0; i < count; i++) {
      lines.push({ fileId, authorId, lineNumber: lines.length + 1, commitDate })
    }
  }

  add(1, GORVEK, 3, ANCIENT)
  add(2, GORVEK, 2, ANCIENT)
  add(3, GORVEK, 1, RECENT)
  add(2, NIGHTSHROUD, 1, RECENT)
  add(4, NIGHTSHROUD, 2, RECENT)

  await db.insert(blameLines).values(lines)
}

describe('BarbarianAnalysisService', () => {
  let db: ReturnType<typeof createDatabase>
  let service: BarbarianAnalysisService

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
    service = new BarbarianAnalysisService(db, NOW)
  })

  it('leaves out canonical authors who hold no surviving lines', async () => {
    const rankings = await service.getBarbarianRankings()

    expect(rankings.map((r) => r.authorId)).not.toContain(GHOST)
    expect(rankings).toHaveLength(2)
  })

  it('counts ownership from surviving lines rather than from commits', async () => {
    const rankings = await service.getBarbarianRankings()
    const gorvek = rankings.find((r) => r.authorId === GORVEK)
    const nightshroud = rankings.find((r) => r.authorId === NIGHTSHROUD)

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

    expect(nightshroud?.metrics).toEqual({
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

  it('measures code age against the injected clock, not the wall clock', async () => {
    // Move "now" to before the ancient lines were written, and nothing is old.
    const earlyService = new BarbarianAnalysisService(
      db,
      new Date('2020-06-01T00:00:00Z'),
    )
    const rankings = await earlyService.getBarbarianRankings()
    const gorvek = rankings.find((r) => r.authorId === GORVEK)

    expect(gorvek?.metrics.ancientCodeSurvival).toBe(0)
  })

  it('ranks by Gorvek score, highest first, with zero-based ranks', async () => {
    const rankings = await service.getBarbarianRankings()

    expect(rankings.map((r) => r.authorId)).toEqual([GORVEK, NIGHTSHROUD])
    expect(rankings.map((r) => r.rank)).toEqual([0, 1])
    expect(rankings[0]?.gorvekScore).toBeGreaterThan(
      rankings[1]?.gorvekScore ?? 0,
    )
    // conquest 3*8 + 2*12 + ln(1)*6, endurance 5*1.5 + 3*2, intensity ln(2)*3
    expect(rankings[0]?.gorvekScore).toBeCloseTo(63.58, 2)
  })

  it('crowns the leader and gives every other warrior a distributed title', async () => {
    const rankings = await service.getBarbarianRankings()

    expect(rankings[0]?.barbarianTitle).toBe('WARLORD OF THE REPOSITORY')
    expect(rankings[1]?.barbarianTitle).toBeTruthy()
    expect(rankings[1]?.barbarianTitle).toBe(
      rankings[1]?.barbarianTitle?.toUpperCase() ?? '',
    )
  })

  it('awards each achievement to a single category leader, and never for zero', async () => {
    const rankings = await service.getBarbarianRankings()
    const gorvek = rankings.find((r) => r.authorId === GORVEK)
    const nightshroud = rankings.find((r) => r.authorId === NIGHTSHROUD)

    // Nightshroud leads only on weapon mastery (2 extensions against 1).
    expect(nightshroud?.specialAchievements).toEqual([
      '⚡ Master of Many Weapons',
    ])

    expect(gorvek?.specialAchievements).toContain('🏰 Conqueror of Domains')
    expect(gorvek?.specialAchievements).toContain('🏺 Guardian of Ancient Code')

    // Nobody had a day over 100 lines, so that achievement goes unawarded.
    const allAwarded = rankings.flatMap((r) => r.specialAchievements)
    expect(allAwarded).not.toContain('💥 Breaker of Mountains')

    // Each achievement is held by exactly one warrior.
    expect(new Set(allAwarded).size).toBe(allAwarded.length)
  })

  it('returns nothing for a repository with no blame data', async () => {
    const emptyDb = createDatabase()
    const emptyService = new BarbarianAnalysisService(emptyDb, NOW)

    expect(await emptyService.getBarbarianRankings()).toEqual([])
  })
})
