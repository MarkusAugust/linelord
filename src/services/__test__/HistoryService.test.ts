import { afterEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { clearDatabase, createDatabase } from '../../adapters/sqlite/database'
import { HISTORY_HEAD_KEY, readMeta } from '../../adapters/sqlite/meta'
import { authors, cohortLines, snapshots } from '../../adapters/sqlite/schema'
import { createSqliteStore } from '../../adapters/sqlite/store'
import { survivalByAuthor } from '../../core/longevity'
import { HistoryService } from '../HistoryService'
import { LineLordService } from '../LineLordService'

/**
 * Walking the history, and the one thing that must be true about it.
 *
 * The service blames only the paths some commit touched since the previous
 * snapshot and carries the rest across. That is what makes it finish at all,
 * and it is only worth anything if the answer is the same as blaming
 * everything every time. The test that says so is the most important one
 * here; the rest describe what the walk produces.
 */

/** The same threshold the analysis of HEAD uses by default. */
const THRESHOLD = 50 * 1024

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
      thresholdBytes: THRESHOLD,
    }).analyse()

    const exhaustive = createDatabase()
    await new HistoryService(repo.path, exhaustive, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
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
      thresholdBytes: THRESHOLD,
    }).analyse()

    expect(run.filesCarried).toBeGreaterThan(0)
    expect(run.snapshots).toBeGreaterThan(1)
  }, 120000)

  it('samples one revision per month of history', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

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

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

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

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    const stored = await db.select({ email: authors.email }).from(authors)
    expect(stored.map((one) => one.email)).toContain(ZYGOFER.email)
  }, 120000)

  it('honours the ceiling on how many revisions it will read', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
      maxSnapshots: 2,
    }).analyse()

    expect(await db.select().from(snapshots)).toHaveLength(2)
  }, 120000)

  it('forgets an earlier history rather than adding to it', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()
    const service = new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    })

    await service.analyse()
    const after = await cohortRows(db)
    await service.analyse()

    expect(await cohortRows(db)).toEqual(after)
  }, 120000)

  it('is unmoved by a commit dated before its own parent', async () => {
    // Clock skew across machines, or a rebase. Ordering the snapshots by time
    // would put the descendant first, and the walk would then ask git for the
    // commits between two revisions that are not in that relation -- carrying
    // across counts that are wrong without looking wrong.
    repo = await createTestRepo()
    await repo.commit({
      message: 'the parent, dated June',
      author: GORVEK,
      date: new Date('2025-06-01T10:00:00Z'),
      write: { 'f.ts': 'one\ntwo\nthree\n' },
    })
    await repo.commit({
      message: 'the child, dated May',
      author: NIGHTSHROUD,
      date: new Date('2025-05-01T10:00:00Z'),
      write: { 'f.ts': 'one\ntwo\nfour\nfive\n' },
    })

    const incremental = createDatabase()
    await new HistoryService(repo.path, incremental, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()
    const exhaustive = createDatabase()
    await new HistoryService(repo.path, exhaustive, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
      reuseBetweenSnapshots: false,
    }).analyse()

    expect(await cohortRows(incremental)).toEqual(await cohortRows(exhaustive))

    // And the snapshots are walked parent first, whatever the dates say.
    const order = await incremental
      .select({ at: snapshots.snapshotTimestamp })
      .from(snapshots)
    expect(order).toHaveLength(2)
    expect(order[0]?.at).toBeGreaterThan(order[1]?.at ?? 0)
  }, 120000)

  it('blames the files even when handed a nonsense batch size', async () => {
    // Math.max(1, NaN) is NaN, and a batching loop stepping by NaN slices an
    // empty batch and then ends -- so nothing is read and the run reports
    // success with no lines at all. The same expression was found in
    // GitService a branch ago; this is the same settling.
    repo = await repoWithAYear()
    const db = createDatabase()

    const run = await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
      concurrency: Number.NaN,
    }).analyse()

    expect(run.filesBlamed).toBeGreaterThan(0)
    const [first] = await db.select().from(snapshots)
    expect(first?.totalLines).toBeGreaterThan(0)
  }, 120000)

  it('names a forgotten contributor rather than showing their address', async () => {
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    const [zygofer] = await db
      .select({ name: authors.displayName })
      .from(authors)
      .where(eq(authors.email, ZYGOFER.email))

    expect(zygofer?.name).toBe(ZYGOFER.name)
  }, 120000)

  it('records which revision the history describes', async () => {
    // Otherwise the rows sit in the cache after HEAD has moved on, and
    // nothing can tell that the curve drawn from them is about a repository
    // that no longer exists.
    repo = await repoWithAYear()
    const db = createDatabase()

    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    expect(readMeta(db, HISTORY_HEAD_KEY)).toBe(await repo.head())
  }, 120000)

  it('attributes a merged address to whoever it was merged into', async () => {
    // Identity normalisation has already run by the time this does. Pointing
    // a cohort row at the address rather than at the person splits somebody
    // who committed from two machines in two, or drops them entirely from
    // anything that joins on canonical authors.
    repo = await createTestRepo()
    await repo.commit({
      message: 'from the office',
      author: { name: 'Gorvek the Ironbane', email: 'gorvek@firma.no' },
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'one\ntwo\n' },
    })
    await repo.commit({
      message: 'from the laptop',
      author: { name: 'Gorvek Ironbane', email: 'gorvek@privat.no' },
      date: new Date('2025-02-10T10:00:00Z'),
      write: { 'b.ts': 'three\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      authorPolicy: 'loose',
    })
    await service.initialize()
    const db = service.getDatabase()
    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    const merged = await db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.isCanonical, false))
    const used = await db
      .select({ authorId: cohortLines.authorId })
      .from(cohortLines)
    const mergedIds = new Set(merged.map((one) => one.id))

    expect(merged.length).toBeGreaterThan(0)
    expect(used.filter((one) => mergedIds.has(one.authorId))).toEqual([])
  }, 120000)

  it('follows one month of work decaying across the snapshots', async () => {
    // This is what the whole feature is: a cohort is the month a line was
    // written, and reading one cohort across snapshots is the survival curve.
    // The equivalence test proves the fast path matches the slow one; it
    // would prove that just as happily if both were wrong. This says the
    // numbers mean what they are drawn as.
    repo = await createTestRepo()
    const ten = Array.from({ length: 10 }, (_, i) => `g${i}`).join('\n')
    await repo.commit({
      message: 'ten lines in January',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': `${ten}\n` },
    })
    await repo.commit({
      message: 'five of them rewritten in March',
      author: NIGHTSHROUD,
      date: new Date('2025-03-12T10:00:00Z'),
      write: { 'a.ts': 'g0\ng1\ng2\ng3\ng4\nn0\nn1\nn2\nn3\nn4\n' },
    })
    await repo.commit({
      message: 'three more of them rewritten in June',
      author: ZYGOFER,
      date: new Date('2025-06-14T10:00:00Z'),
      write: { 'a.ts': 'g0\ng1\nn0\nn1\nn2\nn3\nn4\nz0\nz1\nz2\n' },
    })

    const db = createDatabase()
    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    const january = Math.floor(
      new Date('2025-01-01T00:00:00Z').getTime() / 1000,
    )
    const rows = await db
      .select({
        at: snapshots.snapshotTimestamp,
        month: cohortLines.cohortMonth,
        lines: cohortLines.lineCount,
      })
      .from(cohortLines)
      .innerJoin(snapshots, eq(snapshots.id, cohortLines.snapshotId))

    const januaryCohort = rows
      .filter((row) => row.month === january)
      .sort((a, b) => a.at - b.at)
      .map((row) => row.lines)

    // Ten written, five still standing in March, two by June.
    expect(januaryCohort).toEqual([10, 5, 2])
  }, 120000)

  it('makes no claim about a history it has thrown away', async () => {
    // Clearing the rows while leaving the marker behind says the database
    // holds a history of one revision while holding none -- for the whole of
    // a run that may take minutes, and for good if that run is interrupted.
    repo = await repoWithAYear()
    const db = createDatabase()
    const service = new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    })
    await service.analyse()
    expect(readMeta(db, HISTORY_HEAD_KEY)).toBeTruthy()

    // What a run does before it has anything of its own to say.
    ;(service as unknown as { forgetPreviousRun(): void }).forgetPreviousRun()

    expect(readMeta(db, HISTORY_HEAD_KEY)).toBe(null)
    expect(await db.select().from(snapshots)).toHaveLength(0)
  }, 120000)

  it('is thrown away when the analysis it belongs to is', async () => {
    // A history describes one analysis of one repository. clearDatabase runs
    // whenever that analysis is rebuilt from nothing -- a changed .mailmap,
    // a changed threshold -- and the cohort rows have to go with it, or a
    // curve is drawn from revisions the new analysis knows nothing about.
    repo = await repoWithAYear()
    const db = createDatabase()
    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    clearDatabase(db)

    expect(await db.select().from(snapshots)).toHaveLength(0)
    expect(await db.select().from(cohortLines)).toHaveLength(0)
  }, 120000)

  it('sums two addresses of one person written in the same month', async () => {
    // The previous test has the two addresses committing in different months,
    // which is exactly why it passed while this did not: one person, one
    // month and one snapshot is one row, and producing two of them collides
    // on the primary key, fails the transaction, and loses the snapshot --
    // every snapshot, so the whole history comes back empty.
    repo = await createTestRepo()
    await repo.commit({
      message: 'from the office',
      author: { name: 'Gorvek the Ironbane', email: 'gorvek@firma.no' },
      date: new Date('2025-04-10T10:00:00Z'),
      write: { 'a.ts': 'one\ntwo\n' },
    })
    await repo.commit({
      message: 'from the laptop, the same month',
      author: { name: 'Gorvek Ironbane', email: 'gorvek@privat.no' },
      date: new Date('2025-04-20T10:00:00Z'),
      write: { 'b.ts': 'three\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      authorPolicy: 'loose',
    })
    await service.initialize()
    const db = service.getDatabase()

    const run = await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    expect(run.snapshots).toBe(1)
    const rows = await db
      .select({ lines: cohortLines.lineCount })
      .from(cohortLines)
    // One row for the person, holding all three lines.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lines).toBe(3)
  }, 120000)

  it('reads back through the service the interface will use', async () => {
    // The walk and the reading are written apart and tested apart. This is
    // the seam between them: rows written by one, read and turned into
    // figures by the other, over a repository where the answer is known.
    repo = await createTestRepo()
    const ten = Array.from({ length: 10 }, (_, i) => `g${i}`).join('\n')
    await repo.commit({
      message: 'ten lines in January',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': `${ten}\n` },
    })
    await repo.commit({
      message: 'every one of them replaced in April',
      author: NIGHTSHROUD,
      date: new Date('2025-04-10T10:00:00Z'),
      write: { 'a.ts': 'n0\nn1\nn2\nn3\nn4\nn5\nn6\nn7\nn8\nn9\n' },
    })
    await repo.commit({
      message: 'and one more in July',
      author: NIGHTSHROUD,
      date: new Date('2025-07-10T10:00:00Z'),
      write: {
        'a.ts': 'n0\nn1\nn2\nn3\nn4\nn5\nn6\nn7\nn8\nn9\nn10\n',
      },
    })

    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()
    const db = service.getDatabase()
    await new HistoryService(repo.path, db, {
      interval: 'month',
      thresholdBytes: THRESHOLD,
    }).analyse()

    const store = createSqliteStore(db)
    expect((await store.readMeta())[HISTORY_HEAD_KEY]).toBe(await repo.head())

    const survival = survivalByAuthor(
      await store.loadHistory(),
      (await store.loadAnalysis()).authors,
    )
    const gorvek = survival.find((one) => one.email === GORVEK.email)
    const nightshroud = survival.find((one) => one.email === NIGHTSHROUD.email)

    // Gorvek wrote ten and has none left. Nothing in the database says zero
    // -- the row simply stops -- so a half-life at all is the thing being
    // checked here.
    expect(gorvek?.linesEverWritten).toBe(10)
    expect(gorvek?.survivingLines).toBe(0)
    expect(gorvek?.survivalRate).toBe(0)
    expect(gorvek?.halfLifeDays).not.toBe(null)

    // Nightshroud's work is all still standing.
    expect(nightshroud?.survivalRate).toBe(1)
    expect(nightshroud?.halfLifeDays).toBe(null)
    expect(nightshroud?.name).toBe(NIGHTSHROUD.name)
  }, 120000)

  it('reports no survival figures when no history was gathered', async () => {
    repo = await repoWithAYear()
    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()

    const store = createSqliteStore(service.getDatabase())

    expect(
      survivalByAuthor(
        await store.loadHistory(),
        (await store.loadAnalysis()).authors,
      ),
    ).toEqual([])
    expect((await store.readMeta())[HISTORY_HEAD_KEY]).toBeUndefined()
  }, 120000)

  it('has nothing to walk in a repository with no commits', async () => {
    repo = await createTestRepo()
    const db = createDatabase()

    const run = await new HistoryService(repo.path, db, {
      thresholdBytes: THRESHOLD,
    }).analyse()

    expect(run.snapshots).toBe(0)
  }, 60000)
})
