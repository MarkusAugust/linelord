import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { lineLord } from '../../__test__/helpers/lineLord'
import { findRepositoryRoot } from '../../adapters/git/spawnGit'
import { resolveCachePath } from '../../adapters/sqlite/cacheLocation'
import { acquireCacheLock } from '../../adapters/sqlite/cacheMaintenance'

/**
 * Walking the history through the service the interface uses.
 *
 * The walk itself is tested against git elsewhere. What is under test here is
 * the seam: that it happens only when asked, and that it happens under the
 * same settings the present was read with.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const MONTHLY = { interval: 'month' as const, maxSnapshots: 60 }

describe('gatherHistory', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  async function repoWithABigFile() {
    const created = await createTestRepo()
    await created.commit({
      message: 'one small file and one large one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: {
        'small.ts': 'a\nb\nc\n',
        'large.ts': `${'x\n'.repeat(4000)}`,
      },
    })
    return created
  }

  it('does nothing at all unless it was asked', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'a\n' } })

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    expect(service.wantsHistory()).toBe(false)
    expect(await service.gatherHistory()).toBe(null)
    expect((await service.getStore().loadHistory()).snapshots).toEqual([])
  }, 60000)

  it('walks it when asked, and says so', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'a\nb\n' },
    })

    const service = lineLord(repo.path, 50 * 1024, {
      history: MONTHLY,
    })
    await service.initialize()
    const run = await service.gatherHistory()

    expect(service.wantsHistory()).toBe(true)
    expect(run?.snapshots).toBe(1)
    expect(service.getHistory().describes).toBe(await repo.head())
  }, 60000)

  it('reads the past under the threshold the present was read with', async () => {
    // The point of the service owning this rather than the caller. A history
    // measured under different rules than the analysis it is drawn beside
    // would be two answers to two questions, presented as one.
    repo = await repoWithABigFile()

    const generous = lineLord(repo.path, 50 * 1024, {
      history: MONTHLY,
    })
    await generous.initialize()
    await generous.gatherHistory()

    const strict = lineLord(repo.path, 1024, { history: MONTHLY })
    await strict.initialize()
    await strict.gatherHistory()

    const [withBigFile] = (await generous.getStore().loadHistory()).snapshots
    const [withoutBigFile] = (await strict.getStore().loadHistory()).snapshots

    // The large file is 8,000 bytes: inside the generous threshold and
    // outside the strict one, so the two histories cannot agree.
    expect(withBigFile?.totalLines).toBe(4003)
    expect(withoutBigFile?.totalLines).toBe(3)
  }, 60000)

  it('will not walk while another LineLord holds the stored analysis', async () => {
    // initialize lets the lock go as soon as it has finished writing, so that
    // somebody browsing menus does not keep everyone else out. The walk
    // writes too -- it empties the snapshot tables and fills them again -- so
    // two of them in one database would leave a set of snapshots describing
    // neither run.
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'a\n' },
    })

    const cacheHome = await mkdtemp(join(tmpdir(), 'linelord-history-lock-'))
    process.env.XDG_CACHE_HOME = cacheHome
    try {
      const service = lineLord(repo.path, 50 * 1024, {
        useCache: true,
        history: MONTHLY,
      })
      await service.initialize()

      // Somebody else takes it between the analysis and the walk. Through the
      // resolved root, which is what the service locks: on macOS a temporary
      // directory is reached as /var and resolves to /private/var, and two
      // spellings of one repository would be two different lock files.
      const lookup = await findRepositoryRoot(repo.path)
      const held = acquireCacheLock(
        resolveCachePath(lookup.found ? lookup.root : repo.path),
      )
      expect(held).not.toBe(null)

      await expect(service.gatherHistory()).rejects.toThrow()
      expect((await service.getStore().loadHistory()).snapshots).toEqual([])

      held?.release()
      // And once it is free, the walk goes ahead.
      await service.gatherHistory()
      expect((await service.getStore().loadHistory()).snapshots).toHaveLength(1)
    } finally {
      delete process.env.XDG_CACHE_HOME
      await rm(cacheHome, { force: true, recursive: true })
    }
  }, 60000)

  it('reports the progress of a walk that can take minutes', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'a\n' },
    })

    const service = lineLord(repo.path, 50 * 1024, {
      history: MONTHLY,
    })
    await service.initialize()

    const seen: string[] = []
    await service.gatherHistory((_current, _total, message) => {
      seen.push(message)
    })

    expect(seen.length).toBeGreaterThan(0)
  }, 60000)
})
