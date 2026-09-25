import { beforeEach, describe, expect, it } from 'bun:test'
import { createDatabase } from '../../adapters/sqlite/database'
import { authors, blameLines, files } from '../../adapters/sqlite/schema'
import { AuthorRankingService } from '../AuthorRankingService'

type Db = ReturnType<typeof createDatabase>

const WARLORD = 1
const CHAMPION = 2
const SQUIRE = 3
const GHOST = 4

/**
 * Four canonical authors holding 60, 30, 10 and 0 of the 100 surviving lines.
 * The round numbers make the percentages checkable by eye.
 */
async function seed(db: Db) {
  await db.insert(authors).values([
    {
      id: WARLORD,
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
      displayName: 'Gorvek the Ironbane',
      isCanonical: true,
    },
    {
      id: CHAMPION,
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
      displayName: 'Sister Nightshroud',
      isCanonical: true,
    },
    {
      id: SQUIRE,
      name: 'Zygofer the Defiler',
      email: 'zygofer@ashendale.realm',
      displayName: 'Zygofer the Defiler',
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
  await db
    .insert(files)
    .values([{ id: 1, path: 'a.ts', extension: '.ts', size: 10 }])

  const lines: Array<{ fileId: number; authorId: number; lineNumber: number }> =
    []
  const add = (authorId: number, count: number) => {
    for (let i = 0; i < count; i++) {
      lines.push({ fileId: 1, authorId, lineNumber: lines.length + 1 })
    }
  }
  add(WARLORD, 60)
  add(CHAMPION, 30)
  add(SQUIRE, 10)

  await db.insert(blameLines).values(lines)
}

async function authorRows(db: Db) {
  const rows = await db.select().from(authors)
  return new Map(rows.map((row) => [row.id, row]))
}

describe('AuthorRankingService', () => {
  let db: Db

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
  })

  it('ranks from 1 downwards by surviving line count', async () => {
    await new AuthorRankingService(db).calculateAndAssignRanksAndPercentages()

    const rows = await authorRows(db)
    expect(rows.get(WARLORD)?.rank).toBe(1)
    expect(rows.get(CHAMPION)?.rank).toBe(2)
    expect(rows.get(SQUIRE)?.rank).toBe(3)
  })

  it('stores percentages of the whole project, rounded to two decimals', async () => {
    await new AuthorRankingService(db).calculateAndAssignRanksAndPercentages()

    const rows = await authorRows(db)
    expect(rows.get(WARLORD)?.percentage).toBe(60)
    expect(rows.get(CHAMPION)?.percentage).toBe(30)
    expect(rows.get(SQUIRE)?.percentage).toBe(10)
  })

  it('rounds awkward shares to two decimals rather than truncating', async () => {
    const oddDb = createDatabase()
    await oddDb.insert(authors).values([
      {
        id: 1,
        name: 'A',
        email: 'a@x.com',
        displayName: 'A',
        isCanonical: true,
      },
      {
        id: 2,
        name: 'B',
        email: 'b@x.com',
        displayName: 'B',
        isCanonical: true,
      },
      {
        id: 3,
        name: 'C',
        email: 'c@x.com',
        displayName: 'C',
        isCanonical: true,
      },
    ])
    await oddDb
      .insert(files)
      .values([{ id: 1, path: 'a.ts', extension: '.ts', size: 10 }])
    await oddDb.insert(blameLines).values(
      // One line each: a third of the project apiece.
      [1, 2, 3].map((authorId) => ({
        fileId: 1,
        authorId,
        lineNumber: authorId,
      })),
    )

    await new AuthorRankingService(
      oddDb,
    ).calculateAndAssignRanksAndPercentages()

    const rows = await authorRows(oddDb)
    expect(rows.get(1)?.percentage).toBe(33.33)
  })

  it('clears rank, percentage and title for authors holding no lines', async () => {
    await new AuthorRankingService(db).calculateAndAssignRanksAndPercentages()

    const ghost = (await authorRows(db)).get(GHOST)
    expect(ghost?.rank).toBeNull()
    expect(ghost?.percentage).toBe(0)
    expect(ghost?.title).toBeNull()
  })

  it('gives every contributing author a title and the leader the best one', async () => {
    await new AuthorRankingService(db).calculateAndAssignRanksAndPercentages()

    const rows = await authorRows(db)
    for (const id of [WARLORD, CHAMPION, SQUIRE]) {
      expect(rows.get(id)?.title).toBeTruthy()
    }
    // Distinct ranks must not share a title within so small a field.
    const titles = [WARLORD, CHAMPION, SQUIRE].map(
      (id) => rows.get(id)?.title ?? '',
    )
    expect(new Set(titles).size).toBe(3)
  })

  it('ignores non-canonical identities when ranking', async () => {
    // An alias row with lines of its own must not appear in the ranking; only
    // the canonical author it was merged into may.
    await db.insert(authors).values({
      id: 99,
      name: 'gorvek',
      email: 'gorvek.alias@ashendale.realm',
      displayName: 'gorvek',
      isCanonical: false,
      canonicalId: WARLORD,
    })
    await db
      .insert(blameLines)
      .values([{ fileId: 1, authorId: 99, lineNumber: 999 }])

    await new AuthorRankingService(db).calculateAndAssignRanksAndPercentages()

    const rows = await authorRows(db)
    expect(rows.get(99)?.rank).toBeNull()
    expect(rows.get(WARLORD)?.rank).toBe(1)
  })

  it('does nothing when the repository has no blame data at all', async () => {
    const emptyDb = createDatabase()
    await emptyDb.insert(authors).values({
      id: 1,
      name: 'Nobody',
      email: 'nobody@x.com',
      displayName: 'Nobody',
      isCanonical: true,
    })

    await new AuthorRankingService(
      emptyDb,
    ).calculateAndAssignRanksAndPercentages()

    const row = (await authorRows(emptyDb)).get(1)
    expect(row?.rank).toBeNull()
    expect(row?.title).toBeNull()
  })

  it('is idempotent: running twice leaves the same ranks and percentages', async () => {
    const service = new AuthorRankingService(db)
    await service.calculateAndAssignRanksAndPercentages()
    const first = await db.select().from(authors)
    await service.calculateAndAssignRanksAndPercentages()
    const second = await db.select().from(authors)

    expect(second).toEqual(first)
  })
})
