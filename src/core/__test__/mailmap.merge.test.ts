import { afterEach, describe, expect, it } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { lineLord } from '../../__test__/helpers/lineLord'
import { createNodeFiles } from '../../adapters/fs/nodeFiles'
import { mergeLines, proposeMerge, writeMerge } from '../mailmap'
import { authorContributions } from '../ownership'

const files = createNodeFiles()

/**
 * Two identities that share nothing a guess could find: another name, another
 * address, another domain. Only the person who committed under both knows.
 */
const GORVEK = { name: 'Gorvek of Bonereach', email: 'gorvek@firma.no' }
const ASHBORN = {
  name: 'Vurn the Ashborn',
  email: '4711+vurn@users.noreply.github.com',
}
const SARN = { name: 'Sarn the Faceless', email: 'sarn@kell.realm' }

describe('mergeLines', () => {
  it('sends every other address to the identity chosen to be shown', () => {
    expect(mergeLines(GORVEK, [ASHBORN.email, 'gorvek@privat.no'], '')).toEqual(
      [
        'Gorvek of Bonereach <gorvek@firma.no> <4711+vurn@users.noreply.github.com>',
        'Gorvek of Bonereach <gorvek@firma.no> <gorvek@privat.no>',
      ],
    )
  })

  it('also redirects the addresses .mailmap already sent to the one absorbed', () => {
    // git does not follow a .mailmap from one entry to the next. Merging
    // vurn@ into Gorvek while an older line sends old@ to vurn@ would leave
    // old@ counted as Vurn -- a warrior the screen said was gone.
    const existing = 'Vurn the Ashborn <vurn@ash.fall> <old@ash.fall>\n'

    expect(mergeLines(GORVEK, ['vurn@ash.fall'], existing)).toEqual([
      'Gorvek of Bonereach <gorvek@firma.no> <old@ash.fall>',
      'Gorvek of Bonereach <gorvek@firma.no> <vurn@ash.fall>',
    ])
  })

  it('keeps the commit name of an entry that is matched by name as well', () => {
    // An entry naming the commit name too takes precedence over one that
    // names only the address, so the override has to name it as well.
    const existing = 'Vurn the Ashborn <vurn@ash.fall> Vurn <old@ash.fall>\n'

    expect(mergeLines(GORVEK, ['vurn@ash.fall'], existing)).toContain(
      'Gorvek of Bonereach <gorvek@firma.no> Vurn <old@ash.fall>',
    )
  })

  it('matches addresses the way git does, without regard to case', () => {
    const existing = '<VURN@Ash.Fall> <old@ash.fall>\n'

    expect(mergeLines(GORVEK, ['vurn@ash.fall'], existing)).toContain(
      'Gorvek of Bonereach <gorvek@firma.no> <old@ash.fall>',
    )
  })

  it('leaves alone entries that send their address somewhere else, and comments', () => {
    const existing = [
      '# Vurn the Ashborn <vurn@ash.fall> <commented@ash.fall>',
      'Sarn the Faceless <sarn@kell.realm> <sarn@old.realm>',
      'Vurn the Ashborn <vurn@ash.fall>',
      '',
    ].join('\n')

    expect(mergeLines(GORVEK, ['vurn@ash.fall'], existing)).toEqual([
      'Gorvek of Bonereach <gorvek@firma.no> <vurn@ash.fall>',
    ])
  })

  it('writes nothing for the address being kept', () => {
    expect(mergeLines(GORVEK, ['GORVEK@firma.no'], '')).toEqual([])
  })

  it('writes an address alone when the identity kept has no name', () => {
    expect(
      mergeLines({ name: '', email: 'gorvek@firma.no' }, ['x@y'], ''),
    ).toEqual(['<gorvek@firma.no> <x@y>'])
  })
})

describe('writeMerge', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  async function contributors(repoPath: string) {
    const service = lineLord(repoPath, 50 * 1024)
    await service.initialize()
    return authorContributions(service.getAnalysis()).map((one) => ({
      name: one.displayName,
      email: one.email,
      lines: one.totalLines,
    }))
  }

  async function repoWithTwoStrangers() {
    const created = await createTestRepo()
    await created.commit({
      message: 'at the war camp',
      author: GORVEK,
      write: { 'a.ts': 'a\nb\nc\n' },
    })
    await created.commit({
      message: 'from the forge',
      author: ASHBORN,
      write: { 'b.ts': 'd\ne\n' },
    })
    await created.commit({
      message: 'somebody else',
      author: SARN,
      write: { 'c.ts': 'f\n' },
    })
    return created
  }

  it('makes two identities nothing links into one warrior, shown as the one chosen', async () => {
    repo = await repoWithTwoStrangers()
    expect(await contributors(repo.path)).toHaveLength(3)

    const result = await writeMerge(repo.path, GORVEK, [ASHBORN.email], files)

    expect(result.added).toEqual([
      'Gorvek of Bonereach <gorvek@firma.no> <4711+vurn@users.noreply.github.com>',
    ])
    expect(await contributors(repo.path)).toEqual([
      { name: GORVEK.name, email: GORVEK.email, lines: 5 },
      { name: SARN.name, email: SARN.email, lines: 1 },
    ])
  })

  it('can show the other identity instead', async () => {
    repo = await repoWithTwoStrangers()

    await writeMerge(repo.path, ASHBORN, [GORVEK.email], files)

    expect((await contributors(repo.path))[0]).toEqual({
      name: ASHBORN.name,
      email: ASHBORN.email,
      lines: 5,
    })
  })

  it('holds when a warrior who was merged once is merged again', async () => {
    // Merge Vurn into Gorvek, then Gorvek into Sarn. What the screen shows as
    // Gorvek is by then two addresses, and both have to go.
    repo = await repoWithTwoStrangers()
    await writeMerge(repo.path, GORVEK, [ASHBORN.email], files)

    await writeMerge(repo.path, SARN, [GORVEK.email], files)

    expect(await contributors(repo.path)).toEqual([
      { name: SARN.name, email: SARN.email, lines: 6 },
    ])
  })

  it('proposes exactly what it then writes, and writes nothing before', async () => {
    repo = await repoWithTwoStrangers()
    await writeFile(
      join(repo.path, '.mailmap'),
      'Vurn the Ashborn <4711+vurn@users.noreply.github.com> <vurn@old.forge>\n',
    )

    const proposed = await proposeMerge(
      repo.path,
      GORVEK,
      [ASHBORN.email],
      files,
    )
    expect(await readFile(join(repo.path, '.mailmap'), 'utf8')).toBe(
      'Vurn the Ashborn <4711+vurn@users.noreply.github.com> <vurn@old.forge>\n',
    )

    const result = await writeMerge(repo.path, GORVEK, [ASHBORN.email], files)
    expect(result.added).toEqual(proposed)
    // The line somebody wrote by hand is still there, untouched.
    expect(await readFile(result.path, 'utf8')).toStartWith(
      'Vurn the Ashborn <4711+vurn@users.noreply.github.com> <vurn@old.forge>\n',
    )
  })
})
