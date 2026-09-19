import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { LineLordService } from '../LineLordService'

/**
 * What LineLord says about one person committing under several addresses.
 *
 * The default merges nothing, which is right, but a run that noticed something
 * and said nothing would leave the user with two entries for one person and no
 * hint that anything was seen. These cover what is shown, under both policies
 * and whether or not the analysis came out of the cache.
 */

const SHORT = { name: 'Gorvek', email: 'gorvek@privat.no' }
const LONG = { name: 'Gorvek the Ironbane', email: 'gorvek@firma.no' }
const OTHER = { name: 'Sister Nightshroud', email: 'night@alderstone.realm' }

async function repoWithOnePersonTwice(): Promise<TestRepo> {
  const repo = await createTestRepo()
  // The short name commits first, so it is the seed of the guessing group
  // while the longer name is the one chosen to keep.
  await repo.commit({
    message: 'from the laptop',
    author: SHORT,
    write: { 'a.ts': 'a\n' },
  })
  await repo.commit({
    message: 'from the office',
    author: LONG,
    write: { 'b.ts': 'b\n' },
  })
  await repo.commit({
    message: 'somebody else entirely',
    author: OTHER,
    write: { 'c.ts': 'c\n' },
  })
  return repo
}

describe('identity guesses under the default policy', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('reports what a loose run would have merged, having merged nothing', async () => {
    // The default cannot merge, so the guesses are the only way a user learns
    // that the two entries in front of them may be one person.
    repo = await repoWithOnePersonTwice()

    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()

    const guesses = service.getIdentityMerges()

    expect(guesses).toHaveLength(1)
    expect(guesses[0]?.absorbed).toHaveLength(1)
    // Nothing was actually merged: both addresses still stand on their own.
    const authors = await service.getAnalysisService().getAllAuthors()
    expect(authors.length).toBe(3)
  })

  it('explains every guess, including the one that was the seed of the group', async () => {
    // The identity kept is the longest readable name, which need not be the
    // one the grouping started from. A generic "they were taken to be one" for
    // that case is a reason nobody can check.
    repo = await repoWithOnePersonTwice()

    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()

    for (const merge of service.getIdentityMerges()) {
      for (const absorbed of merge.absorbed) {
        expect(absorbed.reason).not.toBe('they were taken to be one')
        expect(absorbed.reason.length).toBeGreaterThan(0)
      }
    }
  })

  it('says nothing about people who share nothing', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: LONG,
      write: { 'a.ts': 'a\n' },
    })
    await repo.commit({
      message: 'two',
      author: OTHER,
      write: { 'b.ts': 'b\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()

    expect(service.getIdentityMerges()).toEqual([])
  })
})

describe('identity guesses when the analysis came out of the cache', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-guess-cache-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    delete process.env.XDG_CACHE_HOME
    await rm(cacheHome, { force: true, recursive: true })
  })

  it('still reports them, because a reused run skips the normalisation', async () => {
    // Otherwise the warning appears on the first run of the day and silently
    // disappears on every run after it -- the state it describes unchanged.
    repo = await repoWithOnePersonTwice()

    const first = new LineLordService(repo.path, 50 * 1024, { useCache: true })
    await first.initialize()
    expect(first.getIdentityMerges()).toHaveLength(1)

    const second = new LineLordService(repo.path, 50 * 1024, { useCache: true })
    await second.initialize()

    expect(second.getCacheStatus()?.mode).toBe('reused')
    expect(second.getIdentityMerges()).toHaveLength(1)
  })

  it('reports what a guessing run actually merged, reused or not', async () => {
    repo = await repoWithOnePersonTwice()

    const first = new LineLordService(repo.path, 50 * 1024, {
      useCache: true,
      authorPolicy: 'loose',
    })
    await first.initialize()
    expect(first.getIdentityMerges()).toHaveLength(1)

    const second = new LineLordService(repo.path, 50 * 1024, {
      useCache: true,
      authorPolicy: 'loose',
    })
    await second.initialize()

    expect(second.getCacheStatus()?.mode).toBe('reused')
    const merges = second.getIdentityMerges()
    expect(merges).toHaveLength(1)
    expect(merges[0]?.canonical.email).toBe(LONG.email)
    expect(merges[0]?.absorbed[0]?.email).toBe(SHORT.email)
    expect(merges[0]?.absorbed[0]?.reason.length).toBeGreaterThan(0)
  })
})
