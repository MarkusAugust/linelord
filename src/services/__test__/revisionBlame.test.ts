import { describe, expect, it } from 'bun:test'
import {
  analysablePathsAtRevision,
  cohortMonth,
  countBlame,
  countKey,
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

describe('the rules a revision is read under', () => {
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
