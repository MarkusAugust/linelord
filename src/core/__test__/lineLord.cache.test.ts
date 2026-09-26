import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { type LineLord, lineLord } from '../../__test__/helpers/lineLord'
import { findRepositoryRoot } from '../../adapters/git/spawnGit'
import { resolveCachePath } from '../../adapters/sqlite/cacheLocation'
import { acquireCacheLock } from '../../adapters/sqlite/cacheMaintenance'
import { authorContributions } from '../ownership'

/**
 * The cache has one job beyond going faster: never to answer differently from
 * a full analysis. Most of what follows checks exactly that, by running both
 * and comparing, because a cache that is merely quick is worse than none.
 */

const GORVEK = { name: 'Gorvek of Bonereach', email: 'gorvek@bonereach.realm' }
const SARN = {
  name: 'Sarn the Faceless',
  email: 'sarn@kell.realm',
}

/** Ownership per contributor, which is what every comparison here is about. */
async function ownership(service: LineLord) {
  const contributions = authorContributions(service.getAnalysis())
  return contributions
    .map((c) => `${c.email}:${c.totalLines}`)
    .sort()
    .join(' ')
}

describe('LineLord - the cache', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-cachehome-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    delete process.env.XDG_CACHE_HOME
    await rm(cacheHome, { force: true, recursive: true })
  })

  /** Run with the cache, and report what it decided to do. */
  async function cached(repoPath: string, thresholdBytes = 50 * 1024) {
    const service = lineLord(repoPath, thresholdBytes, {
      useCache: true,
    })
    await service.initialize()
    return { service, status: service.getCacheStatus() }
  }

  /** Run without any cache at all: the answer everything is measured against. */
  async function fromScratch(repoPath: string, thresholdBytes = 50 * 1024) {
    const service = lineLord(repoPath, thresholdBytes)
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
      author: SARN,
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
      author: SARN,
      write: { 'f.txt': 'one\nCHANGED\nthree\n' },
    })
    await repo.commit({
      message: 'put it back',
      author: SARN,
      write: { 'f.txt': 'one\ntwo\nthree\n' },
    })

    const { service, status } = await cached(repo.path)
    const scratch = await fromScratch(repo.path)

    expect(status.mode).toBe('incremental')
    expect(await ownership(service)).toBe(await ownership(scratch))
    // And the answer is not the one the file contents suggest: the line reads
    // exactly as Gorvek wrote it, but it belongs to whoever touched it last.
    expect(await ownership(scratch)).toContain(`${SARN.email}:1`)
  })

  it('re-reads a file changed only while resolving a merge', async () => {
    repo = await baseRepo()
    await repo.git(['checkout', '-q', '-b', 'side'])
    await repo.commit({
      message: 'side edit',
      author: SARN,
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
      author: SARN,
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
        author: SARN,
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

  it("keeps a repository's analysis when the user looks at another one", async () => {
    // Switching repositories used to empty the database it was holding, which
    // once the database is a cache file means throwing away the analysis the
    // user just paid for. Coming back to it should cost nothing.
    repo = await baseRepo()
    const other = await createTestRepo()
    try {
      await other.commit({
        message: 'elsewhere',
        author: SARN,
        write: { 'only-here.txt': 'a\nb\n' },
      })

      // Analysing a second repository must not cost the first its stored
      // analysis. This was a real bug when one service was pointed at a new
      // path: it emptied the database it was holding, which was the previous
      // repository's cache file.
      const first = lineLord(repo.path, 50 * 1024, {
        useCache: true,
      })
      await first.initialize()
      const second = lineLord(other.path, 50 * 1024, {
        useCache: true,
      })
      await second.initialize()

      const { status } = await cached(repo.path)

      expect(status.mode).toBe('reused')
    } finally {
      await other.cleanup()
    }
  })

  it('does not claim a rebase when it simply cannot tell', async () => {
    // A stored revision git has never heard of -- a pruned or damaged
    // repository does this as readily as a rebase -- is not the same as a
    // revision that is genuinely no longer an ancestor, and the message the
    // user reads should not assert the wrong one.
    repo = await baseRepo()
    await cached(repo.path)

    const service = lineLord(repo.path, 50 * 1024, {
      useCache: true,
    })
    await service.initialize()
    // Point the stored fingerprint at a commit that does not exist.
    await service.getStore().writeMeta({ head_sha: 'f'.repeat(40) })

    const { status } = await cached(repo.path)

    expect(status.mode).toBe('full')
    expect(status.reason).toBe(
      'the stored revision could not be found in this repository',
    )
  })

  it('reads everything again when asked to refresh, and says that is why', async () => {
    repo = await baseRepo()
    await cached(repo.path)

    const service = lineLord(repo.path, 50 * 1024, {
      useCache: true,
      refresh: true,
    })
    await service.initialize()

    expect(service.getCacheStatus().mode).toBe('full')
    expect(service.getCacheStatus().reason).toBe(
      'you asked for a fresh analysis',
    )

    // And it leaves a usable cache behind rather than only discarding one.
    const after = await cached(repo.path)
    expect(after.status.mode).toBe('reused')
  })

  it('does not write while another run holds the same repository', async () => {
    // SQLite would keep the file intact, but two analyses interleaving would
    // leave a fingerprint describing neither. The second run works from
    // memory, which costs it its cache and nothing else.
    repo = await baseRepo()

    const holder = lineLord(repo.path, 50 * 1024, { useCache: true })
    const lookup = await findRepositoryRoot(repo.path)
    const lock = acquireCacheLock(
      resolveCachePath(lookup.found ? lookup.root : repo.path),
    )
    expect(lock).not.toBe(null)

    try {
      await holder.initialize()

      expect(holder.getCacheStatus().path).toBeUndefined()
      // The analysis itself is unaffected.
      expect(await ownership(holder)).toBe(
        await ownership(await fromScratch(repo.path)),
      )
    } finally {
      lock?.release()
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

describe('LineLord - incremental and full agree, whatever the history', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-invariant-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    delete process.env.XDG_CACHE_HOME
    await rm(cacheHome, { force: true, recursive: true })
  })

  it('answers identically whether updated step by step or built at the end', async () => {
    // The invariant worth more than any individual case: analysing at one
    // commit and then updating forwards must land exactly where analysing the
    // final commit from nothing lands. The history below is deterministic but
    // deliberately awkward -- edits, reverts, additions, deletions and a file
    // that comes back after being removed.
    repo = await createTestRepo()
    const people = [GORVEK, SARN]
    await repo.commit({
      message: 'start',
      author: GORVEK,
      write: { 'a.txt': 'a1\na2\na3\n', 'b.txt': 'b1\nb2\n' },
    })

    const service = lineLord(repo.path, 50 * 1024, {
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
    const scratch = lineLord(repo.path)
    await scratch.initialize()

    expect(incremental).toBe(await ownership(scratch))
  })
})

describe('what a reused run knows about itself', () => {
  let repo: TestRepo | undefined
  let cacheHome: string

  beforeEach(async () => {
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-context-'))
    process.env.XDG_CACHE_HOME = cacheHome
  })

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    delete process.env.XDG_CACHE_HOME
    await rm(cacheHome, { force: true, recursive: true })
  })

  it('still says which revision the numbers describe', async () => {
    // The revision line exists so nobody has to guess what they are looking
    // at. A reused run skips the analysis that used to establish it, so the
    // line disappeared on exactly the runs that happen most often -- and the
    // faster the cache made LineLord, the less it said about its own answer.
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'const a = 1\n' } })
    const head = await repo.head()

    const first = lineLord(repo.path, 50 * 1024, { useCache: true })
    await first.initialize()

    const second = lineLord(repo.path, 50 * 1024, { useCache: true })
    await second.initialize()

    expect(second.getCacheStatus()?.mode).toBe('reused')
    expect(second.getAnalysisContext().headSha).toBe(head)
  })

  it('still counts the work that is not in those numbers', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'const a = 1\n' } })

    const first = lineLord(repo.path, 50 * 1024, { useCache: true })
    await first.initialize()

    await repo.writeFiles({ 'a.ts': 'const a = 2\n' })

    const second = lineLord(repo.path, 50 * 1024, { useCache: true })
    await second.initialize()

    expect(second.getAnalysisContext().uncommittedFileCount).toBe(1)
  })
})
