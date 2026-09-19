import { describe, expect, it } from 'bun:test'
import { createDatabase } from '../../db/database'
import { authorAliases, authors, blameLines, files } from '../../db/schema'
import { AuthorNormalizationService } from '../AuthorNormalizationService'

type Person = { name: string; email: string; displayName?: string }

type Db = ReturnType<typeof createDatabase>

async function seedAuthors(db: Db, people: Person[]) {
  await db.insert(authors).values(
    people.map((person, index) => ({
      id: index + 1,
      name: person.name,
      email: person.email,
      displayName: person.displayName ?? person.name,
    })),
  )
}

/**
 * Normalise the given people and report who ended up merged with whom.
 * Each group is the set of names that share a canonical author.
 */
async function mergeGroups(
  people: Person[],
  policy: 'strict' | 'loose' = 'strict',
): Promise<{ groups: string[][]; canonicalDisplayNames: string[] }> {
  const db = createDatabase()
  await seedAuthors(db, people)
  await new AuthorNormalizationService(db).normalizeAllAuthors(policy)

  const rows = await db.select().from(authors)
  const byCanonical = new Map<number, string[]>()
  for (const row of rows) {
    const key = row.canonicalId ?? row.id
    byCanonical.set(key, [...(byCanonical.get(key) ?? []), row.name])
  }

  return {
    groups: [...byCanonical.values()],
    canonicalDisplayNames: rows
      .filter((row) => row.isCanonical)
      .map((row) => row.displayName),
  }
}

const GORVEK = 'Gorvek the Ironbane'
const NIGHTSHROUD = 'Sister Nightshroud'

describe('AuthorNormalizationService - who gets merged', () => {
  it('merges identities that differ only in the case of the email', async () => {
    const { groups } = await mergeGroups([
      { name: 'Gorvek', email: 'Gorvek@Ashendale.Realm' },
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })

  it('merges one person who commits under two spellings of the same address', async () => {
    const { groups } = await mergeGroups(
      [
        { name: 'Alpha', email: 'g.ironbane@corp.com' },
        { name: 'Beta', email: 'gironbane@corp.com' },
      ],
      'loose',
    )

    expect(groups).toHaveLength(1)
  })

  it('keeps clearly different people apart, even on a shared domain', async () => {
    const { groups } = await mergeGroups([
      { name: GORVEK, email: 'gorvek@corp.com' },
      { name: NIGHTSHROUD, email: 'nightshroud@corp.com' },
    ])

    expect(groups).toHaveLength(2)
  })

  it('keeps Martin and Marius apart', async () => {
    // Six letters, three of them different: just outside the 40% name
    // threshold. This is the pair the fuzzy matcher is most often accused of
    // collapsing, so it is worth pinning down.
    const { groups } = await mergeGroups([
      { name: 'Martin', email: 'martin@a.com' },
      { name: 'Marius', email: 'marius@b.com' },
    ])

    expect(groups).toHaveLength(2)
  })

  it('does not merge "Surname, Forename" with "Forename Surname"', async () => {
    const { groups } = await mergeGroups([
      { name: 'Ironbane, Gorvek', email: 'a@x.com' },
      { name: 'Gorvek Ironbane', email: 'b@y.com' },
    ])

    // Recorded as current behaviour rather than endorsed: N2 lists this
    // reordering as a case the matcher ought to catch. It does not.
    expect(groups).toHaveLength(2)
  })

  it('does not merge two people because one name resembles the other', async () => {
    // Guessing from names treats any substring relation as a match, so Ann was
    // absorbed into Annabelle despite different names, different addresses and
    // different domains. Matching by address alone cannot make that mistake.
    const { groups } = await mergeGroups([
      { name: 'Ann', email: 'ann@example.com' },
      { name: 'Annabelle', email: 'annabelle@other.com' },
    ])

    expect(groups).toHaveLength(2)
  })

  it('keeps colleagues apart who share a domain and little else', async () => {
    // Every pair below was merged into one person by the old default. The
    // address threshold is one character in a prefix of six or fewer, which in
    // a company where everyone shares a domain is not an edge case -- one of
    // the two then disappears from the ranking entirely while the other is
    // credited with their work.
    const pairs: Array<[Person, Person]> = [
      [
        { name: 'Marius Kvam', email: 'mk@firma.no' },
        { name: 'Mari Lie', email: 'ml@firma.no' },
      ],
      [
        { name: 'John Smith', email: 'john@corp.com' },
        { name: 'Joan Smith', email: 'joan@corp.com' },
      ],
      [
        { name: 'Erik Hansen', email: 'erik.hansen@corp.com' },
        { name: 'Erika Hansen', email: 'erika.hansen@corp.com' },
      ],
    ]

    for (const [one, other] of pairs) {
      const { groups } = await mergeGroups([one, other])
      expect(groups).toHaveLength(2)
    }
  })

  it('still merges one person under two spellings when asked to guess', async () => {
    // The guessing is kept behind a flag rather than deleted: a repository
    // whose history genuinely holds one person under several addresses needs
    // a way out, and seeing the guesses is how you learn what to write in a
    // .mailmap.
    const { groups } = await mergeGroups(
      [
        { name: 'Alpha', email: 'g.ironbane@corp.com' },
        { name: 'Beta', email: 'gironbane@corp.com' },
      ],
      'loose',
    )

    expect(groups).toHaveLength(1)
  })
})

describe('AuthorNormalizationService - choosing the canonical identity', () => {
  // Which identity wins only matters once two rows are being merged, and under
  // the default that happens when one address is written two ways -- which is
  // what a repository with inconsistent capitalisation actually contains.
  it('prefers a readable name over encoded gibberish', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'R29ydmVrIFRoZUlyb25iYW5l', email: 'Gorvek@Ashendale.Realm' },
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
    ])

    expect(canonicalDisplayNames).toEqual([GORVEK])
  })

  it('prefers the longest display name among readable candidates', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'G', email: 'GORVEK@ashendale.realm' },
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
    ])

    expect(canonicalDisplayNames).toEqual([GORVEK])
  })

  it('does not mistake an ordinary single-word name for encoded data', async () => {
    // The base64 test is what once swallowed every ASCII name. A long
    // camel-case name has the interior capitals but none of the digits or
    // padding, and must stay readable.
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'GorvekTheIronbane', email: 'Gorvek@Ashendale.Realm' },
      { name: 'Gorvek', email: 'gorvek@ashendale.realm' },
    ])

    expect(canonicalDisplayNames).toEqual(['GorvekTheIronbane'])
  })

  it('keeps a name with an apostrophe readable', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: "Gorvek O'Ironbane", email: 'Gorvek@Ashendale.Realm' },
      { name: 'Gorvek', email: 'gorvek@ashendale.realm' },
    ])

    expect(canonicalDisplayNames).toEqual(["Gorvek O'Ironbane"])
  })

  it('leaves exactly one canonical author per merged group', async () => {
    const db = createDatabase()
    await seedAuthors(db, [
      { name: 'Gorvek', email: 'Gorvek@Ashendale.Realm' },
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
      { name: NIGHTSHROUD, email: 'nightshroud@alderstone.realm' },
    ])
    await new AuthorNormalizationService(db).normalizeAllAuthors()

    const rows = await db.select().from(authors)
    expect(rows.filter((row) => row.isCanonical)).toHaveLength(2)
    // Every row points at a canonical author, including the canonical ones.
    expect(rows.every((row) => row.canonicalId !== null)).toBe(true)
  })
})

describe('AuthorNormalizationService - what a merge moves', () => {
  it('reattributes blame lines to the canonical author and records the alias', async () => {
    const db = createDatabase()
    await seedAuthors(db, [
      { name: 'Gorvek', email: 'Gorvek@Ashendale.Realm' },
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
    ])
    await db
      .insert(files)
      .values([{ id: 1, path: 'a.ts', extension: '.ts', size: 10 }])
    await db.insert(blameLines).values([
      { fileId: 1, authorId: 1, lineNumber: 1 },
      { fileId: 1, authorId: 2, lineNumber: 2 },
      { fileId: 1, authorId: 2, lineNumber: 3 },
    ])

    await new AuthorNormalizationService(db).normalizeAllAuthors()

    const canonical = (await db.select().from(authors)).find(
      (row) => row.isCanonical,
    )
    expect(canonical).toBeDefined()
    const canonicalId = canonical?.id ?? -1

    const lines = await db.select().from(blameLines)
    const aliases = await db.select().from(authorAliases)

    // No line may be left pointing at a merged-away identity.
    expect(new Set(lines.map((line) => line.authorId))).toEqual(
      new Set([canonicalId]),
    )
    expect(lines).toHaveLength(3)
    expect(aliases).toHaveLength(1)
    expect(aliases[0]?.canonicalAuthorId).toBe(canonicalId)
  })

  it('records no aliases when nobody is merged', async () => {
    const db = createDatabase()
    await seedAuthors(db, [
      { name: GORVEK, email: 'gorvek@ashendale.realm' },
      { name: NIGHTSHROUD, email: 'nightshroud@alderstone.realm' },
    ])
    await new AuthorNormalizationService(db).normalizeAllAuthors()

    expect(await db.select().from(authorAliases)).toHaveLength(0)
  })
})

describe('AuthorNormalizationService - strict policy', () => {
  it('merges only on exact email, ignoring how alike the names are', async () => {
    const { groups } = await mergeGroups(
      [
        { name: 'Ann', email: 'ann@example.com' },
        { name: 'Annabelle', email: 'annabelle@other.com' },
        { name: 'Gorvek', email: 'gorvek@ashendale.realm' },
        { name: 'Gorvek Ironbane', email: 'GORVEK@ashendale.realm' },
      ],
      'strict',
    )

    // Ann and Annabelle stay apart here, which is precisely the argument for
    // making an address-based policy the default (N1).
    expect(groups).toHaveLength(3)
    expect(groups.find((group) => group.length === 2)).toEqual([
      'Gorvek',
      'Gorvek Ironbane',
    ])
  })

  it('makes a lone author canonical under either policy', async () => {
    for (const policy of ['strict', 'loose'] as const) {
      const { groups, canonicalDisplayNames } = await mergeGroups(
        [{ name: GORVEK, email: 'gorvek@ashendale.realm' }],
        policy,
      )
      expect(groups).toEqual([[GORVEK]])
      expect(canonicalDisplayNames).toEqual([GORVEK])
    }
  })

  it('does nothing to an empty author table', async () => {
    const db = createDatabase()
    await new AuthorNormalizationService(db).normalizeAllAuthors()
    expect(await db.select().from(authors)).toHaveLength(0)
  })
})
