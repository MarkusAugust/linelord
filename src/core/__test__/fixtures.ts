import type {
  AliasRecord,
  AnalysisData,
  AuthorRecord,
  BlameLineRecord,
  FileRecord,
} from '../model'

/**
 * Building an analysis by hand, for tests of the arithmetic.
 *
 * The core is tested on values rather than on a seeded database, because
 * what is under test is that a median is the middle and a share is a share
 * -- and those should be stateable as input and expected output, not
 * inferred from a repository.
 */

export function author(
  id: number,
  overrides: Partial<AuthorRecord> & { name: string; email: string },
): AuthorRecord {
  return {
    id,
    displayName: overrides.name,
    canonicalId: id,
    isCanonical: true,
    title: null,
    rank: null,
    percentage: 0,
    ...overrides,
  }
}

export function file(
  id: number,
  path: string,
  overrides: Partial<FileRecord> = {},
): FileRecord {
  const dot = path.lastIndexOf('.')
  return {
    id,
    path,
    extension: dot > 0 ? path.slice(dot).toLowerCase() : null,
    size: 100,
    isBinary: false,
    isIgnored: false,
    isLargerThanThreshold: false,
    analysisFailed: false,
    totalLines: 0,
    ...overrides,
  }
}

/**
 * Lines, numbered in the order they are given, with ids to match.
 *
 * `give(fileId, authorId, count, timestamps?)` adds `count` lines; the
 * timestamps default to null, which is what a line whose commit time was
 * never recorded has.
 */
export function lines(
  ...groups: Array<{
    fileId: number
    authorId: number
    count?: number
    timestamps?: Array<number | null>
  }>
): BlameLineRecord[] {
  const result: BlameLineRecord[] = []
  const numberInFile = new Map<number, number>()
  for (const group of groups) {
    const count = group.timestamps?.length ?? group.count ?? 1
    for (let index = 0; index < count; index++) {
      const lineNumber = (numberInFile.get(group.fileId) ?? 0) + 1
      numberInFile.set(group.fileId, lineNumber)
      result.push({
        id: result.length + 1,
        fileId: group.fileId,
        authorId: group.authorId,
        lineNumber,
        commitHash: null,
        commitTimestamp: group.timestamps?.[index] ?? null,
      })
    }
  }
  return result
}

export function analysis(
  parts: Partial<AnalysisData> & { aliases?: AliasRecord[] },
): AnalysisData {
  return {
    files: parts.files ?? [],
    authors: parts.authors ?? [],
    aliases: parts.aliases ?? [],
    lines: parts.lines ?? [],
  }
}
