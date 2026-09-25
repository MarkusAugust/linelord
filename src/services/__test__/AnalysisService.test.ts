import { beforeEach, describe, expect, it } from 'bun:test'
import { createDatabase } from '../../adapters/sqlite/database'
import {
  authorAliases,
  authors,
  blameLines,
  files,
} from '../../adapters/sqlite/schema'
import { AnalysisService } from '../AnalysisService'

type Db = ReturnType<typeof createDatabase>

const GORVEK = 1
const NIGHTSHROUD = 2
const GORVEK_ALIAS = 3
const GHOST = 4

/**
 * A repository with one file of each kind, so that the four file categories in
 * getRepositoryStats can be told apart:
 *
 *   src/a.ts    analysed, 6 lines
 *   src/b.ts    analysed, 4 lines
 *   logo.png    binary
 *   bun.lock    ignored
 *   huge.ts     over the size threshold
 */
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
      percentage: 70,
      title: 'legend',
    },
    {
      id: NIGHTSHROUD,
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
      displayName: 'Sister Nightshroud',
      isCanonical: true,
      canonicalId: NIGHTSHROUD,
      rank: 2,
      percentage: 30,
      title: 'squire',
    },
    {
      id: GORVEK_ALIAS,
      name: 'gorvek',
      email: 'gorvek@old-address.realm',
      displayName: 'gorvek',
      isCanonical: false,
      canonicalId: GORVEK,
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

  await db.insert(authorAliases).values([
    {
      canonicalAuthorId: GORVEK,
      aliasName: 'gorvek',
      aliasEmail: 'gorvek@old-address.realm',
    },
  ])

  await db.insert(files).values([
    { id: 1, path: 'src/a.ts', extension: '.ts', size: 100, totalLines: 6 },
    { id: 2, path: 'src/b.ts', extension: '.ts', size: 100, totalLines: 4 },
    {
      id: 3,
      path: 'logo.png',
      extension: '.png',
      size: 0,
      isBinary: true,
      totalLines: 0,
    },
    {
      id: 4,
      path: 'bun.lock',
      extension: '.lock',
      size: 0,
      isIgnored: true,
      totalLines: 0,
    },
    {
      id: 5,
      path: 'huge.ts',
      extension: '.ts',
      size: 999999,
      isLargerThanThreshold: true,
      totalLines: 9999,
    },
  ])

  const lines: Array<{ fileId: number; authorId: number; lineNumber: number }> =
    []
  const add = (fileId: number, authorId: number, count: number) => {
    for (let i = 0; i < count; i++) {
      lines.push({ fileId, authorId, lineNumber: lines.length + 1 })
    }
  }
  add(1, GORVEK, 4)
  add(1, NIGHTSHROUD, 2)
  add(2, GORVEK, 3)
  add(2, GORVEK_ALIAS, 1)

  await db.insert(blameLines).values(lines)
}

describe('AnalysisService - repository statistics', () => {
  let db: Db
  let service: AnalysisService

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
    service = new AnalysisService(db)
  })

  it('sorts every file into exactly one category', async () => {
    const stats = await service.getRepositoryStats()

    expect(stats.totalFiles).toBe(5)
    expect(stats.totalAnalyzedFiles).toBe(2)
    expect(stats.totalBinaryFiles).toBe(1)
    expect(stats.totalIgnoredFiles).toBe(1)
    expect(stats.totalLargeFiles).toBe(1)

    // The categories must account for every file, with nothing counted twice:
    // that is the whole point of the exclusions in the queries.
    expect(
      stats.totalAnalyzedFiles +
        stats.totalBinaryFiles +
        stats.totalIgnoredFiles +
        stats.totalLargeFiles +
        stats.totalFailedFiles,
    ).toBe(stats.totalFiles)
  })

  it('counts lines from analysed files only, never from the ones it skipped', async () => {
    const stats = await service.getRepositoryStats()

    // 6 + 4, with huge.ts's 9999 lines excluded.
    expect(stats.totalLines).toBe(10)
  })

  it('reports zeroes for an empty repository rather than null', async () => {
    const stats = await new AnalysisService(
      createDatabase(),
    ).getRepositoryStats()

    expect(stats).toEqual({
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

  it('counts developers the same way the contributor list does', async () => {
    // Four author rows are seeded: two canonical contributors, one alias, and
    // one canonical author holding no lines. Only the two contributors may be
    // counted, or the figure contradicts the list shown beside it.
    const stats = await service.getRepositoryStats()
    const contributions = await service.getAuthorContributions()

    expect(stats.totalAuthors).toBe(2)
    expect(stats.totalAuthors).toBe(contributions.length)
  })
})

describe('AnalysisService - author contributions', () => {
  let db: Db
  let service: AnalysisService

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
    service = new AnalysisService(db)
  })

  it('lists canonical contributors in rank order and leaves out the idle', async () => {
    const contributions = await service.getAuthorContributions()

    expect(contributions.map((c) => c.id)).toEqual([GORVEK, NIGHTSHROUD])
    expect(contributions.map((c) => c.rank)).toEqual([1, 2])
  })

  it('reports stored percentages and titles rather than recomputing them', async () => {
    const [top] = await service.getAuthorContributions()

    expect(top?.percentage).toBe(70)
    expect(top?.title).toBe('legend')
  })

  it('counts lines and distinct files per contributor', async () => {
    const [top, second] = await service.getAuthorContributions()

    // Gorvek's own rows only: 4 in a.ts and 3 in b.ts. The alias row's line is
    // attributed to the alias id, which is not canonical.
    expect(top?.totalLines).toBe(7)
    expect(top?.totalFiles).toBe(2)
    expect(second?.totalLines).toBe(2)
    expect(second?.totalFiles).toBe(1)
  })

  it('places unranked contributors last instead of first', async () => {
    // A contributor with lines but no rank yet must not outrank everyone by
    // virtue of NULL sorting low.
    await db.insert(blameLines).values({
      fileId: 1,
      authorId: GHOST,
      lineNumber: 500,
    })

    const contributions = await service.getAuthorContributions()

    expect(contributions.at(-1)?.id).toBe(GHOST)
    expect(contributions.at(-1)?.rank).toBeNull()
  })
})

describe('AnalysisService - per-file contributions', () => {
  let db: Db
  let service: AnalysisService

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
    service = new AnalysisService(db)
  })

  it("gathers an author's aliases into one set of file contributions", async () => {
    const contributions = await service.getAuthorFileContributions(GORVEK)

    const byPath = new Map(contributions.map((c) => [c.path, c]))
    // b.ts holds 3 lines under the canonical id and 1 under the alias.
    expect(byPath.get('src/b.ts')?.authorLines).toBe(4)
    expect(byPath.get('src/a.ts')?.authorLines).toBe(4)
  })

  it('orders files by how much of them the author wrote', async () => {
    const contributions = await service.getAuthorFileContributions(GORVEK)

    const counts = contributions.map((c) => c.authorLines)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('expresses ownership as a percentage of the file, and splits off the filename', async () => {
    const contributions = await service.getAuthorFileContributions(GORVEK)
    const bFile = contributions.find((c) => c.path === 'src/b.ts')

    expect(bFile?.filename).toBe('b.ts')
    expect(bFile?.totalLines).toBe(4)
    expect(bFile?.percentage).toBe(100)
  })

  it('returns nothing for an author who owns no files', async () => {
    expect(await service.getAuthorFileContributions(GHOST)).toEqual([])
  })
})

describe('AnalysisService - author lookup', () => {
  let db: Db
  let service: AnalysisService

  beforeEach(async () => {
    db = createDatabase()
    await seed(db)
    service = new AnalysisService(db)
  })

  it('lists canonical authors alphabetically with their aliases', async () => {
    const all = await service.getAllAuthors()

    expect(all.map((a) => a.displayName)).toEqual([
      'Ghost of Commits Past',
      'Gorvek the Ironbane',
      'Sister Nightshroud',
    ])
    expect(all.find((a) => a.id === GORVEK)?.aliases).toEqual(['gorvek'])
    expect(all.find((a) => a.id === NIGHTSHROUD)?.aliases).toEqual([])
  })

  it('resolves a canonical address to its author', async () => {
    expect(
      await service.findCanonicalAuthorByEmail('gorvek@ashendale.realm'),
    ).toBe(GORVEK)
  })

  it('resolves an old address through the alias table', async () => {
    expect(
      await service.findCanonicalAuthorByEmail('gorvek@old-address.realm'),
    ).toBe(GORVEK)
  })

  it('returns null for an address nobody has used', async () => {
    expect(await service.findCanonicalAuthorByEmail('nobody@nowhere.com')).toBe(
      null,
    )
  })
})
