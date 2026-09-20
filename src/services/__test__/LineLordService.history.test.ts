import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { snapshots } from '../../db/schema'
import { LineLordService } from '../LineLordService'
import { LongevityService } from '../LongevityService'

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

    const service = new LineLordService(repo.path, 50 * 1024)
    await service.initialize()

    expect(service.wantsHistory()).toBe(false)
    expect(await service.gatherHistory()).toBe(null)
    expect(await service.getDatabase().select().from(snapshots)).toEqual([])
  }, 60000)

  it('walks it when asked, and says so', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'a\nb\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      history: MONTHLY,
    })
    await service.initialize()
    const run = await service.gatherHistory()

    expect(service.wantsHistory()).toBe(true)
    expect(run?.snapshots).toBe(1)
    expect(new LongevityService(service.getDatabase()).historyDescribes()).toBe(
      await repo.head(),
    )
  }, 60000)

  it('reads the past under the threshold the present was read with', async () => {
    // The point of the service owning this rather than the caller. A history
    // measured under different rules than the analysis it is drawn beside
    // would be two answers to two questions, presented as one.
    repo = await repoWithABigFile()

    const generous = new LineLordService(repo.path, 50 * 1024, {
      history: MONTHLY,
    })
    await generous.initialize()
    await generous.gatherHistory()

    const strict = new LineLordService(repo.path, 1024, { history: MONTHLY })
    await strict.initialize()
    await strict.gatherHistory()

    const [withBigFile] = await generous.getDatabase().select().from(snapshots)
    const [withoutBigFile] = await strict.getDatabase().select().from(snapshots)

    // The large file is 8,000 bytes: inside the generous threshold and
    // outside the strict one, so the two histories cannot agree.
    expect(withBigFile?.totalLines).toBe(4003)
    expect(withoutBigFile?.totalLines).toBe(3)
  }, 60000)

  it('reports the progress of a walk that can take minutes', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2025-01-10T10:00:00Z'),
      write: { 'a.ts': 'a\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
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
