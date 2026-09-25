import { beforeEach, describe, expect, it } from 'bun:test'
import { createDatabase } from '../../db/database'
import { HISTORY_HEAD_KEY, writeMeta } from '../../db/meta'
import {
  authors,
  blameLines,
  cohortLines,
  files,
  snapshots,
} from '../../db/schema'
import { LongevityService } from '../LongevityService'
import { warriorSourceFor } from '../WarriorSource'

/**
 * The seam between the warrior screen and the services it draws from.
 *
 * Each answer is compared against the service that owns it, so the test
 * says the source passes things through faithfully -- what the numbers are
 * is the services' own tests' business.
 */

const NOW = new Date('2026-09-20T00:00:00Z')
const DAY = 24 * 60 * 60
const nowSeconds = Math.floor(NOW.getTime() / 1000)
const daysAgo = (days: number) => Math.round(nowSeconds - days * DAY)

const GORVEK = 1
const GHOST = 2
const HEAD = 'a'.repeat(40)

type Db = ReturnType<typeof createDatabase>

async function seed(db: Db) {
  await db.insert(authors).values([
    {
      id: GORVEK,
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
      displayName: 'Gorvek the Ironbane',
      isCanonical: true,
      canonicalId: GORVEK,
      rank: 1,
      percentage: 100,
      title: 'legend',
    },
    {
      id: GHOST,
      name: 'Ghost of Commits Past',
      email: 'ghost@ashendale.realm',
      displayName: 'Ghost of Commits Past',
      isCanonical: true,
      canonicalId: GHOST,
    },
  ])
  await db.insert(files).values([
    { id: 1, path: 'src/old.ts', extension: '.ts', size: 100, totalLines: 3 },
    { id: 2, path: 'src/new.ts', extension: '.ts', size: 100, totalLines: 1 },
  ])
  await db.insert(blameLines).values([
    {
      fileId: 1,
      authorId: GORVEK,
      lineNumber: 1,
      commitTimestamp: daysAgo(400),
    },
    {
      fileId: 1,
      authorId: GORVEK,
      lineNumber: 2,
      commitTimestamp: daysAgo(300),
    },
    {
      fileId: 1,
      authorId: GORVEK,
      lineNumber: 3,
      commitTimestamp: daysAgo(200),
    },
    { fileId: 2, authorId: GORVEK, lineNumber: 1, commitTimestamp: daysAgo(2) },
  ])
}

async function seedHistory(db: Db, describes: string) {
  await db.insert(snapshots).values([
    {
      id: 1,
      commitSha: 'b'.repeat(40),
      snapshotTimestamp: daysAgo(60),
      totalLines: 10,
    },
    {
      id: 2,
      commitSha: 'c'.repeat(40),
      snapshotTimestamp: daysAgo(30),
      totalLines: 10,
    },
  ])
  await db.insert(cohortLines).values([
    { snapshotId: 1, authorId: GHOST, cohortMonth: daysAgo(90), lineCount: 10 },
    { snapshotId: 2, authorId: GHOST, cohortMonth: daysAgo(90), lineCount: 4 },
  ])
  writeMeta(db, { [HISTORY_HEAD_KEY]: describes })
}

describe('warriorSourceFor', () => {
  let db: Db

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
  })

  it('answers with the share the analysis recorded, and nothing for a ghost', async () => {
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    const gorvek = await source.share(GORVEK)
    expect(gorvek?.totalLines).toBe(4)
    expect(gorvek?.totalFiles).toBe(2)
    expect(gorvek?.title).toBe('legend')
    expect(await source.share(GHOST)).toBeNull()
  })

  it('lists the files they hold the most lines in first', async () => {
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    const held = await source.files(GORVEK)
    expect(held.map((one) => one.path)).toEqual(['src/old.ts', 'src/new.ts'])
    expect(held[0]?.authorLines).toBe(3)
    expect(await source.files(GHOST)).toEqual([])
  })

  it('measures the age of what they hold against the given now', async () => {
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    const age = await source.age(GORVEK)
    const [own] = await new LongevityService(db, NOW).forAuthors()
    expect(age?.medianAgeDays).toBe(own?.medianAgeDays ?? Number.NaN)
    expect(age?.oldestLine?.path).toBe('src/old.ts')
    expect(age?.newestLine?.path).toBe('src/new.ts')
    expect(await source.age(GHOST)).toBeNull()
  })

  it('names the files where their oldest code sits', async () => {
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    const oldest = await source.oldestFiles(GORVEK)
    expect(oldest[0]?.path).toBe('src/old.ts')
    expect(oldest[0]?.lines).toBe(3)
  })

  it('has no survival to report when no history was walked', async () => {
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    expect(await source.survival(GHOST)).toBeNull()
  })

  it('reports survival from a history about the revision being analysed', async () => {
    await seedHistory(db, HEAD)
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    const ghost = await source.survival(GHOST)
    expect(ghost?.linesEverWritten).toBe(10)
    expect(ghost?.survivingLines).toBe(4)
    expect(ghost?.name).toBe('Ghost of Commits Past')
    // Gorvek was never seen by the walk.
    expect(await source.survival(GORVEK)).toBeNull()
  })

  it('has no history to offer when the analysis named no revision', async () => {
    await seedHistory(db, HEAD)
    const source = warriorSourceFor({ db, analysedRevision: null, now: NOW })

    expect(await source.survival(GHOST)).toBeNull()
  })

  it('refuses a history about some other revision', async () => {
    // A curve drawn from it would be about a repository that has changed
    // since. The dashboard says so on screen; the detail simply leaves it out.
    await seedHistory(db, 'd'.repeat(40))
    const source = warriorSourceFor({ db, analysedRevision: HEAD, now: NOW })

    expect(await source.survival(GHOST)).toBeNull()
  })
})
