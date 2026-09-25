import { afterEach, describe, expect, it } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import {
  authorContributions,
  findCanonicalAuthorByEmail,
  repositoryStats,
} from '../../core/ownership'
import { LineLordService } from '../LineLordService'

const GORVEK = {
  name: 'Gorvek the Ironbane',
  email: 'gorvek@ashendale.realm',
}
/** The same person, committing from a second address. */
const GORVEK_AT_HOME = {
  name: 'Gorvek the Ironbane',
  email: 'g.ironbane@ashendale.realm',
}
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'nightshroud@alderstone.realm',
}

async function buildRepo(): Promise<TestRepo> {
  const repo = await createTestRepo()
  await repo.commit({
    message: 'gorvek at work',
    author: GORVEK,
    date: new Date('2023-01-10T09:00:00Z'),
    write: { 'src/a.ts': 'const one = 1\nconst two = 2\nconst three = 3\n' },
  })
  await repo.commit({
    message: 'gorvek at home',
    author: GORVEK_AT_HOME,
    date: new Date('2023-02-10T09:00:00Z'),
    write: { 'src/b.ts': 'const four = 4\n' },
  })
  await repo.commit({
    message: 'nightshroud',
    author: NIGHTSHROUD,
    date: new Date('2023-03-10T09:00:00Z'),
    write: { 'src/c.ts': 'const five = 5\nconst six = 6\n' },
  })
  // How one person with two addresses is declared, now that identities are
  // matched by address and nothing is guessed. git blame applies this before
  // LineLord sees a line, so the merging is git's own and not an inference.
  //
  // Written after the commits and never added: the helper stages everything,
  // so a .mailmap present during a commit would become a tracked file, join
  // the analysis, and change the very counts these tests assert.
  await writeFile(
    join(repo.path, '.mailmap'),
    `${GORVEK.name} <${GORVEK.email}> <${GORVEK_AT_HOME.email}>\n`,
  )

  return repo
}

describe('LineLordService - end to end over a real repository', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('ranks a person declared in .mailmap on their combined lines', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const contributions = authorContributions(service.getAnalysis())

    // Gorvek's two addresses are one contributor holding 4 lines, because the
    // .mailmap says so. Were ranking to run before normalisation, he would
    // appear twice, with 3 and 1 line, and Nightshroud's 2 lines would rank
    // second rather than last.
    expect(contributions).toHaveLength(2)
    const [first, second] = contributions
    expect(first?.displayName).toBe(GORVEK.name)
    expect(first?.totalLines).toBe(4)
    expect(first?.rank).toBe(1)
    expect(second?.displayName).toBe(NIGHTSHROUD.name)
    expect(second?.totalLines).toBe(2)
    expect(second?.rank).toBe(2)
  })

  it('reports percentages that account for the whole codebase', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const contributions = authorContributions(service.getAnalysis())

    const total = contributions.reduce((sum, c) => sum + c.percentage, 0)
    expect(total).toBeCloseTo(100, 1)
    // 4 of 6 lines and 2 of 6 lines.
    expect(contributions[0]?.percentage).toBeCloseTo(66.67, 1)
    expect(contributions[1]?.percentage).toBeCloseTo(33.33, 1)
  })

  it('agrees with itself: repository line count matches the contributors', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const analysis = service.getAnalysis()
    const stats = repositoryStats(analysis)
    const contributions = authorContributions(analysis)

    const attributed = contributions.reduce((sum, c) => sum + c.totalLines, 0)
    expect(attributed).toBe(stats.totalLines)
    expect(stats.totalAnalyzedFiles).toBe(3)
  })

  it('knows a person by the address .mailmap gives them, and only that one', async () => {
    // Under a .mailmap the superseded address never reaches LineLord at all:
    // git rewrites it while producing the blame, so there is no second
    // identity to reconcile and nothing to look up.
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const analysis = service.getAnalysis()
    const [first] = authorContributions(analysis)

    expect(findCanonicalAuthorByEmail(analysis, GORVEK.email)).toBe(
      first?.id ?? -1,
    )
    expect(findCanonicalAuthorByEmail(analysis, GORVEK_AT_HOME.email)).toBe(
      null,
    )
  })

  it('resolves a superseded address through the alias table when guessing is on', async () => {
    // With --fuzzy-authors the old address does reach the database, is merged
    // by inference, and is recorded as an alias so it can still be looked up.
    repo = await createTestRepo()
    await repo.commit({
      message: 'under one address',
      author: GORVEK,
      write: { 'a.ts': 'const a = 1\n' },
    })
    await repo.commit({
      message: 'under another',
      author: GORVEK_AT_HOME,
      write: { 'b.ts': 'const b = 2\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      authorPolicy: 'loose',
    })
    await service.initialize()

    const analysis = service.getAnalysis()
    const [first] = authorContributions(analysis)

    expect(findCanonicalAuthorByEmail(analysis, GORVEK_AT_HOME.email)).toBe(
      first?.id ?? -1,
    )
  })

  it('refuses to hand out services before it has been initialised', () => {
    const service = new LineLordService('/nonexistent')

    expect(service.isInitialized()).toBe(false)
    expect(() => service.getAnalysis()).toThrow()
  })

  it('reports progress from start to finish', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)

    const progress: number[] = []
    await service.initialize((current) => progress.push(current))

    expect(progress.length).toBeGreaterThan(0)
    expect(progress.at(0)).toBe(0)
    expect(progress.at(-1)).toBe(100)
    // Progress must never run backwards, or the bar jumps about.
    expect([...progress].sort((a, b) => a - b)).toEqual(progress)
  })

  it('rebuilds cleanly when pointed at a second repository', async () => {
    repo = await buildRepo()
    const other = await createTestRepo()
    try {
      await other.commit({
        message: 'only nightshroud here',
        author: NIGHTSHROUD,
        write: { 'src/only.ts': 'const only = 1\n' },
      })

      // A repository gets a service of its own. There used to be a method
      // that pointed one service at a different repository, and this test
      // guarded what it must not carry across; the guard is kept because the
      // property still matters, even though it now holds by construction.
      const first = new LineLordService(repo.path)
      await first.initialize()
      const second = new LineLordService(other.path)
      await second.initialize()

      const contributions = authorContributions(second.getAnalysis())

      // Nothing from the first repository may appear in the second.
      expect(contributions).toHaveLength(1)
      expect(contributions[0]?.displayName).toBe(NIGHTSHROUD.name)
      expect(contributions[0]?.totalLines).toBe(1)
      expect(second.getCurrentRepoPath()).toBe(other.path)
    } finally {
      await other.cleanup()
    }
  })
})
