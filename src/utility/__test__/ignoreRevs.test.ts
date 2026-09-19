import { afterEach, describe, expect, it } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import {
  IGNORE_REVS_FILENAME,
  ignoreRevArguments,
  parseIgnoreRevsFile,
  resolveIgnoreRevs,
} from '../ignoreRevs'

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

    const result = await resolveIgnoreRevs(repo.path)

    expect(result).toEqual({ revisions: [], usedFile: false, unresolved: [] })
  })

  it('reads the commits the repository asks to be looked past', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await writeFile(
      join(repo.path, IGNORE_REVS_FILENAME),
      `# not authorship\n${reformat}\n`,
    )

    const result = await resolveIgnoreRevs(repo.path)

    expect(result.revisions).toEqual([reformat])
    expect(result.usedFile).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it('answers the same however the commit was spelled', async () => {
    // A short hash, a full one and a tag are one commit, and the answer has to
    // be the same for all three -- it decides whether a stored analysis may be
    // reused, and a cache thrown away over a spelling is a cache wasted.
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await repo.git(['tag', 'the-reformatting', reformat])

    const full = await resolveIgnoreRevs(repo.path, [reformat])
    const short = await resolveIgnoreRevs(repo.path, [reformat.slice(0, 8)])
    const tag = await resolveIgnoreRevs(repo.path, ['the-reformatting'])

    expect(short.revisions).toEqual(full.revisions)
    expect(tag.revisions).toEqual(full.revisions)
  })

  it('names the same commit once, however many times it is listed', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created
    await writeFile(join(repo.path, IGNORE_REVS_FILENAME), `${reformat}\n`)

    const result = await resolveIgnoreRevs(repo.path, [reformat])

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

    const result = await resolveIgnoreRevs(repo.path)

    expect(result.revisions).toEqual([reformat])
    expect(result.unresolved).toEqual(['not a commit at all'])
  })

  it('refuses a name that exists but is not a commit', async () => {
    const { repo: created } = await repoWithAReformatting()
    repo = created
    const blob = (await repo.git(['rev-parse', 'HEAD:f.js'])).trim()

    const result = await resolveIgnoreRevs(repo.path, [blob])

    expect(result.revisions).toEqual([])
    expect(result.unresolved).toEqual([blob])
  })

  it('says the file was not the source when only the flag was used', async () => {
    const { repo: created, reformat } = await repoWithAReformatting()
    repo = created

    const result = await resolveIgnoreRevs(repo.path, [reformat])

    expect(result.usedFile).toBe(false)
    expect(result.revisions).toEqual([reformat])
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
