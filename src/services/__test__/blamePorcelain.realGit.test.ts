import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { parseBlamePorcelain } from '../blamePorcelain'

/**
 * The parser against what git actually prints.
 *
 * The tests beside this one use fixtures, which is what makes them able to
 * describe an odd case precisely. These run git, which is what makes them able
 * to catch a fixture that describes the format wrongly.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'night@alderstone.realm',
}

describe('parseBlamePorcelain against git itself', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('numbers every line of a long run from one commit', async () => {
    // A single commit owning many consecutive lines is where a reader that
    // trusted the group count in the header -- `<sha> 1 1 5` -- would file
    // five lines at position 1. It does not arise: git writes a header for
    // every line, and only the first of a group carries the commit details.
    repo = await createTestRepo()
    const body = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n')
    await repo.commit({
      message: 'all five at once',
      author: GORVEK,
      write: { 'f.txt': `${body}\n` },
    })

    for (const form of ['--porcelain', '--line-porcelain']) {
      const stdout = await repo.git([
        'blame',
        '-w',
        form,
        'HEAD',
        '--',
        'f.txt',
      ])
      const entries = parseBlamePorcelain(stdout)

      expect(entries.map((entry) => entry.lineNumber)).toEqual([1, 2, 3, 4, 5])
      expect(entries.map((entry) => entry.content)).toEqual([
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        'line 5',
      ])
      for (const entry of entries) {
        expect(entry.author).toBe(GORVEK.name)
        expect(entry.authorEmail).toBe(GORVEK.email)
      }
    }
  })

  it('reads the two porcelain forms into exactly the same entries', async () => {
    // --porcelain writes the commit header once per commit instead of once
    // per line, which is three quarters less output to read and parse. It is
    // only worth switching to if the two are the same answer, so this asserts
    // that rather than assuming it.
    repo = await createTestRepo()
    await repo.commit({
      message: 'the first hand',
      author: GORVEK,
      date: new Date('2021-01-02T03:04:05Z'),
      write: { 'f.txt': 'one\ntwo\n\nfour\nfive\n' },
    })
    await repo.commit({
      message: 'a second hand',
      author: NIGHTSHROUD,
      date: new Date('2022-02-03T04:05:06Z'),
      write: { 'f.txt': 'one\nCHANGED\n\nfour\nfive\nsix\n' },
    })
    await repo.commit({
      message: 'and back to the first',
      author: GORVEK,
      date: new Date('2023-03-04T05:06:07Z'),
      write: { 'f.txt': 'one\nCHANGED\n\nfour\nALSO CHANGED\nsix\nseven\n' },
    })

    const line = parseBlamePorcelain(
      await repo.git([
        'blame',
        '-w',
        '--line-porcelain',
        'HEAD',
        '--',
        'f.txt',
      ]),
    )
    const compact = parseBlamePorcelain(
      await repo.git(['blame', '-w', '--porcelain', 'HEAD', '--', 'f.txt']),
    )

    expect(compact).toEqual(line)
    expect(compact).toHaveLength(7)
    expect(new Set(compact.map((entry) => entry.author)).size).toBe(2)
  })

  it('reads a file whose lines come from several commits, blanks included', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'the first draft',
      author: GORVEK,
      date: new Date('2021-01-02T03:04:05Z'),
      write: { 'f.txt': 'first\n\nthird\n' },
    })
    await repo.commit({
      message: 'a later hand',
      author: NIGHTSHROUD,
      date: new Date('2022-02-03T04:05:06Z'),
      write: { 'f.txt': 'first\n\nthird\nfourth\n' },
    })

    const stdout = await repo.git([
      'blame',
      '-w',
      '--line-porcelain',
      'HEAD',
      '--',
      'f.txt',
    ])
    const entries = parseBlamePorcelain(stdout)

    expect(entries.map((entry) => entry.lineNumber)).toEqual([1, 2, 3, 4])
    // The blank line is line 2 and belongs to whoever wrote it, which is the
    // point: it is skipped when storing, not when numbering.
    expect(entries[1]?.content).toBe('')
    expect(entries[3]?.author).toBe(NIGHTSHROUD.name)
    expect(entries[3]?.authorTime).toBe(
      Math.floor(new Date('2022-02-03T04:05:06Z').getTime() / 1000),
    )
  })
})
