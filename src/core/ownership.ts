import type { AnalysisData, AuthorRecord } from './model'

/**
 * Who holds what, read off the analysis.
 *
 * Every function here is arithmetic over the values the storage port hands
 * back: no database, no query, nothing that could answer differently from
 * one adapter to the next. The line counts are of lines still alive in the
 * analysed revision, which is the only thing LineLord counts.
 */

export interface RepositoryStats {
  totalFiles: number
  totalAnalyzedFiles: number
  totalBinaryFiles: number
  totalIgnoredFiles: number
  totalLargeFiles: number
  /** Files that were meant to be analysed but could not be read. */
  totalFailedFiles: number
  totalLines: number
  totalAuthors: number
}

export interface AuthorContribution {
  id: number
  name: string
  email: string
  displayName: string
  totalLines: number
  totalFiles: number
  percentage: number
  title: string | null
  rank: number | null
}

export interface FileContribution {
  filename: string
  path: string
  authorLines: number
  totalLines: number
  percentage: number
}

/** Whether a file was actually read: none of binary, ignored, oversized or failed. */
export function wasAnalysed(file: {
  isBinary: boolean
  isIgnored: boolean
  isLargerThanThreshold: boolean
  analysisFailed: boolean
}): boolean {
  return (
    !file.isBinary &&
    !file.isIgnored &&
    !file.isLargerThanThreshold &&
    !file.analysisFailed
  )
}

/**
 * The file categories, each file in exactly one of them.
 *
 * Binary wins over ignored, and ignored over oversized, so that the four
 * skipped categories and the analysed one add up to the number of files.
 */
export function repositoryStats(data: AnalysisData): RepositoryStats {
  let analysed = 0
  let binary = 0
  let ignored = 0
  let large = 0
  let failed = 0
  let totalLines = 0

  for (const file of data.files) {
    if (file.analysisFailed) failed += 1
    if (file.isBinary) binary += 1
    if (file.isIgnored && !file.isBinary) ignored += 1
    if (file.isLargerThanThreshold && !file.isBinary && !file.isIgnored) {
      large += 1
    }
    if (wasAnalysed(file)) {
      analysed += 1
      totalLines += file.totalLines
    }
  }

  // Canonical authors who actually hold lines: the same population the
  // contributor list shows. Counting every author row counted each
  // merged-away identity as a developer, and the two numbers contradicted
  // each other on the same screen.
  const canonical = new Set(
    data.authors.filter((one) => one.isCanonical).map((one) => one.id),
  )
  const holding = new Set<number>()
  for (const line of data.lines) {
    if (canonical.has(line.authorId)) holding.add(line.authorId)
  }

  return {
    totalFiles: data.files.length,
    totalAnalyzedFiles: analysed,
    totalBinaryFiles: binary,
    totalIgnoredFiles: ignored,
    totalLargeFiles: large,
    totalFailedFiles: failed,
    totalLines,
    totalAuthors: holding.size,
  }
}

/**
 * Every canonical author holding at least one line, in rank order.
 *
 * Lines are counted against the id they are stored under. Identity matching
 * moves an absorbed identity's lines to the canonical one, so after it has
 * run this is a person's whole share; before it has, it is exactly what the
 * blame said. An author without a rank yet goes last rather than first,
 * which is where a missing number would otherwise sort.
 */
export function authorContributions(data: AnalysisData): AuthorContribution[] {
  const lines = new Map<number, number>()
  const files = new Map<number, Set<number>>()
  for (const line of data.lines) {
    lines.set(line.authorId, (lines.get(line.authorId) ?? 0) + 1)
    const held = files.get(line.authorId) ?? new Set<number>()
    held.add(line.fileId)
    files.set(line.authorId, held)
  }

  return data.authors
    .filter((author) => author.isCanonical && (lines.get(author.id) ?? 0) > 0)
    .map((author) => ({
      id: author.id,
      name: author.name,
      email: author.email,
      displayName: author.displayName,
      totalLines: lines.get(author.id) ?? 0,
      totalFiles: files.get(author.id)?.size ?? 0,
      percentage: author.percentage,
      title: author.title,
      rank: author.rank,
    }))
    .sort(
      (a, b) =>
        (a.rank ?? Number.POSITIVE_INFINITY) -
          (b.rank ?? Number.POSITIVE_INFINITY) || a.id - b.id,
    )
}

/**
 * The files one person holds lines in, the ones they hold most of first.
 *
 * Every identity folded into the canonical author counts, so that a person
 * who committed from two addresses is one person here. A tie in line count
 * is broken by path, so the answer is the same on every run.
 */
export function fileContributions(
  data: AnalysisData,
  canonicalAuthorId: number,
): FileContribution[] {
  const identities = new Set(
    data.authors
      .filter((author) => author.canonicalId === canonicalAuthorId)
      .map((author) => author.id),
  )

  const held = new Map<number, number>()
  for (const line of data.lines) {
    if (!identities.has(line.authorId)) continue
    held.set(line.fileId, (held.get(line.fileId) ?? 0) + 1)
  }

  const byId = new Map(data.files.map((file) => [file.id, file]))
  const result: FileContribution[] = []
  for (const [fileId, authorLines] of held) {
    const file = byId.get(fileId)
    if (!file) continue
    result.push({
      filename: file.path.split('/').pop() || file.path,
      path: file.path,
      authorLines,
      totalLines: file.totalLines,
      percentage:
        file.totalLines > 0
          ? Math.round((authorLines / file.totalLines) * 100)
          : 0,
    })
  }

  return result.sort(
    (a, b) => b.authorLines - a.authorLines || a.path.localeCompare(b.path),
  )
}

/** The canonical author an address belongs to, through an alias if need be. */
export function findCanonicalAuthorByEmail(
  data: AnalysisData,
  email: string,
): number | null {
  const canonical = data.authors.find(
    (author) => author.isCanonical && author.email === email,
  )
  if (canonical) return canonical.id

  const alias = data.aliases.find((one) => one.aliasEmail === email)
  return alias?.canonicalAuthorId ?? null
}

/** Every canonical author, alphabetically, with the names folded into them. */
export function canonicalAuthors(
  data: AnalysisData,
): Array<AuthorRecord & { aliases: string[] }> {
  return data.authors
    .filter((author) => author.isCanonical)
    .map((author) => ({
      ...author,
      aliases: data.aliases
        .filter((alias) => alias.canonicalAuthorId === author.id)
        .map((alias) => alias.aliasName),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}
