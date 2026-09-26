import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../../__test__/helpers/createTestRepo'
import {
  createGit,
  parseFirstParentLog,
  parseLsTree,
  parseTextPaths,
} from '../spawnGit'

/**
 * The git port against real git.
 *
 * The parsers are tested on strings, which is what makes an odd record
 * describable; the port is tested on a repository, which is what catches a
 * fixture that describes git's output wrongly.
 */

const GORVEK = { name: 'Gorvek of Bonereach', email: 'gorvek@bonereach.realm' }

describe('createGit, reading a tree at a revision', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('lists what was there then, not what is there now', async () => {
    repo = await createTestRepo()
    const first = await repo.commit({
      message: 'the old shape',
      author: GORVEK,
      write: { 'kept.ts': 'a\n', 'removed.ts': 'b\n' },
    })
    await repo.commit({
      message: 'the new shape',
      author: GORVEK,
      remove: ['removed.ts'],
      write: { 'added.ts': 'c\n' },
    })
    const git = createGit(repo.path)

    const then = await git.listTree(first)
    const now = await git.listTree(await repo.head())

    expect(then.map((f) => f.path).sort()).toEqual(['kept.ts', 'removed.ts'])
    expect(now.map((f) => f.path).sort()).toEqual(['added.ts', 'kept.ts'])
    expect(then.find((f) => f.path === 'kept.ts')?.size).toBe(2)
  })

  it('tells text from binary at that revision', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one of each',
      author: GORVEK,
      write: {
        'code.ts': 'const a = 1\n',
        'blob.bin': new Uint8Array([0, 1, 2, 0, 3]),
      },
    })

    const text = await createGit(repo.path).listTextPaths(await repo.head())

    expect(text.has('code.ts')).toBe(true)
    expect(text.has('blob.bin')).toBe(false)
  })

  it('blames the file as it stood at that revision', async () => {
    repo = await createTestRepo()
    const first = await repo.commit({
      message: 'two lines',
      author: GORVEK,
      date: new Date('2024-05-06T00:00:00Z'),
      write: { 'f.ts': 'one\ntwo\n' },
    })
    await repo.commit({
      message: 'three lines',
      author: GORVEK,
      date: new Date('2025-05-06T00:00:00Z'),
      write: { 'f.ts': 'one\ntwo\nthree\n' },
    })

    const then = await createGit(repo.path).blame(first, 'f.ts', [])

    expect(then).toHaveLength(2)
    expect(then[0]?.authorEmail).toBe(GORVEK.email)
  })

  it('resolves HEAD, and a name to the commit it points at', async () => {
    repo = await createTestRepo()
    const first = await repo.commit({
      message: 'one',
      author: GORVEK,
      write: { 'a.ts': 'a\n' },
    })
    const git = createGit(repo.path)

    expect(await git.resolveHead()).toBe(await repo.head())
    expect(await git.resolveCommit(first.slice(0, 8))).toBe(first)
    expect(await git.resolveCommit('no-such-thing')).toBeNull()
  })

  it('has no HEAD and no history in a repository with no commits', async () => {
    repo = await createTestRepo()
    const git = createGit(repo.path)

    expect(await git.resolveHead()).toBeNull()
    expect(await git.firstParentHistory()).toEqual([])
  })

  it('walks the first-parent history newest first', async () => {
    repo = await createTestRepo()
    const first = await repo.commit({
      message: 'one',
      author: GORVEK,
      date: new Date('2024-01-01T00:00:00Z'),
      write: { 'a.ts': 'a\n' },
    })
    const second = await repo.commit({
      message: 'two',
      author: GORVEK,
      date: new Date('2024-02-01T00:00:00Z'),
      write: { 'a.ts': 'b\n' },
    })
    const git = createGit(repo.path)

    const history = await git.firstParentHistory()
    expect(history.map((one) => one.sha)).toEqual([second, first])
    expect(await git.isAncestor(first, second)).toBe(true)
    expect(await git.isAncestor(second, first)).toBe(false)
    expect(await git.isAncestor('0'.repeat(40), second)).toBeNull()
    expect(await git.pathsTouchedBetween(first, second)).toEqual(['a.ts'])
  })
})

describe('the parsers', () => {
  it('reads ls-tree records, blobs only, with the path after the first tab', () => {
    const stdout = [
      '100644 blob 0123456789012345678901234567890123456789      42\tsrc/a b.ts',
      '160000 commit 0123456789012345678901234567890123456789       -\tvendor/lib',
      '100644 blob 0123456789012345678901234567890123456789       -\tweird',
    ].join('\0')

    expect(parseLsTree(stdout)).toEqual([
      { path: 'src/a b.ts', size: 42 },
      { path: 'weird', size: 0 },
    ])
  })

  it('strips the revision prefix from grep records', () => {
    const rev = 'a'.repeat(40)
    expect(parseTextPaths(`${rev}:src/a.ts\0${rev}:b:c.ts\0`, rev)).toEqual(
      new Set(['src/a.ts', 'b:c.ts']),
    )
  })

  it('reads a first-parent log and skips what it cannot', () => {
    expect(
      parseFirstParentLog(`${'a'.repeat(40)} 1700000000\nbroken\n`),
    ).toEqual([{ sha: 'a'.repeat(40), timestamp: 1700000000 }])
  })
})
