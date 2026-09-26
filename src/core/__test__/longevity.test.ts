import { describe, expect, it } from 'bun:test'
import {
  ageOfAuthors,
  ageOfRepository,
  filesByAge,
  survivalByAuthor,
} from '../longevity'
import type { AnalysisData, BlameLineRecord } from '../model'
import { analysis, author, file, lines } from './fixtures'

/**
 * How old the code somebody still owns is.
 *
 * Built by hand rather than out of a git repository, because what is under
 * test is the arithmetic: a median that is actually the middle, percentiles
 * that fall where they should, and buckets whose edges are where they claim
 * to be. `now` is a parameter for the same reason.
 */

const NOW = new Date('2026-09-20T00:00:00Z')
const DAY = 24 * 60 * 60
const nowSeconds = Math.floor(NOW.getTime() / 1000)
/** A commit timestamp this many days before `NOW`. */
const daysAgo = (days: number) => Math.round(nowSeconds - days * DAY)

const GORVEK = 1
const SARN = 2
const GHOST = 3

const AUTHORS = [
  author(GORVEK, {
    name: 'Gorvek of Bonereach',
    email: 'gorvek@bonereach.realm',
  }),
  author(SARN, {
    name: 'Sarn the Faceless',
    email: 'sarn@kell.realm',
  }),
  author(GHOST, {
    name: 'Ghost of Commits Past',
    email: 'ghost@bonereach.realm',
  }),
]
const FILES = [file(1, 'src/old.ts'), file(2, 'src/new.ts')]

/** Give authors one line per age in each list, in the order given. */
function repo(
  ...groups: Array<{ authorId: number; ages: number[]; fileId?: number }>
): AnalysisData {
  const held: BlameLineRecord[] = lines(
    ...groups.map((group) => ({
      fileId: group.fileId ?? 1,
      authorId: group.authorId,
      timestamps: group.ages.map(daysAgo),
    })),
  )
  return analysis({ authors: AUTHORS, files: FILES, lines: held })
}

describe('ageOfAuthors', () => {
  it('reports the middle of the ages, not the average of them', () => {
    // One very old line drags a mean a long way and a median not at all,
    // which is the whole reason median is the primary key.
    const [gorvek] = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [1, 2, 3, 4, 3650] }),
      NOW,
    )

    expect(gorvek?.medianAgeDays).toBe(3)
    expect(gorvek?.meanAgeDays).toBeCloseTo((1 + 2 + 3 + 4 + 3650) / 5, 5)
  })

  it('spreads the ages with the tenth and ninetieth percentiles', () => {
    const ages = Array.from({ length: 10 }, (_, index) => (index + 1) * 10)
    const [gorvek] = ageOfAuthors(repo({ authorId: GORVEK, ages }), NOW)

    expect(gorvek?.p10AgeDays).toBe(10)
    expect(gorvek?.p90AgeDays).toBe(90)
  })

  it('takes the younger of two middles for an even count', () => {
    const [gorvek] = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [1, 2, 3, 4] }),
      NOW,
    )

    expect(gorvek?.medianAgeDays).toBe(2)
  })

  it('counts only the lines that are still there', () => {
    const result = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [5, 10] }, { authorId: SARN, ages: [5] }),
      NOW,
    )

    expect(result.find((one) => one.authorId === GORVEK)?.survivingLines).toBe(
      2,
    )
    // A canonical author with nothing left is not a row with zeroes; they
    // are simply not in the answer.
    expect(result.map((one) => one.authorId)).not.toContain(GHOST)
  })

  it('names the oldest and newest line it can still point at', () => {
    const [gorvek] = ageOfAuthors(
      repo(
        { authorId: GORVEK, ages: [400], fileId: 1 },
        { authorId: GORVEK, ages: [2], fileId: 2 },
      ),
      NOW,
    )

    expect(gorvek?.oldestLine?.path).toBe('src/old.ts')
    expect(gorvek?.newestLine?.path).toBe('src/new.ts')
    expect(gorvek?.oldestLine?.lineNumber).toBe(1)
    // The age travels with the line, so nothing on screen has to work it out
    // against a clock of its own.
    expect(gorvek?.oldestLine?.ageDays).toBe(400)
    expect(gorvek?.newestLine?.ageDays).toBe(2)
  })

  it('breaks a tie on time by the line stored first being the older', () => {
    // Two lines with the same timestamp: the oldest is the one with the
    // lower id, the newest the one with the higher, so the answer is the
    // same on every run.
    const [gorvek] = ageOfAuthors(
      repo(
        { authorId: GORVEK, ages: [100], fileId: 1 },
        { authorId: GORVEK, ages: [100], fileId: 2 },
      ),
      NOW,
    )

    expect(gorvek?.oldestLine?.path).toBe('src/old.ts')
    expect(gorvek?.newestLine?.path).toBe('src/new.ts')
  })

  it('measures how far apart the oldest and newest are', () => {
    const [gorvek] = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [400, 2] }),
      NOW,
    )

    expect(gorvek?.activeSpanDays).toBe(398)
  })

  it('puts each line in the bucket its age belongs to', () => {
    // One on each side of every edge, so an edge that moved would show.
    const [gorvek] = ageOfAuthors(
      repo({
        authorId: GORVEK,
        ages: [
          3, // under a week
          20, // a week to a month
          60, // one to three months
          200, // three to twelve months
          500, // one to two years
          900, // over two years
        ],
      }),
      NOW,
    )

    expect(gorvek?.ageHistogram).toEqual({
      underAWeek: 1,
      weekToMonth: 1,
      oneToThreeMonths: 1,
      threeToTwelveMonths: 1,
      oneToTwoYears: 1,
      overTwoYears: 1,
    })
  })

  it('puts an age that lands exactly on an edge in the older bucket', () => {
    // A line exactly seven days old is not "under a week".
    const [gorvek] = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [7, 30, 90, 365, 730] }),
      NOW,
    )

    expect(gorvek?.ageHistogram).toEqual({
      underAWeek: 0,
      weekToMonth: 1,
      oneToThreeMonths: 1,
      threeToTwelveMonths: 1,
      oneToTwoYears: 1,
      overTwoYears: 1,
    })
  })

  it('keeps an age just inside an edge in the younger bucket', () => {
    const [gorvek] = ageOfAuthors(
      repo({ authorId: GORVEK, ages: [6.9, 29.9] }),
      NOW,
    )

    expect(gorvek?.ageHistogram.underAWeek).toBe(1)
    expect(gorvek?.ageHistogram.weekToMonth).toBe(1)
  })

  it('sorts the oldest code first, which is the question being asked', () => {
    const result = ageOfAuthors(
      repo(
        { authorId: SARN, ages: [1, 1, 1] },
        { authorId: GORVEK, ages: [1000, 1000, 1000] },
      ),
      NOW,
    )

    expect(result.map((one) => one.authorId)).toEqual([GORVEK, SARN])
  })

  it('carries the name and address, so the interface need not ask again', () => {
    const [gorvek] = ageOfAuthors(repo({ authorId: GORVEK, ages: [5] }), NOW)

    expect(gorvek?.name).toBe('Gorvek of Bonereach')
    expect(gorvek?.email).toBe('gorvek@bonereach.realm')
  })

  it('leaves out a line whose commit time was never recorded', () => {
    const data = analysis({
      authors: AUTHORS,
      files: FILES,
      lines: lines({
        fileId: 1,
        authorId: GORVEK,
        timestamps: [null, daysAgo(10)],
      }),
    })

    const [gorvek] = ageOfAuthors(data, NOW)

    expect(gorvek?.survivingLines).toBe(1)
  })

  it('has nothing to say about an empty repository', () => {
    expect(ageOfAuthors(repo(), NOW)).toEqual([])
  })
})

describe('filesByAge', () => {
  it('names the files where an author holds the oldest code', () => {
    // Equal ages within each file, so this test is about which file ranks
    // first and not about which of two middles a median picks.
    const files = filesByAge(
      repo(
        { authorId: GORVEK, ages: [900, 900], fileId: 1 },
        { authorId: GORVEK, ages: [3, 3], fileId: 2 },
      ),
      GORVEK,
      NOW,
    )

    expect(files.map((one) => one.path)).toEqual(['src/old.ts', 'src/new.ts'])
    expect(files[0]?.lines).toBe(2)
    expect(files[0]?.medianAgeDays).toBe(900)
  })

  it("counts only that author's lines in each file", () => {
    const files = filesByAge(
      repo(
        { authorId: GORVEK, ages: [500], fileId: 1 },
        { authorId: SARN, ages: [500, 500, 500], fileId: 1 },
      ),
      GORVEK,
      NOW,
    )

    expect(files[0]?.lines).toBe(1)
  })

  it('keeps the list short enough to read', () => {
    const files = filesByAge(
      repo(
        { authorId: GORVEK, ages: [1, 2], fileId: 1 },
        { authorId: GORVEK, ages: [3, 4], fileId: 2 },
      ),
      GORVEK,
      NOW,
      1,
    )

    expect(files).toHaveLength(1)
  })

  it('has nothing to show for an author who owns nothing', () => {
    expect(filesByAge(repo(), GHOST, NOW)).toEqual([])
  })
})

describe('ageOfRepository', () => {
  it('reports the middle age of everything still standing', () => {
    const repository = ageOfRepository(
      repo(
        { authorId: GORVEK, ages: [1, 2, 3] },
        { authorId: SARN, ages: [100, 200] },
      ),
      NOW,
    )

    expect(repository.survivingLines).toBe(5)
    expect(repository.medianAgeDays).toBe(3)
  })

  it('says how much of the codebase was written in the last ninety days', () => {
    const repository = ageOfRepository(
      repo(
        { authorId: GORVEK, ages: [10, 20, 30] },
        { authorId: SARN, ages: [100] },
      ),
      NOW,
    )

    expect(repository.writtenInLast90Days).toBeCloseTo(0.75, 5)
  })

  it('points at the oldest line anyone still owns', () => {
    const repository = ageOfRepository(
      repo(
        { authorId: GORVEK, ages: [400], fileId: 1 },
        { authorId: SARN, ages: [2], fileId: 2 },
      ),
      NOW,
    )

    expect(repository.oldestLine?.path).toBe('src/old.ts')
    expect(repository.oldestLine?.ageDays).toBe(400)
  })

  it('takes the middle the same way the per-author figures do', () => {
    // With an even number of lines there are two middles and a choice to be
    // made. A repository with one contributor must report the same median
    // as that contributor for the same lines.
    const data = repo({ authorId: GORVEK, ages: [1, 2, 3, 4] })

    const [gorvek] = ageOfAuthors(data, NOW)
    const repository = ageOfRepository(data, NOW)

    expect(repository.medianAgeDays).toBe(gorvek?.medianAgeDays ?? -1)
  })

  it('answers an empty repository without inventing numbers', () => {
    const repository = ageOfRepository(repo(), NOW)

    expect(repository.survivingLines).toBe(0)
    expect(repository.medianAgeDays).toBe(null)
    expect(repository.oldestLine).toBe(null)
    expect(repository.writtenInLast90Days).toBe(0)
  })
})

describe('survivalByAuthor', () => {
  it('has nothing to say when no history was walked', () => {
    expect(
      survivalByAuthor({ snapshots: [], cohortLines: [] }, AUTHORS),
    ).toEqual([])
  })

  it('reads the cohorts against their snapshots and names the person', () => {
    const history = {
      snapshots: [
        {
          id: 1,
          commitSha: 'a'.repeat(40),
          snapshotTimestamp: daysAgo(60),
          totalLines: 10,
        },
        {
          id: 2,
          commitSha: 'b'.repeat(40),
          snapshotTimestamp: daysAgo(30),
          totalLines: 4,
        },
      ],
      cohortLines: [
        {
          snapshotId: 1,
          authorId: GORVEK,
          cohortMonth: daysAgo(90),
          lineCount: 10,
        },
        {
          snapshotId: 2,
          authorId: GORVEK,
          cohortMonth: daysAgo(90),
          lineCount: 4,
        },
      ],
    }

    const [gorvek] = survivalByAuthor(history, AUTHORS)

    expect(gorvek?.authorId).toBe(GORVEK)
    expect(gorvek?.name).toBe('Gorvek of Bonereach')
    expect(gorvek?.email).toBe('gorvek@bonereach.realm')
    expect(gorvek?.linesEverWritten).toBe(10)
    expect(gorvek?.survivingLines).toBe(4)
    expect(gorvek?.survivalRate).toBeCloseTo(0.4, 5)
  })
})
