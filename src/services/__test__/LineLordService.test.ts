import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
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
  return repo
}

describe('LineLordService - end to end over a real repository', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('normalises identities before ranking, so a merged author is ranked on their combined lines', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const contributions = await service
      .getAnalysisService()
      .getAuthorContributions()

    // Gorvek's two addresses must be one contributor holding 4 lines. Were
    // ranking to run before normalisation, he would appear twice, with 3 and 1
    // line, and Nightshroud's 2 lines would rank second rather than last.
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

    const contributions = await service
      .getAnalysisService()
      .getAuthorContributions()

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

    const analysis = service.getAnalysisService()
    const stats = await analysis.getRepositoryStats()
    const contributions = await analysis.getAuthorContributions()

    const attributed = contributions.reduce((sum, c) => sum + c.totalLines, 0)
    expect(attributed).toBe(stats.totalLines)
    expect(stats.totalAnalyzedFiles).toBe(3)
  })

  it('resolves an author through the address they no longer commit from', async () => {
    repo = await buildRepo()
    const service = new LineLordService(repo.path)
    await service.initialize()

    const analysis = service.getAnalysisService()
    const [first] = await analysis.getAuthorContributions()

    // Whichever address became canonical, both must resolve to the same person.
    const viaWork = await analysis.findCanonicalAuthorByEmail(GORVEK.email)
    const viaHome = await analysis.findCanonicalAuthorByEmail(
      GORVEK_AT_HOME.email,
    )
    expect(viaWork).toBe(first?.id ?? -1)
    expect(viaHome).toBe(first?.id ?? -1)
  })

  it('refuses to hand out services before it has been initialised', () => {
    const service = new LineLordService('/nonexistent')

    expect(service.isInitialized()).toBe(false)
    expect(() => service.getAnalysisService()).toThrow()
    expect(() => service.getRankingService()).toThrow()
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

      const service = new LineLordService(repo.path)
      await service.initialize()
      await service.changeRepository(other.path)

      const contributions = await service
        .getAnalysisService()
        .getAuthorContributions()

      // Nothing from the first repository may survive the switch.
      expect(contributions).toHaveLength(1)
      expect(contributions[0]?.displayName).toBe(NIGHTSHROUD.name)
      expect(contributions[0]?.totalLines).toBe(1)
      expect(service.getCurrentRepoPath()).toBe(other.path)
    } finally {
      await other.cleanup()
    }
  })
})
