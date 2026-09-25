import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createNodeFiles } from '../../adapters/fs/nodeFiles'
import { createGit } from '../../adapters/git/spawnGit'
import {
  IGNORE_REVS_FILENAME,
  ignoreRevArguments,
  parseIgnoreRevsFile,
  resolveIgnoreRevs,
} from '../ignoreRevs'

const files = createNodeFiles()

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }

describe('parseIgnoreRevsFile', () => {
  it('reads the commits and leaves the prose alone', () => {
    const contents = [
      '# Reformatting, not authorship.',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb # switched to tabs',
      '   ',
    ].join('\n')

    expect(parseIgnoreRevsFile(contents)).toEqual([
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ])
  })

  it('finds nothing in a file that is all comments', () => {
    expect(parseIgnoreRevsFile('# nothing yet\n\n')).toEqual([])
  })
})

describe('resolveIgnoreRevs', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  /** A repository whose second commit only changed how the code is written. */
  async function repoWithAReformatting() {
    const created = await createTestRepo()
    await created.commit({
      message: 'the real work',
      author: GORVEK,
      date: new Date('2020-01-01T10:00:00Z'),
      write: { 'f.js': "const a = 'alpha'\nconst b = 'beta'\n" },
    })
    const reformat = await created.commit({
      message: 'switch to double quotes',
      author: { name: 'Prettier Bot', email: 'bot@example.com' },
      date: new Date('2026-09-01T10:00:00Z'),
      write: { 'f.js': 'const a = "alpha"\nconst b = "beta"\n' },
    })
    return { repo: created, reformat }
  }

  it('finds nothing when the repository says nothing', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'a\n' } })

    const result = await resolveIgnoreRevs(
      repo.path,
      [],
      createGit(repo.path),
      files,
    )

    expect(result).toEqual({
      revisions: [],
      sources: { file: false, flag: false },
      unresolved: [],
    })
  })

  it('reads the commits the repository asks to be looked past', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await writeFile(
      join(repo.path, IGNORE_REVS_FILENAME),
      `# not authorship\n${reformat}\n`,
    )

    const result = await resolveIgnoreRevs(
      repo.path,
      [],
      createGit(repo.path),
      files,
    )

    expect(result.revisions).toEqual([reformat])
    expect(result.sources).toEqual({ file: true, flag: false })
    expect(result.unresolved).toEqual([])
  })

  it('answers the same however the commit was spelled', async () => {
    // A short hash, a full one and a tag are one commit, and the answer has to
    // be the same for all three -- it decides whether a stored analysis may be
    // reused, and a cache thrown away over a spelling is a cache wasted.
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await repo.git(['tag', 'the-reformatting', reformat])

    const full = await resolveIgnoreRevs(
      repo.path,
      [reformat],
      createGit(repo.path),
      files,
    )
    const short = await resolveIgnoreRevs(
      repo.path,
      [reformat.slice(0, 8)],
      createGit(repo.path),
      files,
    )
    const tag = await resolveIgnoreRevs(
      repo.path,
      ['the-reformatting'],
      createGit(repo.path),
      files,
    )

    expect(short.revisions).toEqual(full.revisions)
    expect(tag.revisions).toEqual(full.revisions)
  })

  it('names the same commit once, however many times it is listed', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await writeFile(join(repo.path, IGNORE_REVS_FILENAME), `${reformat}\n`)

    const result = await resolveIgnoreRevs(
      repo.path,
      [reformat],
      createGit(repo.path),
      files,
    )

    expect(result.revisions).toEqual([reformat])
  })

  it('holds back an entry that names no commit, rather than passing it to git', async () => {
    // git refuses the whole blame over one bad entry -- `fatal: invalid object
    // name` -- and it does so once per file. Passed on, a single typo becomes
    // every file in the repository failing to be read, with nothing on screen
    // to connect the two.
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await writeFile(
      join(repo.path, IGNORE_REVS_FILENAME),
      `${reformat}\nnot a commit at all\n`,
    )

    const result = await resolveIgnoreRevs(
      repo.path,
      [],
      createGit(repo.path),
      files,
    )

    expect(result.revisions).toEqual([reformat])
    expect(result.unresolved).toEqual([
      { entry: 'not a commit at all', source: 'file' },
    ])
  })

  it('refuses a name that exists but is not a commit', async () => {
    const { repo: created } = await repoWithAReformatting()
    repo = created
    const blob = (await repo.git(['rev-parse', 'HEAD:f.js'])).trim()

    const result = await resolveIgnoreRevs(
      repo.path,
      [blob],
      createGit(repo.path),
      files,
    )

    expect(result.revisions).toEqual([])
    expect(result.unresolved).toEqual([{ entry: blob, source: 'flag' }])
  })

  it('says the file was not the source when only the flag was used', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created

    const result = await resolveIgnoreRevs(
      repo.path,
      [reformat],
      createGit(repo.path),
      files,
    )

    expect(result.sources).toEqual({ file: false, flag: true })
    expect(result.revisions).toEqual([reformat])
  })

  it('remembers which source named each commit, when both did', async () => {
    // Otherwise a run that used both says everything came from the file, and
    // a run with only the flag blames a file that may not even exist.
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    const first = await repo.git(['rev-parse', 'HEAD~1'])
    await writeFile(join(repo.path, IGNORE_REVS_FILENAME), `${reformat}\n`)

    const result = await resolveIgnoreRevs(
      repo.path,
      [first.trim()],
      createGit(repo.path),
      files,
    )

    expect(result.sources).toEqual({ file: true, flag: true })
    expect(result.revisions).toHaveLength(2)
  })

  it('says a bad entry came from the flag when there is no file at all', async () => {
    const { repo: created } = await repoWithAReformatting()
    repo = created

    const result = await resolveIgnoreRevs(
      repo.path,
      ['not a commit'],
      createGit(repo.path),
      files,
    )

    expect(result.sources.file).toBe(false)
    expect(result.unresolved).toEqual([
      { entry: 'not a commit', source: 'flag' },
    ])
  })

  it('refuses to guess when the file is there but cannot be read', async () => {
    // Carrying on would analyse without the ignore set the repository asked
    // for -- wrong ownership on every screen, and stored in the cache as
    // though it were right. The same mistake as treating an unreadable
    // .mailmap as absent, and with a louder consequence.
    const { repo: created } = await repoWithAReformatting()
    repo = created
    await mkdir(join(repo.path, IGNORE_REVS_FILENAME))

    await expect(
      resolveIgnoreRevs(repo.path, [], createGit(repo.path), files),
    ).rejects.toThrow()
  })
})

describe('ignoreRevArguments', () => {
  it('gives blame one flag per commit', () => {
    expect(ignoreRevArguments(['aaa', 'bbb'])).toEqual([
      '--ignore-rev',
      'aaa',
      '--ignore-rev',
      'bbb',
    ])
  })

  it('gives blame nothing when there is nothing to ignore', () => {
    expect(ignoreRevArguments([])).toEqual([])
  })
})
