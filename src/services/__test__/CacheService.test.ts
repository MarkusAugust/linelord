import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { SCHEMA_VERSION } from '../../adapters/sqlite/database'
import { ANALYSIS_VERSION } from '../analysisVersion'
import {
  computeFingerprint,
  decideCacheUse,
  type Fingerprint,
} from '../CacheService'
import { BLAME_OPTIONS } from '../GitService'

const INPUTS = {
  repositoryRoot: '/nowhere-in-particular',
  headSha: 'a'.repeat(40),
  thresholdBytes: 51200,
  authorPolicy: 'loose' as const,
  ignoredRevisions: [] as string[],
}

describe('computeFingerprint', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('records everything that would change the answer', async () => {
    const fingerprint = await computeFingerprint(INPUTS)

    expect(Object.keys(fingerprint).sort()).toEqual([
      'analysis_version',
      'author_policy',
      'blame_options',
      'head_sha',
      'ignore_revs',
      'ignore_rules',
      'mailmap',
      'schema_version',
      'threshold_bytes',
    ])
    expect(fingerprint.analysis_version).toBe(String(ANALYSIS_VERSION))
    expect(fingerprint.schema_version).toBe(String(SCHEMA_VERSION))
  })

  it('hashes the blame options the analysis actually runs', async () => {
    // Derived from the array GitService passes, not a copy of it, so adding
    // -M or -C invalidates caches without anyone remembering to.
    const fingerprint = await computeFingerprint(INPUTS)

    expect(fingerprint.blame_options).toBe(
      createHash('sha256').update(BLAME_OPTIONS.join(' ')).digest('hex'),
    )
  })

  it('is stable across calls with the same inputs', async () => {
    expect(await computeFingerprint(INPUTS)).toEqual(
      await computeFingerprint(INPUTS),
    )
  })

  it('notices a .mailmap appearing, changing and disappearing', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'first', write: { 'a.ts': 'const a = 1\n' } })
    const inputs = { ...INPUTS, repositoryRoot: repo.path }
    const mailmap = join(repo.path, '.mailmap')

    const absent = await computeFingerprint(inputs)
    expect(absent.mailmap).toBe('')

    await writeFile(
      mailmap,
      'Gorvek <gorvek@ashendale.realm> <old@example.com>\n',
    )
    const present = await computeFingerprint(inputs)
    expect(present.mailmap).not.toBe('')

    await writeFile(
      mailmap,
      'Gorvek <gorvek@ashendale.realm> <other@example.com>\n',
    )
    const edited = await computeFingerprint(inputs)
    expect(edited.mailmap).not.toBe(present.mailmap)
  })

  it('is a different analysis once blame is told to look past a commit', async () => {
    // Ignoring a reformatting moves every line it touched to a different
    // author and a different date. A stored analysis from before that answers
    // a question nobody is asking any more.
    const before = await computeFingerprint(INPUTS)

    const after = await computeFingerprint({
      ...INPUTS,
      ignoredRevisions: ['b'.repeat(40)],
    })

    expect(after.ignore_revs).not.toBe(before.ignore_revs)
  })

  it('does not care what order the commits were listed in', async () => {
    // The set is what matters. Throwing away a cache because two lines of
    // .git-blame-ignore-revs were swapped would be a cache wasted.
    const one = await computeFingerprint({
      ...INPUTS,
      ignoredRevisions: ['b'.repeat(40), 'c'.repeat(40)],
    })
    const other = await computeFingerprint({
      ...INPUTS,
      ignoredRevisions: ['c'.repeat(40), 'b'.repeat(40)],
    })

    expect(other.ignore_revs).toBe(one.ignore_revs ?? '')
  })

  it('refuses to guess when a file exists but cannot be read', async () => {
    // Unreadable is not the same as absent. Treating it as absent would let a
    // cache written while the file was genuinely missing be reused now that it
    // exists and says something unknown -- the one outcome the fingerprint is
    // there to prevent. A directory in the file's place gives EISDIR, which is
    // an error in every environment rather than only for an unprivileged user.
    repo = await createTestRepo()
    await repo.commit({ message: 'first', write: { 'a.ts': 'const a = 1\n' } })
    await mkdir(join(repo.path, '.mailmap'))

    await expect(
      computeFingerprint({ ...INPUTS, repositoryRoot: repo.path }),
    ).rejects.toThrow()
  })
})

describe('decideCacheUse', () => {
  const current: Fingerprint = {
    schema_version: '1',
    analysis_version: '1',
    head_sha: 'a'.repeat(40),
    threshold_bytes: '51200',
    author_policy: 'loose',
    blame_options: 'options-hash',
    mailmap: '',
    ignore_rules: 'rules-hash',
  }

  it('analyses when there is nothing stored', () => {
    expect(decideCacheUse(null, current)).toEqual({
      action: 'analyse',
      reason: 'no-cache',
    })
    expect(decideCacheUse({}, current)).toEqual({
      action: 'analyse',
      reason: 'no-cache',
    })
  })

  it('reuses when nothing has moved at all', () => {
    expect(decideCacheUse({ ...current }, current)).toEqual({
      action: 'reuse',
    })
  })

  it('asks for an update when only the revision moved', () => {
    // The one difference that means the repository moved on rather than that
    // the stored answer describes a question nobody asked.
    const stored = { ...current, head_sha: 'b'.repeat(40) }

    expect(decideCacheUse(stored, current)).toEqual({
      action: 'update',
      storedHeadSha: 'b'.repeat(40),
    })
  })

  it('explains a threshold change in the units the user typed', () => {
    const stored = { ...current, threshold_bytes: '204800' }
    const decision = decideCacheUse(stored, current)

    expect(decision.action).toBe('analyse')
    expect(decision.action === 'analyse' && decision.reason).toBe(
      'settings-changed',
    )
    expect(
      decision.action === 'analyse' &&
        decision.reason === 'settings-changed' &&
        decision.explanation,
    ).toBe('the size threshold changed from 200 KB to 50 KB')
  })

  it('says which way a .mailmap went', () => {
    const added = decideCacheUse({ ...current, mailmap: 'hash' }, current)
    const removed = decideCacheUse(
      { ...current, mailmap: '' },
      { ...current, mailmap: 'hash' },
    )

    expect(
      added.action === 'analyse' &&
        added.reason === 'settings-changed' &&
        added.explanation,
    ).toBe('the .mailmap was removed')
    expect(
      removed.action === 'analyse' &&
        removed.reason === 'settings-changed' &&
        removed.explanation,
    ).toBe('a .mailmap was added')
  })

  it('reports every changed key, not just the first', () => {
    const stored = {
      ...current,
      threshold_bytes: '204800',
      author_policy: 'strict',
    }
    const decision = decideCacheUse(stored, current)

    expect(
      decision.action === 'analyse' &&
        decision.reason === 'settings-changed' &&
        decision.changed,
    ).toEqual(['author_policy', 'threshold_bytes'])
  })

  it('explains every kind of change in words, not key names', () => {
    // These strings are what the user reads when their cache is thrown away.
    // "settings-changed" on its own tells them nothing they can act on.
    const cases: Array<[Fingerprint, string]> = [
      [
        { author_policy: 'strict' },
        'author matching changed from strict to loose',
      ],
      [
        { analysis_version: '0' },
        'the analysis itself changed in this version of LineLord',
      ],
      [
        { schema_version: '0' },
        'the cache was written by a version with a different database layout',
      ],
      [
        { ignore_rules: 'other' },
        'the rules for which files are analysed changed',
      ],
      [{ blame_options: 'other' }, 'the options blame is run with changed'],
    ]

    for (const [difference, expected] of cases) {
      const decision = decideCacheUse({ ...current, ...difference }, current)

      expect(
        decision.action === 'analyse' &&
          decision.reason === 'settings-changed' &&
          decision.explanation,
      ).toBe(expected)
    }
  })

  it('describes a .mailmap that changed rather than appeared or vanished', () => {
    const changed = decideCacheUse(
      { ...current, mailmap: 'before' },
      { ...current, mailmap: 'after' },
    )

    expect(
      changed.action === 'analyse' &&
        changed.reason === 'settings-changed' &&
        changed.explanation,
    ).toBe('the .mailmap changed')
  })

  it('names an unfamiliar key rather than saying nothing about it', () => {
    // A key added later, before anyone writes wording for it, still has to
    // produce something a user can read.
    const decision = decideCacheUse(
      { ...current, future_setting: 'old' },
      { ...current, future_setting: 'new' },
    )

    expect(
      decision.action === 'analyse' &&
        decision.reason === 'settings-changed' &&
        decision.explanation,
    ).toBe('future_setting changed')
  })

  it('treats a key the stored cache never had as changed', () => {
    // A cache written before a key existed recorded no opinion about it.
    // Taking silence for agreement would reuse an analysis run under settings
    // nobody wrote down.
    const stored = { ...current }
    delete stored.ignore_rules

    expect(decideCacheUse(stored, current).action).toBe('analyse')
  })

  it('does not reuse a cache that never recorded a revision', () => {
    const stored = { ...current }
    delete stored.head_sha

    expect(decideCacheUse(stored, current)).toEqual({
      action: 'analyse',
      reason: 'no-cache',
    })
  })

  it('prefers a full analysis when settings and revision both moved', () => {
    // Both differing means the stored answer cannot be updated into the
    // current one: the incremental path assumes everything but the revision
    // held still.
    const stored = {
      ...current,
      head_sha: 'b'.repeat(40),
      threshold_bytes: '204800',
    }

    expect(decideCacheUse(stored, current).action).toBe('analyse')
  })
})
