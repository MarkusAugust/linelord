import { describe, expect, it } from 'bun:test'
import { HONESTY_NOTES } from '../honestyNotes'
import {
  buildReport,
  REPORT_SCHEMA_VERSION,
  type ReportOptions,
} from '../report'
import { analysis, author, file, lines } from './fixtures'

const NOW = new Date('2026-09-30T12:00:00Z')

const secondsAt = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

function sampleAnalysis() {
  return analysis({
    authors: [
      // percentage, title and rank are stored on the author record by the
      // analysis, not recomputed when the report is assembled, so the fixture
      // carries them the way the database would.
      author(1, {
        name: 'Gorvek of Bonereach',
        email: 'gorvek@bonereach.realm',
        percentage: 60,
        rank: 1,
        title: 'legend',
      }),
      author(2, {
        name: 'Sarn the Faceless',
        email: 'sarn@kell.realm',
        percentage: 40,
        rank: 2,
        title: 'vanquisher',
      }),
      // Holds no line in HEAD. Only the history remembers him.
      author(3, { name: 'Brother Nask', email: 'nask@thurn.realm' }),
    ],
    files: [
      file(1, 'src/ledger.ts', { size: 6000, totalLines: 6 }),
      file(2, 'src/river.py', { size: 300, totalLines: 4 }),
      file(3, 'bun.lock', { size: 200, isIgnored: true }),
      file(4, 'assets/sigil.png', { size: 900, isBinary: true }),
    ],
    lines: [
      ...lines({
        fileId: 1,
        authorId: 1,
        timestamps: Array.from({ length: 6 }, () =>
          secondsAt('2023-01-15T00:00:00Z'),
        ),
      }),
      ...lines({
        fileId: 2,
        authorId: 2,
        timestamps: Array.from({ length: 4 }, () =>
          secondsAt('2026-08-20T00:00:00Z'),
        ),
      }),
    ],
  })
}

const context = {
  headSha: 'ac43e98f1b2c3d4e5f60718293a4b5c6d7e8f901',
  uncommittedFileCount: 2,
  ignoredRevisionCount: 1,
  ignoreRevSources: { file: true, flag: false },
  unresolvedIgnoreRevs: [],
}

const options: ReportOptions = {
  now: NOW,
  version: '0.12.4',
  repoPath: '/tmp/tithe-rolls',
  context,
  identityMerges: [],
}

describe('buildReport', () => {
  it('declares a schema version, so a caller can tell what it is reading', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    expect(report.linelord).toBe('0.12.4')
    expect(report.generatedAt).toBe(NOW.toISOString())
  })

  it('says which revision the numbers describe, and what they leave out', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.repository.path).toBe('/tmp/tithe-rolls')
    expect(report.repository.headSha).toBe(context.headSha)
    expect(report.repository.uncommittedFileCount).toBe(2)
    expect(report.repository.ignoredRevisionCount).toBe(1)
    expect(report.repository.ignoreRevSources).toEqual({
      file: true,
      flag: false,
    })
    expect(report.repository.unresolvedIgnoreRevs).toEqual([])
  })

  it('counts the files it set aside, each in exactly one category', () => {
    const { files } = buildReport(sampleAnalysis(), options)

    expect(files.total).toBe(4)
    expect(files.analysed).toBe(2)
    expect(files.ignored).toBe(1)
    expect(files.binary).toBe(1)
    expect(
      files.analysed +
        files.ignored +
        files.binary +
        files.large +
        files.failed,
    ).toBe(files.total)
    expect(files.totalLines).toBe(10)
  })

  it('reports every contributor with their share and their title', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.contributors.map((one) => one.email)).toEqual([
      'gorvek@bonereach.realm',
      'sarn@kell.realm',
    ])
    const [first] = report.contributors
    expect(first?.totalLines).toBe(6)
    expect(first?.percentage).toBeCloseTo(60, 5)
    expect(first?.title).not.toBeNull()
  })

  it('carries the barbarian rankings and the longevity figures', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.rankings.length).toBe(2)
    expect(report.rankings[0]?.metrics.survivingLines).toBeGreaterThan(0)

    expect(report.longevity.repository.survivingLines).toBe(10)
    expect(report.longevity.authors.length).toBe(2)
  })

  it('measures ages against the date it is given, not the clock', () => {
    const early = buildReport(sampleAnalysis(), options)
    const later = buildReport(sampleAnalysis(), {
      ...options,
      now: new Date('2027-09-30T12:00:00Z'),
    })

    expect(early.longevity.repository.medianAgeDays).not.toBeNull()
    expect(later.longevity.repository.medianAgeDays ?? 0).toBeGreaterThan(
      early.longevity.repository.medianAgeDays ?? 0,
    )
  })

  it('says what the numbers are not, in the same words as the screens', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.disclaimer).toEqual(HONESTY_NOTES.rankings.lines)
  })

  it('reports no history when none was walked, rather than an empty curve', () => {
    const report = buildReport(sampleAnalysis(), options)

    expect(report.history).toBeNull()
  })

  it('carries the survival figures when the history was walked', () => {
    const cohortMonth = secondsAt('2023-01-01T00:00:00Z')
    const report = buildReport(sampleAnalysis(), {
      ...options,
      history: {
        describes: context.headSha,
        history: {
          snapshots: [
            {
              id: 1,
              commitSha: 'aaa',
              snapshotTimestamp: secondsAt('2023-02-01T00:00:00Z'),
              totalLines: 6,
            },
            {
              id: 2,
              commitSha: 'bbb',
              snapshotTimestamp: secondsAt('2023-08-01T00:00:00Z'),
              totalLines: 3,
            },
          ],
          cohortLines: [
            { snapshotId: 1, authorId: 1, cohortMonth, lineCount: 6 },
            { snapshotId: 2, authorId: 1, cohortMonth, lineCount: 3 },
          ],
        },
      },
    })

    expect(report.history).not.toBeNull()
    expect(report.history?.describes).toBe(context.headSha)
    expect(report.history?.snapshotCount).toBe(2)
    expect(report.history?.authors[0]?.linesEverWritten).toBe(6)
  })

  it('gives a row to a contributor the history remembers and HEAD does not', () => {
    const cohortMonth = secondsAt('2023-01-01T00:00:00Z')
    const report = buildReport(sampleAnalysis(), {
      ...options,
      history: {
        describes: context.headSha,
        history: {
          snapshots: [
            {
              id: 1,
              commitSha: 'aaa',
              snapshotTimestamp: secondsAt('2023-02-01T00:00:00Z'),
              totalLines: 9,
            },
            {
              id: 2,
              commitSha: 'bbb',
              snapshotTimestamp: secondsAt('2023-08-01T00:00:00Z'),
              totalLines: 6,
            },
          ],
          // Author 3 holds nothing in HEAD, so ageOfAuthors has no row for
          // them at all -- and they are exactly who the history is for.
          cohortLines: [
            { snapshotId: 1, authorId: 1, cohortMonth, lineCount: 6 },
            { snapshotId: 2, authorId: 1, cohortMonth, lineCount: 6 },
            { snapshotId: 1, authorId: 3, cohortMonth, lineCount: 3 },
          ],
        },
      },
    })

    const forgotten = report.longevity.authors.find(
      (one) => one.survivingLines === 0,
    )
    expect(forgotten).toBeDefined()
    expect(forgotten?.authorId).toBe(3)

    // Null, not NaN: NaN is not JSON, and "no surviving code to be old" is a
    // real state rather than a missing number.
    expect(forgotten?.medianAgeDays).toBeNull()
    expect(forgotten?.p90AgeDays).toBeNull()

    const roundTripped = JSON.parse(JSON.stringify(report))
    expect(roundTripped).toEqual(report)
  })

  it('reports no history when the walk recorded no revisions at all', () => {
    const report = buildReport(sampleAnalysis(), {
      ...options,
      history: { describes: null, history: { snapshots: [], cohortLines: [] } },
    })

    expect(report.history).toBeNull()
  })

  it('reports the identity candidates it did not merge', () => {
    const report = buildReport(sampleAnalysis(), {
      ...options,
      identityMerges: [
        {
          canonical: {
            name: 'Gorvek of Bonereach',
            email: 'gorvek@bonereach.realm',
          },
          absorbed: [
            {
              name: 'Gorvek of Bonereach',
              email: 'gorvek@kell.realm',
              reason: 'the same name',
            },
          ],
        },
      ],
    })

    expect(report.identityCandidates.length).toBe(1)
    expect(report.identityCandidates[0]?.absorbed[0]?.email).toBe(
      'gorvek@kell.realm',
    )
  })

  it('serialises to JSON without losing anything', () => {
    const report = buildReport(sampleAnalysis(), options)
    const roundTripped = JSON.parse(JSON.stringify(report))

    expect(roundTripped).toEqual(report)
  })
})
