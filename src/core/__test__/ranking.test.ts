import { describe, expect, it } from 'bun:test'
import { createMemoryStore } from '../../adapters/memory/store'
import type { AnalysisData, AuthorRecord } from '../model'
import { rankAuthors } from '../ranking'
import { analysis, author, file, lines } from './fixtures'

const WARLORD = 1
const CHAMPION = 2
const SQUIRE = 3
const GHOST = 4

/**
 * Four canonical authors holding 60, 30, 10 and 0 of the 100 surviving lines.
 * The round numbers make the percentages checkable by eye.
 */
const seeded = analysis({
  authors: [
    author(WARLORD, {
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
    }),
    author(CHAMPION, {
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
    }),
    author(SQUIRE, {
      name: 'Zygofer the Defiler',
      email: 'zygofer@ashendale.realm',
    }),
    author(GHOST, {
      name: 'Ghost of Commits Past',
      email: 'ghost@ashendale.realm',
    }),
  ],
  files: [file(1, 'a.ts')],
  lines: lines(
    { fileId: 1, authorId: WARLORD, count: 60 },
    { fileId: 1, authorId: CHAMPION, count: 30 },
    { fileId: 1, authorId: SQUIRE, count: 10 },
  ),
})

/** The authors as they would stand once the changes are stored. */
function applied(data: AnalysisData): Map<number, AuthorRecord> {
  const byId = new Map(data.authors.map((one) => [one.id, { ...one }]))
  for (const { id, changes } of rankAuthors(data)) {
    const stored = byId.get(id)
    if (stored) byId.set(id, { ...stored, ...changes })
  }
  return byId
}

describe('rankAuthors', () => {
  it('ranks from 1 downwards by surviving line count', () => {
    const rows = applied(seeded)

    expect(rows.get(WARLORD)?.rank).toBe(1)
    expect(rows.get(CHAMPION)?.rank).toBe(2)
    expect(rows.get(SQUIRE)?.rank).toBe(3)
  })

  it('gives percentages of the whole project, rounded to two decimals', () => {
    const rows = applied(seeded)

    expect(rows.get(WARLORD)?.percentage).toBe(60)
    expect(rows.get(CHAMPION)?.percentage).toBe(30)
    expect(rows.get(SQUIRE)?.percentage).toBe(10)
  })

  it('rounds awkward shares to two decimals rather than truncating', () => {
    const thirds = analysis({
      authors: [
        author(1, { name: 'A', email: 'a@x.com' }),
        author(2, { name: 'B', email: 'b@x.com' }),
        author(3, { name: 'C', email: 'c@x.com' }),
      ],
      files: [file(1, 'a.ts')],
      // One line each: a third of the project apiece.
      lines: lines(
        { fileId: 1, authorId: 1 },
        { fileId: 1, authorId: 2 },
        { fileId: 1, authorId: 3 },
      ),
    })

    expect(applied(thirds).get(1)?.percentage).toBe(33.33)
  })

  it('clears rank, percentage and title for authors holding no lines', () => {
    const ghost = applied(
      analysis({
        ...seeded,
        authors: seeded.authors.map((one) =>
          one.id === GHOST
            ? { ...one, rank: 7, percentage: 12, title: 'stale' }
            : one,
        ),
      }),
    ).get(GHOST)

    expect(ghost?.rank).toBeNull()
    expect(ghost?.percentage).toBe(0)
    expect(ghost?.title).toBeNull()
  })

  it('gives every contributing author a title and the leader the best one', () => {
    const rows = applied(seeded)

    for (const id of [WARLORD, CHAMPION, SQUIRE]) {
      expect(rows.get(id)?.title).toBeTruthy()
    }
    expect(rows.get(WARLORD)?.title).toBe('legend')
    // Distinct ranks must not share a title within so small a field.
    const titles = [WARLORD, CHAMPION, SQUIRE].map(
      (id) => rows.get(id)?.title ?? '',
    )
    expect(new Set(titles).size).toBe(3)
  })

  it('ignores non-canonical identities when ranking', () => {
    // An alias row with lines of its own must not appear in the ranking; only
    // the canonical author it was merged into may.
    const withAlias = analysis({
      ...seeded,
      authors: [
        ...seeded.authors,
        author(99, {
          name: 'gorvek',
          email: 'gorvek.alias@ashendale.realm',
          isCanonical: false,
          canonicalId: WARLORD,
        }),
      ],
      lines: [...seeded.lines, ...lines({ fileId: 1, authorId: 99 })],
    })

    const changes = rankAuthors(withAlias)
    expect(changes.find((one) => one.id === 99)).toBeUndefined()
    expect(changes.find((one) => one.id === WARLORD)?.changes.rank).toBe(1)
  })

  it('changes nothing when the repository has no blame data at all', () => {
    const empty = analysis({
      authors: [author(1, { name: 'Nobody', email: 'nobody@x.com' })],
    })

    expect(rankAuthors(empty)).toEqual([])
  })

  it('breaks a tie in lines by who was seen first', () => {
    const tied = analysis({
      authors: [
        author(2, { name: 'Later', email: 'later@x.com' }),
        author(1, { name: 'Earlier', email: 'earlier@x.com' }),
      ],
      files: [file(1, 'a.ts')],
      lines: lines({ fileId: 1, authorId: 2 }, { fileId: 1, authorId: 1 }),
    })

    const rows = applied(tied)
    expect(rows.get(1)?.rank).toBe(1)
    expect(rows.get(2)?.rank).toBe(2)
  })

  it('is idempotent through the store: ranking twice leaves the same rows', async () => {
    const store = createMemoryStore()
    const ids = await store.ensureAuthors(
      seeded.authors.map(({ name, email, displayName }) => ({
        name,
        email,
        displayName,
      })),
    )
    await store.reconcileFiles({
      insert: [
        {
          path: 'a.ts',
          extension: '.ts',
          size: 10,
          isBinary: false,
          isIgnored: false,
          isLargerThanThreshold: false,
        },
      ],
      update: [],
      remove: [],
    })
    const [stored] = await store.listFiles()
    const fileId = stored?.id ?? -1
    const held = [
      ['gorvek@ashendale.realm', 60],
      ['nightshroud@alderstone.realm', 30],
      ['zygofer@ashendale.realm', 10],
    ] as const
    await store.storeBlame(
      fileId,
      held.flatMap(([email, count]) =>
        Array.from({ length: count }, (_, index) => ({
          authorId: ids.get(email) ?? -1,
          lineNumber: index + 1,
          commitHash: null,
          commitTimestamp: null,
        })),
      ),
    )

    await store.updateAuthors(rankAuthors(await store.loadAnalysis()))
    const first = await store.listAuthors()
    await store.updateAuthors(rankAuthors(await store.loadAnalysis()))
    const second = await store.listAuthors()

    expect(second).toEqual(first)
    expect(first.find((a) => a.email === 'gorvek@ashendale.realm')?.rank).toBe(
      1,
    )
  })
})
