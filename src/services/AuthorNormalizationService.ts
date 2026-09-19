import { eq } from 'drizzle-orm'
import { distance } from 'fastest-levenshtein'
import type { LineLordDatabase } from '../db/database'
import { type Author, authorAliases, authors, blameLines } from '../db/schema'

/** One person the guessing decided several identities add up to. */
export interface IdentityMerge {
  canonical: { name: string; email: string }
  absorbed: Array<{ name: string; email: string; reason: string }>
}

/** The parts of an identity the matching actually looks at. */
type IdentityRow = { name: string; displayName: string; email: string }

export class AuthorNormalizationService {
  constructor(private db: LineLordDatabase) {}

  /**
   * What a guessing run would merge, without merging anything.
   *
   * This is a question asked of the stored authors rather than a record of
   * what some earlier call happened to do, and that is the point: under the
   * default policy nothing is merged, so there would otherwise be nothing to
   * report -- and a run that reuses its cache never calls the normalisation at
   * all. Both of those are exactly when a user is looking at two entries for
   * one person and wondering why.
   */
  async findIdentityGuesses(): Promise<IdentityMerge[]> {
    const canonicalAuthors = (await this.db.select().from(authors)).filter(
      (author) => author.isCanonical,
    )

    const guesses: IdentityMerge[] = []
    for (const group of this.groupByGuess(canonicalAuthors)) {
      if (group.members.length < 2) continue
      guesses.push(
        this.describeGroup(
          group.members,
          this.chooseBestCanonical(group.members),
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
  async describeExistingMerges(): Promise<IdentityMerge[]> {
    const allAuthors = await this.db.select().from(authors)
    const byId = new Map(allAuthors.map((author) => [author.id, author]))
    const aliases = await this.db.select().from(authorAliases)

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

      const absorbed: IdentityRow = {
        name: alias.aliasName,
        displayName: alias.aliasName,
        email: alias.aliasEmail,
      }
      merge.absorbed.push({
        name: alias.aliasName,
        email: alias.aliasEmail,
        reason:
          this.whyAuthorsMatch(canonical, absorbed) ??
          'they were taken to be one',
      })
    }

    return [...merges.values()]
  }

  /**
   * Group the identities in the database into people.
   *
   * `strict` is the default and compares email addresses, nothing else. Two
   * commits are the same person when git says they are, and `.mailmap` -- which
   * blame applies before LineLord sees a single line -- is how anyone says
   * otherwise. That makes the merging explicit, reviewable, and the same
   * identity git itself uses everywhere.
   *
   * `loose` additionally guesses, from names and from addresses that merely
   * resemble each other, and it guesses badly. Measured on realistic pairs, it
   * merged mk@ with ml@, john@ with joan@, and erik.hansen@ with erika.hansen@
   * -- different people, one of whom then vanishes from the ranking while the
   * other is credited with their work. The threshold for an address is one
   * character in a prefix of six or fewer, which in a company where everyone
   * shares a domain is not an edge case.
   *
   * It is kept, behind a flag, because a repository whose history genuinely
   * contains one person under several spellings has to get out of that
   * somehow, and seeing the guesses is how you learn what to write in a
   * .mailmap. It is not a default.
   */
  async normalizeAllAuthors(
    policy: 'strict' | 'loose' = 'strict',
  ): Promise<void> {
    // Aliases are derived entirely from the merges this run is about to make,
    // so they are rebuilt rather than added to. Without this a second run over
    // the same authors -- which an incremental cache update does every time --
    // records every alias again, and the contributor list ends up reading
    // "also committed as gorvek, gorvek, gorvek".
    await this.db.delete(authorAliases)

    const allAuthors = await this.db.select().from(authors)

    if (policy === 'strict') {
      await this.normalizeByExactEmail(allAuthors)
    } else {
      await this.normalizeByFuzzyMatching(allAuthors)
    }
  }

  private async normalizeByExactEmail(allAuthors: Author[]): Promise<void> {
    const emailGroups = new Map<string, Author[]>()

    for (const author of allAuthors) {
      const email = author.email.toLowerCase().trim()
      if (!emailGroups.has(email)) {
        emailGroups.set(email, [])
      }
      const group = emailGroups.get(email)
      if (group) {
        group.push(author)
      }
    }

    for (const [_email, authorsWithSameEmail] of emailGroups) {
      if (authorsWithSameEmail.length > 1) {
        await this.mergeAuthors(authorsWithSameEmail)
      } else if (authorsWithSameEmail.length === 1) {
        const singleAuthor = authorsWithSameEmail[0]
        if (singleAuthor) {
          await this.makeCanonical(singleAuthor)
        }
      }
    }
  }

  private async normalizeByFuzzyMatching(allAuthors: Author[]): Promise<void> {
    for (const group of this.groupByGuess(allAuthors)) {
      if (group.members.length > 1) {
        await this.mergeAuthors(group.members)
      } else if (group.members[0]) {
        await this.makeCanonical(group.members[0])
      }
    }
  }

  /**
   * Gather identities the guessing takes to be one person.
   *
   * Pulled out of the merging so that asking the question and acting on the
   * answer are the same code: what the interface warns about and what
   * --fuzzy-authors actually does can then not drift apart.
   *
   * Each group remembers why its members were drawn in, keyed by the author
   * they were compared against -- the first of the group, which is not
   * necessarily the identity later chosen to keep.
   */
  private groupByGuess(
    allAuthors: Author[],
  ): Array<{ members: Author[]; reasons: Map<number, string> }> {
    const processed = new Set<number>()
    const groups: Array<{ members: Author[]; reasons: Map<number, string> }> =
      []

    for (const author of allAuthors) {
      if (processed.has(author.id)) continue

      const members = [author]
      const reasons = new Map<number, string>()
      processed.add(author.id)

      for (const otherAuthor of allAuthors) {
        if (processed.has(otherAuthor.id)) continue

        const reason = this.whyAuthorsMatch(author, otherAuthor)
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
  private describeGroup(
    members: Author[],
    canonical: Author,
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
          reason:
            reasons.get(candidate.id) ??
            seedReason ??
            'they were taken to be one',
        })),
    }
  }

  /**
   * Why two rows were taken to be one person, or null if they were not.
   *
   * The reason is returned rather than a yes, because a guess nobody can
   * inspect is a guess nobody can correct. It is what the interface shows and
   * what --write-mailmap turns into a file.
   */
  private whyAuthorsMatch(
    author1: IdentityRow,
    author2: IdentityRow,
  ): string | null {
    if (author1.email.toLowerCase() === author2.email.toLowerCase()) {
      return 'the same address, written differently'
    }

    const name1 = this.cleanName(author1.name)
    const name2 = this.cleanName(author2.name)
    const displayName1 = this.cleanName(author1.displayName)
    const displayName2 = this.cleanName(author2.displayName)

    const namePairs = [
      [name1, name2],
      [name1, displayName2],
      [displayName1, name2],
      [displayName1, displayName2],
    ]

    for (const [n1, n2] of namePairs) {
      if (n1 && n2 && this.areStringsSimilar(n1, n2, false)) {
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

      if (this.areStringsSimilar(email1Prefix, email2Prefix, true)) {
        return `the addresses "${email1Prefix}" and "${email2Prefix}" are alike at ${email1Domain}`
      }
    }

    return null
  }

  private areStringsSimilar(
    str1: string,
    str2: string,
    isEmail: boolean,
  ): boolean {
    if (!str1 || !str2) return false
    if (str1 === str2) return true

    // Clean strings - just remove separators and numbers
    const clean1 = str1
      .toLowerCase()
      .replace(/[._-]/g, '')
      .replace(/[0-9]/g, '')
    const clean2 = str2
      .toLowerCase()
      .replace(/[._-]/g, '')
      .replace(/[0-9]/g, '')

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

  private cleanName(name: string): string {
    return name
      .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  private async mergeAuthors(authorsToMerge: Author[]): Promise<Author> {
    const canonical = this.chooseBestCanonical(authorsToMerge)

    await this.db
      .update(authors)
      .set({
        isCanonical: true,
        canonicalId: canonical.id,
        displayName: canonical.displayName,
      })
      .where(eq(authors.id, canonical.id))

    for (const author of authorsToMerge) {
      if (author.id !== canonical.id) {
        await this.db
          .update(authors)
          .set({
            isCanonical: false,
            canonicalId: canonical.id,
          })
          .where(eq(authors.id, author.id))

        await this.db.insert(authorAliases).values({
          canonicalAuthorId: canonical.id,
          aliasName: author.name,
          aliasEmail: author.email,
          similarity: 100,
        })

        await this.db
          .update(blameLines)
          .set({ authorId: canonical.id })
          .where(eq(blameLines.authorId, author.id))
      }
    }

    return canonical
  }

  private chooseBestCanonical(authors: Author[]): Author {
    if (authors.length === 0) {
      throw new Error('No authors provided to chooseBestCanonical')
    }

    const readableAuthors = authors.filter(
      (a) =>
        !this.hasEncodingArtifacts(a.name) &&
        !this.hasEncodingArtifacts(a.displayName),
    )

    if (readableAuthors.length > 0) {
      return readableAuthors.reduce((best, current) =>
        current.displayName.length > best.displayName.length ? current : best,
      )
    }

    const firstAuthor = authors.find((author) => author !== undefined)
    if (!firstAuthor) {
      throw new Error('No valid authors found in the array')
    }

    return firstAuthor
  }

  /**
   * Whether a name looks like something other than a name a person wrote.
   *
   * The previous check stripped whitespace before testing the result against
   * the base64 alphabet, so "Gorvek the Ironbane" collapsed to
   * "GorvektheIronbane" and matched exactly as an encoded blob would. Every
   * plain ASCII name was therefore classed as an artifact, chooseBestCanonical
   * was left with no readable candidate, and it fell back to insertion order --
   * crowning the gibberish it was written to avoid.
   */
  private hasEncodingArtifacts(name: string): boolean {
    const trimmed = name.trim()
    if (trimmed === '') return false

    // Characters that no name written in a Latin script should contain.
    const hasWeirdChars = /[^\w\s\u00C0-\u017F\u0100-\u024F.\-']/.test(trimmed)

    return hasWeirdChars || this.looksBase64Encoded(trimmed)
  }

  /**
   * Git sometimes stores an author name as a base64 blob. Such a blob is a
   * single unbroken token, long, and mixes digits with capitals inside the
   * word -- none of which a written name does all at once.
   */
  private looksBase64Encoded(name: string): boolean {
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

  private async makeCanonical(author: Author): Promise<void> {
    await this.db
      .update(authors)
      .set({
        isCanonical: true,
        canonicalId: author.id,
      })
      .where(eq(authors.id, author.id))
  }
}
