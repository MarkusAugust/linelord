import { describe, expect, it } from 'bun:test'
import { createMemoryStore } from '../../adapters/memory/store'
import type { AnalysisStore } from '../../ports/storage'
import {
  type AuthorPolicy,
  describeExistingMerges,
  findIdentityGuesses,
  normalizeAuthors,
  planNormalization,
  whyAuthorsMatch,
} from '../identity'
import { author } from './fixtures'

type Person = { name: string; email: string; displayName?: string }

async function storeWith(people: Person[]): Promise<AnalysisStore> {
  const store = createMemoryStore()
  await store.ensureAuthors(
    people.map((person) => ({
      name: person.name,
      email: person.email,
      displayName: person.displayName ?? person.name,
    })),
  )
  return store
}

/**
 * Normalise the given people and report who ended up merged with whom.
 * Each group is the set of names that share a canonical author.
 */
async function mergeGroups(
  people: Person[],
  policy: AuthorPolicy = 'strict',
): Promise<{ groups: string[][]; canonicalDisplayNames: string[] }> {
  const store = await storeWith(people)
  await normalizeAuthors(store, policy)

  const rows = await store.listAuthors()
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

const GORVEK = 'Gorvek of Bonereach'
const SARN = 'Sarn the Faceless'

describe('who gets merged', () => {
  it('merges identities that differ only in the case of the email', async () => {
    const { groups } = await mergeGroups([
      { name: 'Gorvek', email: 'Gorvek@Bonereach.Realm' },
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })

  it('merges one person who commits under two spellings of the same address', async () => {
    const { groups } = await mergeGroups(
      [
        { name: 'Alpha', email: 'g.bonereach@corp.com' },
        { name: 'Beta', email: 'gbonereach@corp.com' },
      ],
      'loose',
    )

    expect(groups).toHaveLength(1)
  })

  it('keeps clearly different people apart, even on a shared domain', async () => {
    const { groups } = await mergeGroups([
      { name: GORVEK, email: 'gorvek@corp.com' },
      { name: SARN, email: 'sarn@corp.com' },
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
      { name: 'Bonereach, Gorvek', email: 'a@x.com' },
      { name: 'Gorvek Bonereach', email: 'b@y.com' },
    ])

    // Recorded as current behaviour rather than endorsed.
    expect(groups).toHaveLength(2)
  })

  it('does not merge two people because one name resembles the other', async () => {
    // Guessing from names treats any substring relation as a match, so Ann
    // was absorbed into Annabelle despite different names, addresses and
    // domains. Matching by address alone cannot make that mistake.
    const { groups } = await mergeGroups([
      { name: 'Ann', email: 'ann@example.com' },
      { name: 'Annabelle', email: 'annabelle@other.com' },
    ])

    expect(groups).toHaveLength(2)
  })

  it('keeps colleagues apart who share a domain and little else', async () => {
    // Every pair below was merged into one person by the old default.
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
    const { groups } = await mergeGroups(
      [
        { name: 'Alpha', email: 'g.bonereach@corp.com' },
        { name: 'Beta', email: 'gbonereach@corp.com' },
      ],
      'loose',
    )

    expect(groups).toHaveLength(1)
  })
})

describe('choosing the canonical identity', () => {
  it('prefers a readable name over encoded gibberish', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'R29ydmVrIE9mQm9uZXJlYWNo', email: 'Gorvek@Bonereach.Realm' },
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
    ])

    expect(canonicalDisplayNames).toEqual([GORVEK])
  })

  it('prefers the longest display name among readable candidates', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'G', email: 'GORVEK@bonereach.realm' },
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
    ])

    expect(canonicalDisplayNames).toEqual([GORVEK])
  })

  it('does not mistake an ordinary single-word name for encoded data', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: 'GorvekOfBonereach', email: 'Gorvek@Bonereach.Realm' },
      { name: 'Gorvek', email: 'gorvek@bonereach.realm' },
    ])

    expect(canonicalDisplayNames).toEqual(['GorvekOfBonereach'])
  })

  it('keeps a name with an apostrophe readable', async () => {
    const { canonicalDisplayNames } = await mergeGroups([
      { name: "Gorvek O'Bonereach", email: 'Gorvek@Bonereach.Realm' },
      { name: 'Gorvek', email: 'gorvek@bonereach.realm' },
    ])

    expect(canonicalDisplayNames).toEqual(["Gorvek O'Bonereach"])
  })

  it('leaves exactly one canonical author per merged group', async () => {
    const store = await storeWith([
      { name: 'Gorvek', email: 'Gorvek@Bonereach.Realm' },
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
      { name: SARN, email: 'sarn@kell.realm' },
    ])
    await normalizeAuthors(store, 'strict')

    const rows = await store.listAuthors()
    expect(rows.filter((row) => row.isCanonical)).toHaveLength(2)
    // Every row points at a canonical author, including the canonical ones.
    expect(rows.every((row) => row.canonicalId !== null)).toBe(true)
  })
})

describe('what a merge moves', () => {
  it('reattributes blame lines to the canonical author and records the alias', async () => {
    const store = await storeWith([
      { name: 'Gorvek', email: 'Gorvek@Bonereach.Realm' },
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
    ])
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
    const [file] = await store.listFiles()
    const fileId = file?.id ?? -1
    await store.storeBlame(fileId, [
      { authorId: 1, lineNumber: 1, commitHash: null, commitTimestamp: null },
      { authorId: 2, lineNumber: 2, commitHash: null, commitTimestamp: null },
      { authorId: 2, lineNumber: 3, commitHash: null, commitTimestamp: null },
    ])

    await normalizeAuthors(store, 'strict')

    const data = await store.loadAnalysis()
    const canonical = data.authors.find((row) => row.isCanonical)
    expect(canonical).toBeDefined()
    const canonicalId = canonical?.id ?? -1

    // No line may be left pointing at a merged-away identity.
    expect(new Set(data.lines.map((line) => line.authorId))).toEqual(
      new Set([canonicalId]),
    )
    expect(data.lines).toHaveLength(3)
    expect(data.aliases).toHaveLength(1)
    expect(data.aliases[0]?.canonicalAuthorId).toBe(canonicalId)
  })

  it('records no aliases when nobody is merged', async () => {
    const store = await storeWith([
      { name: GORVEK, email: 'gorvek@bonereach.realm' },
      { name: SARN, email: 'sarn@kell.realm' },
    ])
    await normalizeAuthors(store, 'strict')

    expect((await store.loadAnalysis()).aliases).toHaveLength(0)
  })

  it('is a plan before it is a write', () => {
    const plan = planNormalization(
      [
        author(1, { name: 'Gorvek', email: 'Gorvek@Bonereach.Realm' }),
        author(2, { name: GORVEK, email: 'gorvek@bonereach.realm' }),
      ],
      'strict',
    )

    expect(plan.reassign).toEqual([{ from: 1, to: 2 }])
    expect(plan.aliases).toEqual([
      {
        canonicalAuthorId: 2,
        aliasName: 'Gorvek',
        aliasEmail: 'Gorvek@Bonereach.Realm',
      },
    ])
    expect(plan.authors.find((one) => one.id === 1)?.changes).toEqual({
      isCanonical: false,
      canonicalId: 2,
    })
  })
})

describe('strict policy', () => {
  it('merges only on exact email, ignoring how alike the names are', async () => {
    const { groups } = await mergeGroups(
      [
        { name: 'Ann', email: 'ann@example.com' },
        { name: 'Annabelle', email: 'annabelle@other.com' },
        { name: 'Gorvek', email: 'gorvek@bonereach.realm' },
        { name: 'Gorvek Bonereach', email: 'GORVEK@bonereach.realm' },
      ],
      'strict',
    )

    expect(groups).toHaveLength(3)
    expect(groups.find((group) => group.length === 2)).toEqual([
      'Gorvek',
      'Gorvek Bonereach',
    ])
  })

  it('makes a lone author canonical under either policy', async () => {
    for (const policy of ['strict', 'loose'] as const) {
      const { groups, canonicalDisplayNames } = await mergeGroups(
        [{ name: GORVEK, email: 'gorvek@bonereach.realm' }],
        policy,
      )
      expect(groups).toEqual([[GORVEK]])
      expect(canonicalDisplayNames).toEqual([GORVEK])
    }
  })

  it('does nothing to an empty author table', async () => {
    const store = createMemoryStore()
    await normalizeAuthors(store, 'strict')
    expect(await store.listAuthors()).toHaveLength(0)
  })
})

describe('the guesses, and their reasons', () => {
  const short = author(1, { name: 'Gorvek', email: 'gorvek@privat.no' })
  const long = author(2, {
    name: 'Gorvek of Bonereach',
    email: 'gorvek@firma.no',
  })
  const other = author(3, {
    name: 'Sarn the Faceless',
    email: 'sarn@kell.realm',
  })

  it('reports what a loose run would merge, having merged nothing', () => {
    const guesses = findIdentityGuesses([short, long, other])

    expect(guesses).toHaveLength(1)
    expect(guesses[0]?.canonical.email).toBe(long.email)
    expect(guesses[0]?.absorbed.map((one) => one.email)).toEqual([short.email])
  })

  it('explains every guess, including the one that was the seed of the group', () => {
    // The identity kept is the longest readable name, which need not be the
    // one the grouping started from. A generic reason for that case is a
    // reason nobody can check.
    for (const merge of findIdentityGuesses([short, long, other])) {
      for (const absorbed of merge.absorbed) {
        expect(absorbed.reason).not.toBe('they were taken to be one')
        expect(absorbed.reason.length).toBeGreaterThan(0)
      }
    }
  })

  it('ignores identities already folded into another', () => {
    const folded = { ...short, isCanonical: false, canonicalId: long.id }
    expect(findIdentityGuesses([folded, long, other])).toEqual([])
  })

  it('reads a merge back from the aliases it left behind', () => {
    const merges = describeExistingMerges(
      [long, other],
      [
        {
          canonicalAuthorId: long.id,
          aliasName: short.name,
          aliasEmail: short.email,
        },
      ],
    )

    expect(merges).toHaveLength(1)
    expect(merges[0]?.canonical.email).toBe(long.email)
    expect(merges[0]?.absorbed[0]?.email).toBe(short.email)
    expect(merges[0]?.absorbed[0]?.reason).toBe(
      whyAuthorsMatch(long, {
        name: short.name,
        displayName: short.name,
        email: short.email,
      }) ?? '',
    )
  })

  it('says why two addresses at one domain are alike', () => {
    expect(
      whyAuthorsMatch(
        { name: 'Alpha', displayName: 'Alpha', email: 'g.bonereach@corp.com' },
        { name: 'Beta', displayName: 'Beta', email: 'gbonereach@corp.com' },
      ),
    ).toBe('the addresses "g.bonereach" and "gbonereach" are alike at corp.com')
  })
})
