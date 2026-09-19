import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { LineLordService } from '../LineLordService'

/**
 * The cache has one job beyond going faster: never to answer differently from
 * a full analysis. Most of what follows checks exactly that, by running both
 * and comparing, because a cache that is merely quick is worse than none.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'nightshroud@alderstone.realm',
}

/** Ownership per contributor, which is what every comparison here is about. */
async function ownership(service: LineLordService) {
  const contributions = await service
    .getAnalysisService()
    .getAuthorContributions()
  return contributions
    .map((c) => `${c.email}:${c.totalLines}`)
    .sort()
    .join(' ')
}

describe('LineLordService - the cache', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-cachehome-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    process.env.XDG_CACHE_HOME = undefined
    await rm(cacheHome, { force: true, recursive: true })
  })

  /** Run with the cache, and report what it decided to do. */
  async function cached(repoPath: string, thresholdBytes = 50 * 1024) {
    const service = new LineLordService(repoPath, thresholdBytes, {
      useCache: true,
    })
    await service.initialize()
    return { service, status: service.getCacheStatus() }
  }

  /** Run without any cache at all: the answer everything is measured against. */
  async function fromScratch(repoPath: string, thresholdBytes = 50 * 1024) {
    const service = new LineLordService(repoPath, thresholdBytes)
    await service.initialize()
    return service
  }

  async function baseRepo() {
    const created = await createTestRepo()
    await created.commit({
      message: 'first',
      author: GORVEK,
      write: {
        'f.txt': 'one\ntwo\nthree\n',
        'other.txt': 'untouched\n',
      },
    })
    return created
  }

  it('reads nothing at all when the repository has not moved', async () => {
    repo = await baseRepo()

    const first = await cached(repo.path)
    expect(first.status.mode).toBe('full')
    expect(first.status.filesBlamed).toBe(2)

    const second = await cached(repo.path)

    expect(second.status.mode).toBe('reused')
    expect(second.status.filesBlamed).toBe(0)
    expect(await ownership(second.service)).toBe(await ownership(first.service))
  })

  it('re-reads only the files a commit touched', async () => {
    repo = await baseRepo()
    await cached(repo.path)

    await repo.commit({
      message: 'one file',
      author: NIGHTSHROUD,
      write: { 'f.txt': 'one\nCHANGED\nthree\n' },
    })

    const { service, status } = await cached(repo.path)

    expect(status.mode).toBe('incremental')
    expect(status.filesBlamed).toBe(1)
    expect(status.filesReused).toBe(1)
    expect(await ownership(service)).toBe(
      await ownership(await fromScratch(repo.path)),
    )
  })

  it('gets a reverted change right, which a diff would not', async () => {
    // The trap this whole mechanism is built around. A file changed in one
    // commit and restored in a later one is byte-identical at both ends, so
    // `git diff` reports nothing -- but blame now credits the line to whoever
    // restored it. A cache updated from the diff would keep the old owner
    // forever, and nothing would ever say so.
    repo = await baseRepo()
    await cached(repo.path)

    await repo.commit({
      message: 'change it',
      author: NIGHTSHROUD,
      write: { 'f.txt': 'one\nCHANGED\nthree\n' },
    })
    await repo.commit({
      message: 'put it back',
      author: NIGHTSHROUD,
      write: { 'f.txt': 'one\ntwo\nthree\n' },
    })

    const { service, status } = await cached(repo.path)
    const scratch = await fromScratch(repo.path)

    expect(status.mode).toBe('incremental')
    expect(await ownership(service)).toBe(await ownership(scratch))
    // And the answer is not the one the file contents suggest: the line reads
    // exactly as Gorvek wrote it, but it belongs to whoever touched it last.
    expect(await ownership(scratch)).toContain(`${NIGHTSHROUD.email}:1`)
  })

  it('re-reads a file changed only while resolving a merge', async () => {
    repo = await baseRepo()
    await repo.git(['checkout', '-q', '-b', 'side'])
    await repo.commit({
      message: 'side edit',
      author: NIGHTSHROUD,
      write: { 'f.txt': 'one\nside\nthree\n' },
    })
    await repo.git(['checkout', '-q', 'main'])
    await repo.commit({
      message: 'main edit',
      author: GORVEK,
      write: { 'f.txt': 'one\nmain\nthree\n' },
    })

    await cached(repo.path)

    // Resolve the conflict by taking a third answer, which exists in neither
    // parent and so only appears in the merge itself.
    await repo.git(['merge', '--no-commit', '--no-ff', 'side']).catch(() => {})
    await repo.writeFiles({ 'f.txt': 'one\nresolved\nthree\n' })
    await repo.git(['add', 'f.txt'])
    await repo.git(['commit', '--no-edit', '-m', 'merge side'])

    const { service, status } = await cached(repo.path)

    expect(status.mode).toBe('incremental')
    expect(await ownership(service)).toBe(
      await ownership(await fromScratch(repo.path)),
    )
  })

  it('starts again when history was rewritten rather than extended', async () => {
    repo = await baseRepo()
    await repo.commit({
      message: 'second',
      author: NIGHTSHROUD,
      write: { 'f.txt': 'one\nchanged\nthree\n' },
    })
    await cached(repo.path)

    await repo.git(['reset', '--hard', '-q', 'HEAD~1'])
    await repo.commit({
      message: 'a different second',
      author: GORVEK,
      write: { 'f.txt': 'one\nsomething else\nthree\n' },
    })

    const { service, status } = await cached(repo.path)

    expect(status.mode).toBe('full')
    expect(status.reason).toContain('rewritten')
    expect(await ownership(service)).toBe(
      await ownership(await fromScratch(repo.path)),
    )
  })

  it('starts again when the size threshold changed, and says so', async () => {
    repo = await baseRepo()
    await cached(repo.path, 50 * 1024)

    const { status } = await cached(repo.path, 200 * 1024)

    expect(status.mode).toBe('full')
    expect(status.reason).toBe(
      'the size threshold changed from 50 KB to 200 KB',
    )
  })

  it('starts again when a .mailmap appears', async () => {
    repo = await baseRepo()
    await cached(repo.path)

    await writeFile(
      join(repo.path, '.mailmap'),
      `${GORVEK.name} <${GORVEK.email}> <old@example.com>\n`,
    )

    const { status } = await cached(repo.path)

    expect(status.mode).toBe('full')
    expect(status.reason).toBe('a .mailmap was added')
  })

  it('keeps two repositories apart', async () => {
    repo = await baseRepo()
    const other = await createTestRepo()
    try {
      await other.commit({
        message: 'elsewhere',
        author: NIGHTSHROUD,
        write: { 'only-here.txt': 'a\nb\nc\nd\ne\n' },
      })

      const first = await cached(repo.path)
      const second = await cached(other.path)

      // A shared cache would have the second run reuse the first's answer.
      expect(second.status.mode).toBe('full')
      expect(await ownership(second.service)).not.toBe(
        await ownership(first.service),
      )
    } finally {
      await other.cleanup()
    }
  })

  it('analyses anyway when the cache cannot be written', async () => {
    // A cache is an optimisation. A cache directory that cannot be used is a
    // reason to analyse from scratch, not a reason to refuse to analyse.
    repo = await baseRepo()
    process.env.XDG_CACHE_HOME = '/proc/nonexistent-and-unwritable'

    const { service, status } = await cached(repo.path)

    expect(status.mode).toBe('full')
    expect(await ownership(service)).toBe(
      await ownership(await fromScratch(repo.path)),
    )
  })
})

describe('LineLordService - incremental and full agree, whatever the history', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-invariant-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    process.env.XDG_CACHE_HOME = undefined
    await rm(cacheHome, { force: true, recursive: true })
  })

  it('answers identically whether updated step by step or built at the end', async () => {
    // The invariant worth more than any individual case: analysing at one
    // commit and then updating forwards must land exactly where analysing the
    // final commit from nothing lands. The history below is deterministic but
    // deliberately awkward -- edits, reverts, additions, deletions and a file
    // that comes back after being removed.
    repo = await createTestRepo()
    const people = [GORVEK, NIGHTSHROUD]
    await repo.commit({
      message: 'start',
      author: GORVEK,
      write: { 'a.txt': 'a1\na2\na3\n', 'b.txt': 'b1\nb2\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      useCache: true,
    })
    await service.initialize()

    const steps: Array<{ write?: Record<string, string>; remove?: string[] }> =
      [
        { write: { 'a.txt': 'a1\nEDITED\na3\n' } },
        { write: { 'c.txt': 'c1\nc2\nc3\n' } },
        { write: { 'a.txt': 'a1\na2\na3\n' } }, // reverted to the original
        { remove: ['b.txt'] },
        { write: { 'c.txt': 'c1\nCHANGED\nc3\nc4\n' } },
        { write: { 'b.txt': 'b1\nb2\n' } }, // the deleted file returns
        { write: { 'a.txt': 'a1\na2\na3\na4\n' } },
      ]

    for (const [index, step] of steps.entries()) {
      await repo.commit({
        message: `step ${index}`,
        author: people[index % people.length],
        ...step,
      })
      await service.initialize()
    }

    const incremental = await ownership(service)
    const scratch = new LineLordService(repo.path)
    await scratch.initialize()

    expect(incremental).toBe(await ownership(scratch))
  })
})
