import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../adapters/sqlite/database'
import { authors, blameLines, files } from '../../adapters/sqlite/schema'
import { BarbarianAnalysisService } from '../BarbarianAnalysisService'
import { LineLordService } from '../LineLordService'

const NOW = new Date('2025-09-01T00:00:00Z')
/** Author time in whole seconds, as blame reports it and the schema stores it. */
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
const ANCIENT = seconds('2020-01-15T10:00:00.000Z')
const RECENT = seconds('2025-06-01T10:00:00.000Z')

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
      title: 'legend',
    },
    {
      id: NIGHTSHROUD,
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
      displayName: 'Sister Nightshroud',
      isCanonical: true,
      title: 'peasant',
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
    commitTimestamp: number
  }> = []
  const add = (
    fileId: number,
    authorId: number,
    count: number,
    commitTimestamp: number,
  ) => {
    for (let i = 0; i < count; i++) {
      lines.push({
        fileId,
        authorId,
        lineNumber: lines.length + 1,
        commitTimestamp,
      })
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

  it('carries the title the line-share ranking gave, rather than handing out a second', async () => {
    // Two title systems on the same word list meant the same person was
    // "legend" on the overview and "warrior" here. There is one title now,
    // and it is the one the authors table holds.
    const rankings = await service.getBarbarianRankings()

    expect(rankings[0]?.title).toBe('legend')
    expect(rankings[1]?.title).toBe('peasant')
  })

  it('leaves the title empty for a warrior the ranking never titled', async () => {
    const untitled = createDatabase()
    await seed(untitled)
    await untitled.update(authors).set({ title: null })
    const rankings = await new BarbarianAnalysisService(
      untitled,
      NOW,
    ).getBarbarianRankings()

    expect(rankings.map((r) => r.title)).toEqual([null, null])
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

describe('BarbarianAnalysisService - battle scars and the size threshold', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  /** A plain .ts file, comfortably over the 5000-byte legacy mark. */
  const WIDE_FILE = `${'const filler = "aaaaaaaaaaaaaaaaaaaa"\n'.repeat(200)}`

  async function scarsFor(repoPath: string, thresholdBytes: number) {
    const service = new LineLordService(repoPath, thresholdBytes)
    await service.initialize()
    const rankings = await new BarbarianAnalysisService(
      service.getDatabase(),
    ).getBarbarianRankings()
    return rankings[0]?.metrics.battleScars ?? 0
  }

  it('counts lines in large files, which is where most scars come from', async () => {
    // The file is neither legacy-named nor a legacy extension, so only the
    // size clause can match it. Under the default threshold it is analysed,
    // and every one of its lines is a scar.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a wide file',
      write: { 'src/wide.ts': WIDE_FILE, 'src/narrow.ts': 'const a = 1\n' },
    })

    expect(await scarsFor(repo.path, 50 * 1024)).toBe(200)
  })

  it('counts none of them once the threshold excludes the file itself', async () => {
    // Below LEGACY_FILE_SIZE_BYTES the size clause can never match, because
    // GitService records no blame lines for a file the threshold excluded.
    // Scars fall away, and that is the configuration working as documented.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a wide file',
      write: { 'src/wide.ts': WIDE_FILE, 'src/narrow.ts': 'const a = 1\n' },
    })

    expect(await scarsFor(repo.path, 1024)).toBe(0)
  })

  it('still scars on path and extension when size cannot apply', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'small but dangerous',
      write: {
        'src/legacy/helper.ts': 'const legacy = 1\n',
        'src/script.js': 'const js = 1\n',
        'src/clean.ts': 'const clean = 1\n',
      },
    })

    // Two scars from the legacy path and the .js extension; clean.ts is neither.
    expect(await scarsFor(repo.path, 1024)).toBe(2)
  })
})
