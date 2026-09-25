import { beforeEach, describe, expect, it } from 'bun:test'
import { createDatabase } from '../../adapters/sqlite/database'
import { authors, blameLines, files } from '../../adapters/sqlite/schema'
import { LongevityService } from '../LongevityService'

/**
 * How old the code somebody still owns is.
 *
 * Seeded straight into the database rather than built out of a git repository,
 * because what is under test is the arithmetic: a median that is actually the
 * middle, percentiles that fall where they should, and buckets whose edges are
 * where they claim to be. `now` is a parameter for the same reason.
 */

const NOW = new Date('2026-09-20T00:00:00Z')
const DAY = 24 * 60 * 60
const nowSeconds = Math.floor(NOW.getTime() / 1000)
/** A commit timestamp this many days before `NOW`. */
const daysAgo = (days: number) => Math.round(nowSeconds - days * DAY)

const GORVEK = 1
const NIGHTSHROUD = 2
const GHOST = 3

type Db = ReturnType<typeof createDatabase>

async function seedAuthors(db: Db) {
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
    { id: 1, path: 'src/old.ts', extension: '.ts', size: 100 },
    { id: 2, path: 'src/new.ts', extension: '.ts', size: 100 },
  ])
}

/** Give an author one line per age in the list. */
async function give(db: Db, authorId: number, ages: number[], fileId = 1) {
  const rows = ages.map((age, index) => ({
    fileId,
    authorId,
    lineNumber: index + 1,
    commitHash: 'a'.repeat(40),
    commitTimestamp: daysAgo(age),
  }))
  if (rows.length > 0) await db.insert(blameLines).values(rows)
}

describe('LongevityService, per author', () => {
  let db: Db

  beforeEach(async () => {
    db = createDatabase()
    await seedAuthors(db)
  })

  it('reports the middle of the ages, not the average of them', async () => {
    // One very old line drags a mean a long way and a median not at all,
    // which is the whole reason the plan asks for median as the primary key.
    await give(db, GORVEK, [1, 2, 3, 4, 3650])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.medianAgeDays).toBe(3)
    expect(gorvek?.meanAgeDays).toBeCloseTo((1 + 2 + 3 + 4 + 3650) / 5, 5)
  })

  it('spreads the ages with the tenth and ninetieth percentiles', async () => {
    const ages = Array.from({ length: 10 }, (_, index) => (index + 1) * 10)
    await give(db, GORVEK, ages)

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.p10AgeDays).toBe(10)
    expect(gorvek?.p90AgeDays).toBe(90)
  })

  it('counts only the lines that are still there', async () => {
    await give(db, GORVEK, [5, 10])
    await give(db, NIGHTSHROUD, [5])

    const result = await new LongevityService(db, NOW).forAuthors()

    expect(result.find((one) => one.authorId === GORVEK)?.survivingLines).toBe(
      2,
    )
    // A canonical author with nothing left in HEAD is not a row with zeroes;
    // they are simply not in the answer.
    expect(result.map((one) => one.authorId)).not.toContain(GHOST)
  })

  it('names the oldest and newest line it can still point at', async () => {
    await give(db, GORVEK, [400], 1)
    await give(db, GORVEK, [2], 2)

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.oldestLine?.path).toBe('src/old.ts')
    expect(gorvek?.newestLine?.path).toBe('src/new.ts')
    expect(gorvek?.oldestLine?.lineNumber).toBe(1)
    // The age travels with the line, so nothing on screen has to work it out
    // against a clock of its own.
    expect(gorvek?.oldestLine?.ageDays).toBe(400)
    expect(gorvek?.newestLine?.ageDays).toBe(2)
  })

  it('measures how far apart the oldest and newest are', async () => {
    await give(db, GORVEK, [400, 2])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.activeSpanDays).toBe(398)
  })

  it('puts each line in the bucket its age belongs to', async () => {
    // One on each side of every edge, so an edge that moved would show.
    await give(db, GORVEK, [
      3, // under a week
      20, // a week to a month
      60, // one to three months
      200, // three to twelve months
      500, // one to two years
      900, // over two years
    ])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.ageHistogram).toEqual({
      underAWeek: 1,
      weekToMonth: 1,
      oneToThreeMonths: 1,
      threeToTwelveMonths: 1,
      oneToTwoYears: 1,
      overTwoYears: 1,
    })
  })

  it('puts an age that lands exactly on an edge in the older bucket', async () => {
    // A line exactly seven days old is not "under a week". Every edge was
    // inclusive on the young side, so each boundary value fell one bucket
    // short of where its own label says it belongs.
    await give(db, GORVEK, [7, 30, 90, 365, 730])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.ageHistogram).toEqual({
      underAWeek: 0,
      weekToMonth: 1,
      oneToThreeMonths: 1,
      threeToTwelveMonths: 1,
      oneToTwoYears: 1,
      overTwoYears: 1,
    })
  })

  it('keeps an age just inside an edge in the younger bucket', async () => {
    // The other side of the same line, so a fix that simply moved the
    // inclusive edge across would not pass.
    await give(db, GORVEK, [6.9, 29.9])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.ageHistogram.underAWeek).toBe(1)
    expect(gorvek?.ageHistogram.weekToMonth).toBe(1)
  })

  it('sorts the oldest code first, which is the question being asked', async () => {
    await give(db, GORVEK, [1000, 1000, 1000])
    await give(db, NIGHTSHROUD, [1, 1, 1])

    const result = await new LongevityService(db, NOW).forAuthors()

    expect(result.map((one) => one.authorId)).toEqual([GORVEK, NIGHTSHROUD])
  })

  it('carries the name and address, so the interface need not ask again', async () => {
    await give(db, GORVEK, [5])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.name).toBe('Gorvek the Ironbane')
    expect(gorvek?.email).toBe('gorvek@ashendale.realm')
  })

  it('leaves out a line whose commit time was never recorded', async () => {
    await db.insert(blameLines).values({
      fileId: 1,
      authorId: GORVEK,
      lineNumber: 1,
      commitHash: null,
      commitTimestamp: null,
    })
    await give(db, GORVEK, [10])

    const [gorvek] = await new LongevityService(db, NOW).forAuthors()

    expect(gorvek?.survivingLines).toBe(1)
  })

  it('has nothing to say about an empty repository', async () => {
    expect(await new LongevityService(db, NOW).forAuthors()).toEqual([])
  })
})

describe('LongevityService, the files behind one author', () => {
  let db: Db

  beforeEach(async () => {
    db = createDatabase()
    await seedAuthors(db)
  })

  it('names the files where an author holds the oldest code', async () => {
    // Equal ages within each file, so this test is about which file ranks
    // first and not about which of two middles a median picks.
    await give(db, GORVEK, [900, 900], 1)
    await give(db, GORVEK, [3, 3], 2)

    const files = await new LongevityService(db, NOW).filesForAuthor(GORVEK)

    expect(files.map((one) => one.path)).toEqual(['src/old.ts', 'src/new.ts'])
    expect(files[0]?.lines).toBe(2)
    expect(files[0]?.medianAgeDays).toBe(900)
  })

  it("counts only that author's lines in each file", async () => {
    await give(db, GORVEK, [500], 1)
    await give(db, NIGHTSHROUD, [500, 500, 500], 1)

    const files = await new LongevityService(db, NOW).filesForAuthor(GORVEK)

    expect(files[0]?.lines).toBe(1)
  })

  it('keeps the list short enough to read', async () => {
    await give(db, GORVEK, [1, 2], 1)
    await give(db, GORVEK, [3, 4], 2)

    const files = await new LongevityService(db, NOW).filesForAuthor(GORVEK, 1)

    expect(files).toHaveLength(1)
  })

  it('has nothing to show for an author who owns nothing', async () => {
    expect(await new LongevityService(db, NOW).filesForAuthor(GHOST)).toEqual(
      [],
    )
  })
})

describe('LongevityService, for the whole repository', () => {
  let db: Db

  beforeEach(async () => {
    db = createDatabase()
    await seedAuthors(db)
  })

  it('reports the middle age of everything still standing', async () => {
    await give(db, GORVEK, [1, 2, 3])
    await give(db, NIGHTSHROUD, [100, 200])

    const repository = await new LongevityService(db, NOW).forRepository()

    expect(repository.survivingLines).toBe(5)
    expect(repository.medianAgeDays).toBe(3)
  })

  it('says how much of the codebase was written in the last ninety days', async () => {
    await give(db, GORVEK, [10, 20, 30])
    await give(db, NIGHTSHROUD, [100])

    const repository = await new LongevityService(db, NOW).forRepository()

    expect(repository.writtenInLast90Days).toBeCloseTo(0.75, 5)
  })

  it('points at the oldest line anyone still owns', async () => {
    await give(db, GORVEK, [400], 1)
    await give(db, NIGHTSHROUD, [2], 2)

    const repository = await new LongevityService(db, NOW).forRepository()

    expect(repository.oldestLine?.path).toBe('src/old.ts')
    expect(repository.oldestLine?.ageDays).toBe(400)
  })

  it('takes the middle the same way the per-author figures do', async () => {
    // With an even number of lines there are two middles and a choice to be
    // made, and the two calculations were making it differently -- so a
    // repository with one contributor reported two different medians for the
    // same lines. Odd counts hide it: both conventions agree there.
    await give(db, GORVEK, [1, 2, 3, 4])

    const service = new LongevityService(db, NOW)
    const [gorvek] = await service.forAuthors()
    const repository = await service.forRepository()

    expect(repository.medianAgeDays).toBe(gorvek?.medianAgeDays ?? -1)
  })

  it('answers an empty repository without inventing numbers', async () => {
    const repository = await new LongevityService(db, NOW).forRepository()

    expect(repository.survivingLines).toBe(0)
    expect(repository.medianAgeDays).toBe(null)
    expect(repository.oldestLine).toBe(null)
    expect(repository.writtenInLast90Days).toBe(0)
  })
})
