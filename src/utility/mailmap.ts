import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IdentityMerge } from '../services/AuthorNormalizationService'

/**
 * Turning guesses into something git can read.
 *
 * `.mailmap` is how a repository states that several addresses belong to one
 * person. Guessing produces candidates for it; this writes them down so the
 * guess only has to be made once, can be corrected by hand, and is then
 * applied by git itself -- to `git shortlog` and `git log` as much as to
 * LineLord.
 */

/** One `.mailmap` line: the identity to keep, and the address it replaces. */
export function mailmapLine(
  canonical: { name: string; email: string },
  absorbedEmail: string,
): string {
  return `${canonical.name} <${canonical.email}> <${absorbedEmail}>`
}

/** Every line a set of merges would add, in a stable order. */
export function mailmapLines(merges: IdentityMerge[]): string[] {
  const lines: string[] = []
  for (const merge of merges) {
    for (const absorbed of merge.absorbed) {
      // An address that is only a difference in capitalisation needs no entry:
      // LineLord already treats those as one, and so does git.
      if (
        absorbed.email.toLowerCase() === merge.canonical.email.toLowerCase()
      ) {
        continue
      }
      lines.push(mailmapLine(merge.canonical, absorbed.email))
    }
  }
  return lines.sort()
}

export interface MailmapWrite {
  path: string
  added: string[]
  /** Lines the file already had, and which were therefore left alone. */
  alreadyPresent: string[]
}

/**
 * Append the lines a repository is missing to its `.mailmap`.
 *
 * Appending rather than replacing, because the file may hold entries somebody
 * wrote by hand and a guess has no business overwriting them. Running it twice
 * adds nothing the second time: once an entry exists, git applies it while
 * producing the blame, so the identities arrive already merged and there is
 * nothing left to guess about.
 */
export async function writeMailmap(
  repositoryRoot: string,
  merges: IdentityMerge[],
): Promise<MailmapWrite> {
  const path = join(repositoryRoot, '.mailmap')
  const proposed = mailmapLines(merges)

  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    // No .mailmap yet, which is the usual case the first time.
  }

  const present = new Set(
    existing
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )

  const added = proposed.filter((line) => !present.has(line))
  const alreadyPresent = proposed.filter((line) => present.has(line))

  if (added.length > 0) {
    const needsNewline = existing.length > 0 && !existing.endsWith('\n')
    await appendFile(path, `${needsNewline ? '\n' : ''}${added.join('\n')}\n`)
  }

  return { path, added, alreadyPresent }
}
