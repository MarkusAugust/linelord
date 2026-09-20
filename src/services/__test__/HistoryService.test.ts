import { afterEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { authors, cohortLines, snapshots } from '../../db/schema'
import { HistoryService } from '../HistoryService'

/**
 * Walking the history, and the one thing that must be true about it.
 *
 * The service blames only the paths some commit touched since the previous
 * snapshot and carries the rest across. That is what makes it finish at all,
 * and it is only worth anything if the answer is the same as blaming
 * everything every time. The test that says so is the most important one
 * here; the rest describe what the walk produces.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'night@alderstone.realm',
}
const ZYGOFER = { name: 'Zygofer the Defiler', email: 'zygofer@vale.realm' }

type Db = ReturnType<typeof createDatabase>

/**
 * A repository with a year of history: work written, partly rewritten by
 * somebody else, added to, reverted within a month, and deleted.
 */
async function repoWithAYear(): Promise<TestRepo> {
  const repo = await createTestRepo()
  const lines = (count: number, tag: string) =>
    Array.from({ length: count }, (_, index) => `${tag} ${index}`).join('\n') +
    '\n'

  await repo.commit({
    message: 'the first work',
    author: GORVEK,
    date: new Date('2025-01-10T10:00:00Z'),
    write: { 'a.ts': lines(10, 'a'), 'b.ts': lines(6, 'b') },
  })
  await repo.commit({
    message: 'a second hand',
    author: NIGHTSHROUD,
    date: new Date('2025-03-12T10:00:00Z'),
    write: { 'a.ts': `${lines(5, 'a')}${lines(5, 'rewritten')}` },
  })
  // Made and undone inside one month: invisible to a diff of the month's two
  // ends, and it moves every line of the file to a different author.
  await repo.commit({
    message: 'a change',
    author: ZYGOFER,
    date: new Date('2025-05-02T10:00:00Z'),
    write: { 'b.ts': lines(6, 'zygofer') },
  })
  await repo.commit({
    message: 'and back again',
    author: ZYGOFER,
    date: new Date('2025-05-20T10:00:00Z'),
    write: { 'b.ts': lines(6, 'b') },
  })
  await repo.commit({
    message: 'something new',
    author: NIGHTSHROUD,
    date: new Date('2025-08-01T10:00:00Z'),
    write: { 'c.ts': lines(4, 'c') },
  })
  await repo.commit({
    message: 'and something gone',
    author: GORVEK,
    date: new Date('2025-11-03T10:00:00Z'),
    remove: ['b.ts'],
    write: { 'a.ts': lines(3, 'a') },
  })
  return repo
}

/** Every stored cohort row, in a shape two runs can be compared by. */
async function cohortRows(db: Db) {
  const rows = await db
    .select({
      sha: snapshots.commitSha,
      email: authors.email,
      month: cohortLines.cohortMonth,
      lines: cohortLines.lineCount,
    })
    .from(cohortLines)
    .innerJoin(snapshots, eq(snapshots.id, cohortLines.snapshotId))
    .innerJoin(authors, eq(authors.id, cohortLines.authorId))

  return rows
    .map((row) => `${row.sha} ${row.email} ${row.month} ${row.lines}`)
    .sort()
}

describe('HistoryService', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('gives the same answer re-blaming only what changed as re-blaming everything', async () => {
    // The whole feature rests on this. If carrying untouched files across is
    // not exactly equal to blaming them again, every survival curve is
    // quietly wrong and nothing on screen would say so.
    repo = await repoWithAYear()

    const incremental = createDatabase()
    await new HistoryService(repo.path, incremental, {
      interval: 'month',
    }).analyse()

    const exhaustive = createDatabase()
    await new HistoryService(repo.path, exhaustive, {
      interval: 'month',
      reuseBetweenSnapshots: false,
    }).analyse()

    expect(await cohortRows(incremental)).toEqual(await cohortRows(exhaustive))
  }, 120000)

  it('actually carries files across, so the test above is testing something', async () => {
    // Equal answers mean nothing if the fast path never ran.
    repo = await repoWithAYear()
    const db = createDatabase()

    const run = await new HistoryService(repo.path, db, {
      interval: 'month',
    }).analyse()

    expect(run.filesCarried).toBeGreaterThan(0)
    expect(run.snapshots).toBeGreaterThan(1)
  }, 120000)

  it('samples one revision per month of history', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, { interval: 'month' }).analyse()

    const stored = await db.select().from(snapshots)
    // January, March, May, August and November saw commits; no others did.
    expect(stored).toHaveLength(5)
    expect(stored.map((one) => one.snapshotTimestamp)).toEqual(
      [...stored.map((one) => one.snapshotTimestamp)].sort((a, b) => a - b),
    )
  }, 120000)

  it('counts what was alive then, not what is alive now', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, { interval: 'month' }).analyse()

    const stored = await db.select().from(snapshots)
    const first = stored[0]
    const last = stored[stored.length - 1]

    // Sixteen lines in January, and by November a.ts is down to three with
    // b.ts gone and c.ts holding four.
    expect(first?.totalLines).toBe(16)
    expect(last?.totalLines).toBe(7)
  }, 120000)

  it('keeps a contributor the present has forgotten', async () => {
    // Somebody whose every line has since been rewritten is absent from the
    // analysis of HEAD, and is precisely who this feature is about.
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, { interval: 'month' }).analyse()

    const stored = await db.select({ email: authors.email }).from(authors)
    expect(stored.map((one) => one.email)).toContain(ZYGOFER.email)
  }, 120000)

  it('honours the ceiling on how many revisions it will read', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, {
      interval: 'month',
      maxSnapshots: 2,
    }).analyse()

    expect(await db.select().from(snapshots)).toHaveLength(2)
  }, 120000)

  it('forgets an earlier history rather than adding to it', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()
    const service = new HistoryService(repo.path, db, { interval: 'month' })

    await service.analyse()
    const after = await cohortRows(db)
    await service.analyse()

    expect(await cohortRows(db)).toEqual(after)
  }, 120000)

  it('has nothing to walk in a repository with no commits', async () => {
    repo = await createTestRepo()
    const db = createDatabase()

    const run = await new HistoryService(repo.path, db).analyse()

    expect(run.snapshots).toBe(0)
  }, 60000)
})
