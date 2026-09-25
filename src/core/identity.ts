import { distance } from 'fastest-levenshtein'
import type { AliasRecord, AuthorRecord } from '../core/model'
import type { AnalysisStore, AuthorChanges } from '../ports/storage'

/**
 * Who is one person, and why.
 *
 * `strict` is the default and compares email addresses, nothing else. Two
 * commits are the same person when git says they are, and `.mailmap` --
 * which blame applies before LineLord sees a single line -- is how anyone
 * says otherwise. That makes the merging explicit, reviewable, and the same
 * identity git itself uses everywhere.
 *
 * `loose` additionally guesses, from names and from addresses that merely
 * resemble each other, and it guesses badly. Measured on realistic pairs, it
 * merged mk@ with ml@, john@ with joan@, and erik.hansen@ with erika.hansen@
 * -- different people, one of whom then vanishes from the ranking while the
 * other is credited with their work. It is kept, behind a flag, because a
 * repository whose history genuinely contains one person under several
 * spellings has to get out of that somehow, and seeing the guesses is how
 * you learn what to write in a .mailmap.
 *
 * The deciding is pure: functions from the author rows to a description of
 * who belongs together. Acting on it is a plan for the storage port.
 */

export type AuthorPolicy = 'strict' | 'loose'

/** One person the matching decided several identities add up to. */
export interface IdentityMerge {
  canonical: { name: string; email: string }
  absorbed: Array<{ name: string; email: string; reason: string }>
}

/** The parts of an identity the matching actually looks at. */
export type Identity = { name: string; displayName: string; email: string }

/** What normalising the authors would write. */
export interface NormalizationPlan {
  authors: Array<{ id: number; changes: AuthorChanges }>
  aliases: AliasRecord[]
  /** Lines to move from an absorbed identity to the one kept. */
  reassign: Array<{ from: number; to: number }>
}

const UNEXPLAINED = 'they were taken to be one'

function cleanName(name: string): string {
  return name
    .replace(/[^\w\sÀ-ſĀ-ɏ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function areStringsSimilar(
  str1: string,
  str2: string,
  isEmail: boolean,
): boolean {
  if (!str1 || !str2) return false
  if (str1 === str2) return true

  // Clean strings - just remove separators and numbers
  const clean1 = str1.toLowerCase().replace(/[._-]/g, '').replace(/[0-9]/g, '')
  const clean2 = str2.toLowerCase().replace(/[._-]/g, '').replace(/[0-9]/g, '')

  if (clean1 === clean2) return true
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true

  // Simple Levenshtein distance with appropriate thresholds
  const dist = distance(clean1, clean2)
  const maxLength = Math.max(clean1.length, clean2.length)

  let threshold: number
  if (isEmail) {
    // Strict for emails
    threshold = Math.floor(maxLength * 0.15) // 15% difference
    if (threshold < 1) threshold = 1
    if (threshold > 3) threshold = 3
  } else {
    // Lenient for names
    threshold = Math.floor(maxLength * 0.4) // 40% difference
    if (threshold < 2) threshold = 2
    if (threshold > 6) threshold = 6
  }

  return dist <= threshold
}

/**
 * Why two identities were taken to be one person, or null if they were not.
 *
 * The reason is returned rather than a yes, because a guess nobody can
 * inspect is a guess nobody can correct. It is what the interface shows and
 * what --write-mailmap turns into a file.
 */
export function whyAuthorsMatch(
  author1: Identity,
  author2: Identity,
): string | null {
  if (author1.email.toLowerCase() === author2.email.toLowerCase()) {
    return 'the same address, written differently'
  }

  const name1 = cleanName(author1.name)
  const name2 = cleanName(author2.name)
  const displayName1 = cleanName(author1.displayName)
  const displayName2 = cleanName(author2.displayName)

  const namePairs = [
    [name1, name2],
    [name1, displayName2],
    [displayName1, name2],
    [displayName1, displayName2],
  ]

  for (const [n1, n2] of namePairs) {
    if (n1 && n2 && areStringsSimilar(n1, n2, false)) {
      return n1 === n2
        ? 'the same name'
        : `the names "${n1}" and "${n2}" are alike`
    }
  }

  // Check email prefixes if same domain
  const email1Parts = author1.email.split('@')
  const email2Parts = author2.email.split('@')
  const email1Domain = email1Parts[1]?.toLowerCase() || ''
  const email2Domain = email2Parts[1]?.toLowerCase() || ''

  if (email1Domain === email2Domain) {
    const email1Prefix = email1Parts[0]?.toLowerCase() || ''
    const email2Prefix = email2Parts[0]?.toLowerCase() || ''

    if (areStringsSimilar(email1Prefix, email2Prefix, true)) {
      return `the addresses "${email1Prefix}" and "${email2Prefix}" are alike at ${email1Domain}`
    }
  }

  return null
}

/**
 * Whether a name looks like something other than a name a person wrote.
 *
 * An earlier check stripped whitespace before testing the result against
 * the base64 alphabet, so "Gorvek the Ironbane" collapsed to
 * "GorvektheIronbane" and matched exactly as an encoded blob would. Every
 * plain ASCII name was therefore classed as an artifact, and the choice fell
 * back to insertion order -- crowning the gibberish it was written to avoid.
 */
function hasEncodingArtifacts(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed === '') return false

  // Characters that no name written in a Latin script should contain.
  const hasWeirdChars = /[^\w\sÀ-ſĀ-ɏ.\-']/.test(trimmed)

  return hasWeirdChars || looksBase64Encoded(trimmed)
}

/**
 * Git sometimes stores an author name as a base64 blob. Such a blob is a
 * single unbroken token, long, and mixes digits with capitals inside the
 * word -- none of which a written name does all at once.
 */
function looksBase64Encoded(name: string): boolean {
  // A written name may contain spaces; an encoded blob never does.
  if (/\s/.test(name)) return false
  // Too short to be anyone's name once decoded.
  if (name.length < 16) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(name)) return false

  // Characters and padding that only appear in encoded data.
  if (name.includes('+') || name.includes('/') || name.endsWith('=')) {
    return true
  }

  // Otherwise demand both digits and an interior capital. A long single-word
  // name such as "GorvekTheIronbane" has the capitals but not the digits.
  return /\d/.test(name) && /[a-z][A-Z]/.test(name)
}

/** The identity a group keeps: the longest readable name, or else the first. */
export function chooseBestCanonical<T extends AuthorRecord>(members: T[]): T {
  const first = members[0]
  if (!first) throw new Error('No authors provided to chooseBestCanonical')

  const readable = members.filter(
    (one) =>
      !hasEncodingArtifacts(one.name) && !hasEncodingArtifacts(one.displayName),
  )

  if (readable.length > 0) {
    return readable.reduce((best, current) =>
      current.displayName.length > best.displayName.length ? current : best,
    )
  }

  return first
}

/**
 * Gather identities the guessing takes to be one person.
 *
 * Each group remembers why its members were drawn in, keyed by the author
 * they were compared against -- the first of the group, which is not
 * necessarily the identity later chosen to keep.
 */
export function groupByGuess(
  allAuthors: AuthorRecord[],
): Array<{ members: AuthorRecord[]; reasons: Map<number, string> }> {
  const processed = new Set<number>()
  const groups: Array<{
    members: AuthorRecord[]
    reasons: Map<number, string>
  }> = []

  for (const author of allAuthors) {
    if (processed.has(author.id)) continue

    const members = [author]
    const reasons = new Map<number, string>()
    processed.add(author.id)

    for (const otherAuthor of allAuthors) {
      if (processed.has(otherAuthor.id)) continue

      const reason = whyAuthorsMatch(author, otherAuthor)
      if (reason) {
        members.push(otherAuthor)
        reasons.set(otherAuthor.id, reason)
        processed.add(otherAuthor.id)
      }
    }

    groups.push({ members, reasons })
  }

  return groups
}

/**
 * Say which identity a group keeps and what each of the others matched on.
 *
 * The reasons are recorded against the author the group formed around, and
 * the identity kept is the longest readable name -- which need not be the
 * same one. When it is not, the seed is itself absorbed, and the reason that
 * applies to it is the one that drew in the identity now being kept.
 */
function describeGroup(
  members: AuthorRecord[],
  canonical: AuthorRecord,
  reasons: Map<number, string>,
): IdentityMerge {
  const seedReason = reasons.get(canonical.id)

  return {
    canonical: { name: canonical.displayName, email: canonical.email },
    absorbed: members
      .filter((candidate) => candidate.id !== canonical.id)
      .map((candidate) => ({
        name: candidate.displayName,
        email: candidate.email,
        reason: reasons.get(candidate.id) ?? seedReason ?? UNEXPLAINED,
      })),
  }
}

/**
 * What a guessing run would merge, without merging anything.
 *
 * Asked of the canonical authors rather than recorded from an earlier run,
 * and that is the point: under the default policy nothing is merged, so
 * there would otherwise be nothing to report -- and a run that reuses its
 * cache never normalises at all. Both of those are exactly when a user is
 * looking at two entries for one person and wondering why.
 */
export function findIdentityGuesses(authors: AuthorRecord[]): IdentityMerge[] {
  const canonical = authors.filter((author) => author.isCanonical)

  const guesses: IdentityMerge[] = []
  for (const group of groupByGuess(canonical)) {
    if (group.members.length < 2) continue
    guesses.push(
      describeGroup(
        group.members,
        chooseBestCanonical(group.members),
        group.reasons,
      ),
    )
  }
  return guesses
}

/**
 * Identities that were merged, read back from what the merging wrote down.
 *
 * The alias rows survive in the cache, so this answers the same question
 * after a reused run as after the run that did the work. The reason is
 * worked out again rather than stored, by the function that made the
 * decision in the first place.
 */
export function describeExistingMerges(
  authors: AuthorRecord[],
  aliases: AliasRecord[],
): IdentityMerge[] {
  const byId = new Map(authors.map((author) => [author.id, author]))

  const merges = new Map<number, IdentityMerge>()
  for (const alias of aliases) {
    const canonical = byId.get(alias.canonicalAuthorId)
    if (!canonical) continue

    let merge = merges.get(canonical.id)
    if (!merge) {
      merge = {
        canonical: { name: canonical.displayName, email: canonical.email },
        absorbed: [],
      }
      merges.set(canonical.id, merge)
    }

    const absorbed: Identity = {
      name: alias.aliasName,
      displayName: alias.aliasName,
      email: alias.aliasEmail,
    }
    merge.absorbed.push({
      name: alias.aliasName,
      email: alias.aliasEmail,
      reason: whyAuthorsMatch(canonical, absorbed) ?? UNEXPLAINED,
    })
  }

  return [...merges.values()]
}

/** The groups a policy makes of the authors. */
function groupsUnder(
  authors: AuthorRecord[],
  policy: AuthorPolicy,
): AuthorRecord[][] {
  if (policy === 'loose') {
    return groupByGuess(authors).map((group) => group.members)
  }

  const byEmail = new Map<string, AuthorRecord[]>()
  for (const author of authors) {
    const email = author.email.toLowerCase().trim()
    const group = byEmail.get(email)
    if (group) group.push(author)
    else byEmail.set(email, [author])
  }
  return [...byEmail.values()]
}

/**
 * What normalising these authors under a policy would write.
 *
 * Every author ends up pointing at a canonical author, including the
 * canonical ones. Aliases are derived entirely from the merges this plan
 * makes, so they are rebuilt rather than added to: a second run over the
 * same authors -- which an incremental cache update does every time --
 * would otherwise record every alias again, and the contributor list would
 * read "also committed as gorvek, gorvek, gorvek".
 */
export function planNormalization(
  authors: AuthorRecord[],
  policy: AuthorPolicy,
): NormalizationPlan {
  const plan: NormalizationPlan = { authors: [], aliases: [], reassign: [] }

  for (const members of groupsUnder(authors, policy)) {
    const canonical = chooseBestCanonical(members)
    plan.authors.push({
      id: canonical.id,
      changes: {
        isCanonical: true,
        canonicalId: canonical.id,
        displayName: canonical.displayName,
      },
    })

    for (const author of members) {
      if (author.id === canonical.id) continue
      plan.authors.push({
        id: author.id,
        changes: { isCanonical: false, canonicalId: canonical.id },
      })
      plan.aliases.push({
        canonicalAuthorId: canonical.id,
        aliasName: author.name,
        aliasEmail: author.email,
      })
      plan.reassign.push({ from: author.id, to: canonical.id })
    }
  }

  return plan
}

/** Decide who is one person under the policy, and write it to the store. */
export async function normalizeAuthors(
  store: AnalysisStore,
  policy: AuthorPolicy,
): Promise<NormalizationPlan> {
  const plan = planNormalization(await store.listAuthors(), policy)
  await store.updateAuthors(plan.authors)
  await store.replaceAliases(plan.aliases)
  for (const { from, to } of plan.reassign) {
    await store.reassignBlame(from, to)
  }
  return plan
}
