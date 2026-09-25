import { createHash } from 'node:crypto'
import type { FileSystemPort } from '../ports/files'
import { BLAME_OPTIONS } from '../ports/git'
import { ANALYSIS_VERSION } from './analysisVersion'
import type { AuthorPolicy } from './identity'
import { ignoredFileExtensions, ignoredFilePatterns } from './ignoreFiles'

/**
 * Whether a stored analysis may be reused, and if not, why not.
 *
 * git makes this answerable rather than a matter of judgement: everything is
 * content-addressed, so the question is a comparison of exact keys and not a
 * guess from timestamps. The cost of getting it wrong is asymmetric -- a
 * needless re-analysis costs seconds, while a wrongly reused one puts numbers
 * on screen that look exactly like correct ones -- so every case that cannot
 * be decided falls to a full analysis.
 */

export type { AuthorPolicy }

export interface FingerprintInputs {
  repositoryRoot: string
  /**
   * How the store lays its tables out, as the storage adapter reports it.
   * A cache written under a different layout is thrown out rather than read.
   */
  layoutVersion: string
  headSha: string
  thresholdBytes: number
  authorPolicy: AuthorPolicy
  /**
   * The commits blame is being told to look past, already resolved to full
   * hashes. Resolved rather than as written: the same commit spelled as a
   * short hash, a full one or a tag is one input, and a reworded comment in
   * `.git-blame-ignore-revs` is not an input at all.
   */
  ignoredRevisions: string[]
}

/** Every key is a string, because that is what the meta table stores. */
export type Fingerprint = Record<string, string>

/**
 * The one key that means the repository moved on rather than that the analysis
 * is invalid. Everything else differing means the stored answer describes a
 * question nobody asked.
 */
export const HEAD_KEY = 'head_sha'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** What `ignore_revs` hashes to when there is nothing to look past. */
const EMPTY_IGNORE_REVS = sha256('')

/**
 * Hash a file's contents, or the empty string when it is not there.
 *
 * Absent hashes differently from any content: a repository that never had a
 * .mailmap and one whose .mailmap was deleted are in the same position, and
 * both differ from one that has one. A file that exists but cannot be read
 * is not absent, and the port throws for it: treating it as absent would
 * let a cache written while the file was genuinely missing be reused now
 * that it exists and says something unknown.
 */
async function hashFileIfPresent(
  files: FileSystemPort,
  path: string,
): Promise<string> {
  const contents = await files.readText(path)
  return contents === null ? '' : sha256(contents)
}

/**
 * What the analysis would be run with, right now.
 *
 * Note what is hashed rather than copied: the blame options come from the
 * array GitService actually passes, and the ignore rules from the lists it
 * actually applies. Editing either invalidates caches without anyone
 * remembering to say so — which is the opposite of ANALYSIS_VERSION, and the
 * reason to prefer it wherever the input can be reached.
 */
export async function computeFingerprint(
  inputs: FingerprintInputs,
  files: FileSystemPort,
): Promise<Fingerprint> {
  const {
    repositoryRoot,
    layoutVersion,
    headSha,
    thresholdBytes,
    authorPolicy,
    ignoredRevisions,
  } = inputs

  const ignoreRules = JSON.stringify({
    patterns: [...ignoredFilePatterns].sort(),
    extensions: [...ignoredFileExtensions].sort(),
  })

  return {
    schema_version: layoutVersion,
    analysis_version: String(ANALYSIS_VERSION),
    [HEAD_KEY]: headSha,
    threshold_bytes: String(thresholdBytes),
    author_policy: authorPolicy,
    blame_options: sha256(BLAME_OPTIONS.join(' ')),
    mailmap: await hashFileIfPresent(files, `${repositoryRoot}/.mailmap`),
    // The commits being looked past, not the file that names them. Adding one
    // moves every line it touched to a different author and a different date,
    // so a cache from before the change describes a question nobody asked --
    // and the flag appearing in BLAME_OPTIONS would only catch that once,
    // while the set has to keep being compared every run.
    ignore_revs: sha256([...ignoredRevisions].sort().join(' ')),
    ignore_rules: sha256(ignoreRules),
  }
}

export type CacheDecision =
  /** Nothing stored, or nothing readable. Analyse from scratch. */
  | { action: 'analyse'; reason: 'no-cache' }
  /** Something that changes the answer differs. Analyse from scratch. */
  | {
      action: 'analyse'
      reason: 'settings-changed'
      changed: string[]
      explanation: string
    }
  /** Only the revision moved. A3 decides whether it moved forwards. */
  | { action: 'update'; storedHeadSha: string }
  /** Nothing moved at all. The stored analysis still describes the repository. */
  | { action: 'reuse' }

/** Wording for the keys whose values mean something to a person. */
function describeChange(
  key: string,
  stored: string | undefined,
  current: string,
): string {
  if (key === 'threshold_bytes') {
    const kb = (value: string) => `${Math.round(Number(value) / 1024)} KB`
    return `the size threshold changed from ${kb(stored ?? '0')} to ${kb(current)}`
  }
  if (key === 'author_policy') {
    return `author matching changed from ${stored} to ${current}`
  }
  if (key === 'analysis_version') {
    return 'the analysis itself changed in this version of LineLord'
  }
  if (key === 'schema_version') {
    return 'the cache was written by a version with a different database layout'
  }
  if (key === 'mailmap') {
    return stored === ''
      ? 'a .mailmap was added'
      : current === ''
        ? 'the .mailmap was removed'
        : 'the .mailmap changed'
  }
  if (key === 'ignore_rules') {
    return 'the rules for which files are analysed changed'
  }
  if (key === 'ignore_revs') {
    return stored === EMPTY_IGNORE_REVS
      ? 'commits were added to .git-blame-ignore-revs'
      : current === EMPTY_IGNORE_REVS
        ? 'the commits blame was looking past are gone'
        : 'the commits blame looks past changed'
  }
  if (key === 'blame_options') {
    return 'the options blame is run with changed'
  }
  return `${key} changed`
}

/**
 * Compare a stored fingerprint against the current one.
 *
 * A key the stored fingerprint has never heard of counts as changed. That is
 * the case of a cache written before a key existed, and treating silence as
 * agreement would reuse an analysis run under settings nobody recorded.
 */
export function decideCacheUse(
  stored: Fingerprint | null,
  current: Fingerprint,
): CacheDecision {
  if (!stored || Object.keys(stored).length === 0) {
    return { action: 'analyse', reason: 'no-cache' }
  }

  const changed = Object.keys(current)
    .filter((key) => key !== HEAD_KEY)
    .filter((key) => stored[key] !== current[key])
    .sort()

  if (changed.length > 0) {
    const reasons = changed.map((key) =>
      describeChange(key, stored[key], current[key] ?? ''),
    )
    return {
      action: 'analyse',
      reason: 'settings-changed',
      changed,
      explanation: reasons.join('; '),
    }
  }

  const storedHead = stored[HEAD_KEY]
  if (!storedHead) {
    return { action: 'analyse', reason: 'no-cache' }
  }

  if (storedHead === current[HEAD_KEY]) {
    return { action: 'reuse' }
  }

  return { action: 'update', storedHeadSha: storedHead }
}
