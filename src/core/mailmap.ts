import type { FileSystemPort } from '../ports/files'
import type { IdentityMerge } from './identity'

/**
 * Turning guesses, and decisions, into something git can read.
 *
 * `.mailmap` is how a repository states that several addresses belong to one
 * person. Guessing produces candidates for it, and a person merging warriors
 * by hand produces certainties; this writes either down so it only has to be
 * said once, can be corrected by hand, and is then applied by git itself --
 * to `git shortlog` and `git log` as much as to LineLord.
 */

/**
 * One `.mailmap` line: the identity to keep, and the address it replaces --
 * with the commit name too when the entry being overridden named one.
 */
export function mailmapLine(
  canonical: { name: string; email: string },
  absorbedEmail: string,
  absorbedName: string | null = null,
): string {
  const kept = canonical.name
    ? `${canonical.name} <${canonical.email}>`
    : `<${canonical.email}>`
  const replaced = absorbedName
    ? `${absorbedName} <${absorbedEmail}>`
    : `<${absorbedEmail}>`
  return `${kept} ${replaced}`
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

/** One entry of a `.mailmap`, reduced to what decides where it sends commits. */
interface MailmapEntry {
  /** The commit name the entry is limited to, if it names one. */
  commitName: string | null
  commitEmail: string
  /** The address those commits end up under. */
  resultEmail: string
}

/**
 * The entries of a `.mailmap`, read as git reads them: a line starting with
 * `#` is a comment, and the addresses are what is inside the angle brackets.
 * With one address the entry renames whoever committed under it; with two
 * the first is the identity kept and the second the one it replaces.
 */
function parseMailmap(text: string): MailmapEntry[] {
  const entries: MailmapEntry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue

    const match = /^[^<]*<([^>]*)>(?:([^<]*)<([^>]*)>)?/.exec(line)
    if (!match) continue
    const [, first = '', between = '', second] = match

    if (second === undefined) {
      entries.push({ commitName: null, commitEmail: first, resultEmail: first })
    } else {
      entries.push({
        commitName: between.trim() || null,
        commitEmail: second,
        resultEmail: first,
      })
    }
  }
  return entries
}

/**
 * The lines that make several identities one warrior, shown as `keep`.
 *
 * The absorbed addresses are the ones on screen, which is to say after git
 * has applied the `.mailmap` already there -- and git applies that file once,
 * without following one entry on to the next. An older line sending old@ to
 * an address being absorbed would therefore go on producing the identity the
 * merge was meant to remove. Each such entry gets a line of its own, with the
 * same commit name and address, which git lets override it because it comes
 * later in the file.
 */
export function mergeLines(
  keep: { name: string; email: string },
  absorbedEmails: string[],
  existingMailmap: string,
): string[] {
  const kept = keep.email.toLowerCase()
  const absorbed = new Set(
    absorbedEmails
      .map((email) => email.toLowerCase())
      .filter((email) => email !== kept),
  )

  const lines = new Set<string>()
  for (const email of absorbedEmails) {
    if (absorbed.has(email.toLowerCase())) lines.add(mailmapLine(keep, email))
  }
  for (const entry of parseMailmap(existingMailmap)) {
    if (!absorbed.has(entry.resultEmail.toLowerCase())) continue
    if (entry.commitEmail.toLowerCase() === kept) continue
    lines.add(mailmapLine(keep, entry.commitEmail, entry.commitName))
  }
  return [...lines].sort()
}

/** What the repository's `.mailmap` says now: nothing, when it is not there. */
async function readMailmap(
  repositoryRoot: string,
  files: FileSystemPort,
): Promise<{ path: string; text: string }> {
  const path = `${repositoryRoot}/.mailmap`
  // "Not there" is the usual case the first time, and means there is
  // nothing to preserve. A file that exists but cannot be read -- which on
  // most systems can still be appended to -- is not the same thing at all:
  // carrying on would append lines the file may already have, duplicating
  // the entries this promises to leave alone. The port throws for it.
  return { path, text: (await files.readText(path)) ?? '' }
}

/** Append whichever of `proposed` the file does not already hold. */
async function appendMissing(
  path: string,
  existing: string,
  proposed: string[],
  files: FileSystemPort,
): Promise<MailmapWrite> {
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
    await files.appendText(
      path,
      `${needsNewline ? '\n' : ''}${added.join('\n')}\n`,
    )
  }

  return { path, added, alreadyPresent }
}

/** The lines merging these identities would write, without writing them. */
export async function proposeMerge(
  repositoryRoot: string,
  keep: { name: string; email: string },
  absorbedEmails: string[],
  files: FileSystemPort,
): Promise<string[]> {
  const { text } = await readMailmap(repositoryRoot, files)
  return mergeLines(keep, absorbedEmails, text)
}

/**
 * Record that several identities are one person, shown as `keep`.
 *
 * Nothing links them that a guess could find -- that is why a person is
 * deciding it -- so this takes the decision as given and only writes it
 * down, appending as the draft does and for the same reason.
 */
export async function writeMerge(
  repositoryRoot: string,
  keep: { name: string; email: string },
  absorbedEmails: string[],
  files: FileSystemPort,
): Promise<MailmapWrite> {
  const { path, text } = await readMailmap(repositoryRoot, files)
  return appendMissing(
    path,
    text,
    mergeLines(keep, absorbedEmails, text),
    files,
  )
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
  files: FileSystemPort,
): Promise<MailmapWrite> {
  const { path, text } = await readMailmap(repositoryRoot, files)
  return appendMissing(path, text, mailmapLines(merges), files)
}
