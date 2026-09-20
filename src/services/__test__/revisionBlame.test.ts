import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import {
  analysablePathsAtRevision,
  blameFileAtRevision,
  cohortMonth,
  countBlame,
  countKey,
  listFilesAtRevision,
  listTextFilesAtRevision,
  readCountKey,
} from '../revisionBlame'

/**
 * Reading a revision that is not HEAD.
 *
 * The same three rules as the analysis of the present, asked of the past:
 * text, not ignored, not oversized. A history measured under different rules
 * than the present would give a curve that does not join up with the numbers
 * beside it.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }

describe('reading a tree at a revision', () => {
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

    const then = await listFilesAtRevision(repo.path, first)
    const now = await listFilesAtRevision(repo.path, await repo.head())

    expect(then.map((f) => f.path).sort()).toEqual(['kept.ts', 'removed.ts'])
    expect(now.map((f) => f.path).sort()).toEqual(['added.ts', 'kept.ts'])
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

    const text = await listTextFilesAtRevision(repo.path, await repo.head())

    expect(text.has('code.ts')).toBe(true)
    expect(text.has('blob.bin')).toBe(false)
  })

  it('applies the same three rules the present is analysed under', async () => {
    const files = [
      { path: 'src/code.ts', size: 100 },
      { path: 'blob.bin', size: 100 },
      { path: 'package-lock.json', size: 100 },
      { path: 'src/huge.ts', size: 999_999 },
      { path: 'src/empty.ts', size: 0 },
    ]
    const text = new Set(['src/code.ts', 'src/huge.ts', 'package-lock.json'])

    expect(analysablePathsAtRevision(files, text, 50 * 1024).sort()).toEqual([
      // Empty counts: it has no line for grep to match but is not binary.
      'src/code.ts',
      'src/empty.ts',
    ])
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

    const then = await blameFileAtRevision(repo.path, first, 'f.ts')

    expect(then).toHaveLength(2)
  })
})

describe('counting blame into cohorts', () => {
  it('buckets a moment into the start of its UTC month', () => {
    const inMarch = Math.floor(
      new Date('2026-03-17T12:00:00Z').getTime() / 1000,
    )
    const startOfMarch = Math.floor(
      new Date('2026-03-01T00:00:00Z').getTime() / 1000,
    )

    expect(cohortMonth(inMarch)).toBe(startOfMarch)
  })

  it('counts by author and month together', () => {
    const march = Math.floor(new Date('2026-03-17T12:00:00Z').getTime() / 1000)
    const april = Math.floor(new Date('2026-04-02T12:00:00Z').getTime() / 1000)
    const entry = (email: string, time: number, content: string) => ({
      sha: 'a'.repeat(40),
      lineNumber: 1,
      originalLineNumber: 1,
      author: 'Someone',
      authorEmail: email,
      authorTime: time,
      content,
    })

    const counts = countBlame([
      entry('a@x.com', march, 'one'),
      entry('a@x.com', march, 'two'),
      entry('a@x.com', april, 'three'),
      entry('b@x.com', march, 'four'),
      // Blank lines belong to nobody here too.
      entry('a@x.com', march, '   '),
    ])

    expect(counts.get(countKey('a@x.com', cohortMonth(march)))).toBe(2)
    expect(counts.get(countKey('a@x.com', cohortMonth(april)))).toBe(1)
    expect(counts.get(countKey('b@x.com', cohortMonth(march)))).toBe(1)
  })

  it('leaves out a line with no time at all', () => {
    const counts = countBlame([
      {
        sha: 'a'.repeat(40),
        lineNumber: 1,
        originalLineNumber: 1,
        author: 'Someone',
        authorEmail: 'a@x.com',
        authorTime: null,
        content: 'code',
      },
    ])

    expect(counts.size).toBe(0)
  })

  it('reads a key back into what it was made from', () => {
    const month = cohortMonth(1_700_000_000)

    expect(readCountKey(countKey('gorvek@ashendale.realm', month))).toEqual({
      email: 'gorvek@ashendale.realm',
      month,
    })
  })
})
