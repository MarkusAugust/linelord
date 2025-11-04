import { eq } from 'drizzle-orm'
import { distance } from 'fastest-levenshtein'
import type { LineLordDatabase } from '../db/database'
import { type Author, authorAliases, authors, blameLines } from '../db/schema'

export class AuthorNormalizationService {
  constructor(private db: LineLordDatabase) {}

  async normalizeAllAuthors(
    policy: 'strict' | 'loose' = 'loose',
  ): Promise<void> {
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
    const processed = new Set<number>()

    for (const author of allAuthors) {
      if (processed.has(author.id)) continue

      const similarAuthors = [author]
      processed.add(author.id)

      for (const otherAuthor of allAuthors) {
        if (processed.has(otherAuthor.id)) continue

        if (this.areAuthorsSimilar(author, otherAuthor)) {
          similarAuthors.push(otherAuthor)
          processed.add(otherAuthor.id)
        }
      }

      if (similarAuthors.length > 1) {
        await this.mergeAuthors(similarAuthors)
      } else {
        await this.makeCanonical(author)
      }
    }
  }

  private areAuthorsSimilar(author1: Author, author2: Author): boolean {
    if (author1.email.toLowerCase() === author2.email.toLowerCase()) {
      return true
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
        return true
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
        return true
      }
    }

    return false
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

  private async mergeAuthors(authorsToMerge: Author[]): Promise<void> {
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

  private hasEncodingArtifacts(name: string): boolean {
    const base64Pattern = /^[A-Za-z0-9+/=]+$/
    const hasWeirdChars = /[^\w\s\u00C0-\u017F\u0100-\u024F.-]/.test(name)

    return base64Pattern.test(name.replace(/\s/g, '')) || hasWeirdChars
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
