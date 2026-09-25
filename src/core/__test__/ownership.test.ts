import { describe, expect, it } from 'bun:test'
import { EMPTY_ANALYSIS } from '../model'
import {
  authorContributions,
  canonicalAuthors,
  fileContributions,
  findCanonicalAuthorByEmail,
  repositoryStats,
} from '../ownership'
import { analysis, author, file, lines } from './fixtures'

const GORVEK = 1
const NIGHTSHROUD = 2
const GORVEK_ALIAS = 3
const GHOST = 4

/**
 * A repository with one file of each kind, so that the four file categories
 * can be told apart:
 *
 *   src/a.ts    analysed, 6 lines
 *   src/b.ts    analysed, 4 lines
 *   logo.png    binary
 *   bun.lock    ignored
 *   huge.ts     over the size threshold
 */
const seeded = analysis({
  authors: [
    author(GORVEK, {
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
      rank: 1,
      percentage: 70,
      title: 'legend',
    }),
    author(NIGHTSHROUD, {
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
      rank: 2,
      percentage: 30,
      title: 'squire',
    }),
    author(GORVEK_ALIAS, {
      name: 'gorvek',
      email: 'gorvek@old-address.realm',
      isCanonical: false,
      canonicalId: GORVEK,
    }),
    author(GHOST, {
      name: 'Ghost of Commits Past',
      email: 'ghost@ashendale.realm',
    }),
  ],
  aliases: [
    {
      canonicalAuthorId: GORVEK,
      aliasName: 'gorvek',
      aliasEmail: 'gorvek@old-address.realm',
    },
  ],
  files: [
    file(1, 'src/a.ts', { totalLines: 6 }),
    file(2, 'src/b.ts', { totalLines: 4 }),
    file(3, 'logo.png', { size: 0, isBinary: true }),
    file(4, 'bun.lock', { size: 0, isIgnored: true }),
    file(5, 'huge.ts', {
      size: 999999,
      isLargerThanThreshold: true,
      totalLines: 9999,
    }),
  ],
  lines: lines(
    { fileId: 1, authorId: GORVEK, count: 4 },
    { fileId: 1, authorId: NIGHTSHROUD, count: 2 },
    { fileId: 2, authorId: GORVEK, count: 3 },
    { fileId: 2, authorId: GORVEK_ALIAS, count: 1 },
  ),
})

describe('repositoryStats', () => {
  it('sorts every file into exactly one category', () => {
    const stats = repositoryStats(seeded)

    expect(stats.totalFiles).toBe(5)
    expect(stats.totalAnalyzedFiles).toBe(2)
    expect(stats.totalBinaryFiles).toBe(1)
    expect(stats.totalIgnoredFiles).toBe(1)
    expect(stats.totalLargeFiles).toBe(1)

    // The categories must account for every file, with nothing counted twice.
    expect(
      stats.totalAnalyzedFiles +
        stats.totalBinaryFiles +
        stats.totalIgnoredFiles +
        stats.totalLargeFiles +
        stats.totalFailedFiles,
    ).toBe(stats.totalFiles)
  })

  it('puts a binary file that is also ignored in one category only', () => {
    const both = analysis({
      files: [file(1, 'bun.lock', { isBinary: true, isIgnored: true })],
    })
    const stats = repositoryStats(both)

    expect(stats.totalBinaryFiles).toBe(1)
    expect(stats.totalIgnoredFiles).toBe(0)
  })

  it('counts lines from analysed files only, never from the ones it skipped', () => {
    // 6 + 4, with huge.ts's 9999 lines excluded.
    expect(repositoryStats(seeded).totalLines).toBe(10)
  })

  it('reports a failed file as failed rather than analysed', () => {
    const withFailure = analysis({
      files: [
        file(1, 'ok.ts', { totalLines: 3 }),
        file(2, 'broken.ts', { analysisFailed: true }),
      ],
    })
    const stats = repositoryStats(withFailure)

    expect(stats.totalAnalyzedFiles).toBe(1)
    expect(stats.totalFailedFiles).toBe(1)
    expect(stats.totalLines).toBe(3)
  })

  it('reports zeroes for an empty repository rather than null', () => {
    expect(repositoryStats(EMPTY_ANALYSIS)).toEqual({
      totalFiles: 0,
      totalAnalyzedFiles: 0,
      totalBinaryFiles: 0,
      totalIgnoredFiles: 0,
      totalLargeFiles: 0,
      totalFailedFiles: 0,
      totalLines: 0,
      totalAuthors: 0,
    })
  })

  it('counts developers the same way the contributor list does', () => {
    // Four author rows: two canonical contributors, one alias, and one
    // canonical author holding no lines. Only the two contributors may be
    // counted, or the figure contradicts the list shown beside it.
    const stats = repositoryStats(seeded)
    const contributions = authorContributions(seeded)

    expect(stats.totalAuthors).toBe(2)
    expect(stats.totalAuthors).toBe(contributions.length)
  })
})

describe('authorContributions', () => {
  it('lists canonical contributors in rank order and leaves out the idle', () => {
    const contributions = authorContributions(seeded)

    expect(contributions.map((c) => c.id)).toEqual([GORVEK, NIGHTSHROUD])
    expect(contributions.map((c) => c.rank)).toEqual([1, 2])
  })

  it('reports stored percentages and titles rather than recomputing them', () => {
    const [top] = authorContributions(seeded)

    expect(top?.percentage).toBe(70)
    expect(top?.title).toBe('legend')
  })

  it('counts lines and distinct files per contributor', () => {
    const [top, second] = authorContributions(seeded)

    // Gorvek's own rows only: 4 in a.ts and 3 in b.ts. The alias row's line is
    // attributed to the alias id, which is not canonical.
    expect(top?.totalLines).toBe(7)
    expect(top?.totalFiles).toBe(2)
    expect(second?.totalLines).toBe(2)
    expect(second?.totalFiles).toBe(1)
  })

  it('places unranked contributors last instead of first', () => {
    // A contributor with lines but no rank yet must not outrank everyone by
    // virtue of a missing number sorting low.
    const withGhostLine = analysis({
      ...seeded,
      lines: [
        ...seeded.lines,
        ...lines({ fileId: 1, authorId: GHOST, count: 1 }),
      ],
    })

    const contributions = authorContributions(withGhostLine)

    expect(contributions.at(-1)?.id).toBe(GHOST)
    expect(contributions.at(-1)?.rank).toBeNull()
  })
})

describe('fileContributions', () => {
  it("gathers an author's aliases into one set of file contributions", () => {
    const contributions = fileContributions(seeded, GORVEK)

    const byPath = new Map(contributions.map((c) => [c.path, c]))
    // b.ts holds 3 lines under the canonical id and 1 under the alias.
    expect(byPath.get('src/b.ts')?.authorLines).toBe(4)
    expect(byPath.get('src/a.ts')?.authorLines).toBe(4)
  })

  it('orders files by how much of them the author wrote, then by path', () => {
    const contributions = fileContributions(seeded, GORVEK)

    const counts = contributions.map((c) => c.authorLines)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
    // 4 and 4: the tie goes to the path that sorts first.
    expect(contributions.map((c) => c.path)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('expresses ownership as a percentage of the file, and splits off the filename', () => {
    const bFile = fileContributions(seeded, GORVEK).find(
      (c) => c.path === 'src/b.ts',
    )

    expect(bFile?.filename).toBe('b.ts')
    expect(bFile?.totalLines).toBe(4)
    expect(bFile?.percentage).toBe(100)
  })

  it('returns nothing for an author who owns no files', () => {
    expect(fileContributions(seeded, GHOST)).toEqual([])
  })
})

describe('author lookup', () => {
  it('lists canonical authors alphabetically with their aliases', () => {
    const all = canonicalAuthors(seeded)

    expect(all.map((a) => a.displayName)).toEqual([
      'Ghost of Commits Past',
      'Gorvek the Ironbane',
      'Sister Nightshroud',
    ])
    expect(all.find((a) => a.id === GORVEK)?.aliases).toEqual(['gorvek'])
    expect(all.find((a) => a.id === NIGHTSHROUD)?.aliases).toEqual([])
  })

  it('resolves a canonical address to its author', () => {
    expect(findCanonicalAuthorByEmail(seeded, 'gorvek@ashendale.realm')).toBe(
      GORVEK,
    )
  })

  it('resolves an old address through the aliases', () => {
    expect(findCanonicalAuthorByEmail(seeded, 'gorvek@old-address.realm')).toBe(
      GORVEK,
    )
  })

  it('returns null for an address nobody has used', () => {
    expect(findCanonicalAuthorByEmail(seeded, 'nobody@nowhere.com')).toBeNull()
  })
})
