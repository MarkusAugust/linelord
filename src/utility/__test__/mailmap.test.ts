import { afterEach, describe, expect, it } from 'bun:test'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import type { IdentityMerge } from '../../core/identity'
import { canonicalAuthors } from '../../core/ownership'
import { LineLordService } from '../../services/LineLordService'
import { mailmapLines, writeMailmap } from '../mailmap'

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@firma.no' }
const GORVEK_AT_HOME = { name: 'Gorvek Ironbane', email: 'gorvek@privat.no' }
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'night@alderstone.realm',
}

describe('mailmapLines', () => {
  it('writes the identity to keep and the address it replaces', () => {
    const merge: IdentityMerge = {
      canonical: GORVEK,
      absorbed: [{ ...GORVEK_AT_HOME, reason: 'the names are alike' }],
    }

    expect(mailmapLines([merge])).toEqual([
      'Gorvek the Ironbane <gorvek@firma.no> <gorvek@privat.no>',
    ])
  })

  it('leaves out an address that differs only in capitalisation', () => {
    // Those are already one person to LineLord and to git, so an entry would
    // add a line that changes nothing.
    const merge: IdentityMerge = {
      canonical: GORVEK,
      absorbed: [
        {
          name: 'Gorvek',
          email: 'GORVEK@Firma.no',
          reason: 'the same address',
        },
      ],
    }

    expect(mailmapLines([merge])).toEqual([])
  })

  it('says nothing when nothing was merged', () => {
    expect(mailmapLines([])).toEqual([])
  })
})

describe('writeMailmap', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  /** A repository where one person committed under two addresses. */
  async function repoWithTwoAddresses() {
    const created = await createTestRepo()
    await created.commit({
      message: 'at work',
      author: GORVEK,
      write: { 'a.ts': 'a\nb\nc\n' },
    })
    await created.commit({
      message: 'at home',
      author: GORVEK_AT_HOME,
      write: { 'b.ts': 'd\ne\n' },
    })
    await created.commit({
      message: 'somebody else',
      author: NIGHTSHROUD,
      write: { 'c.ts': 'f\n' },
    })
    return created
  }

  async function guessedMerges(repoPath: string) {
    const service = new LineLordService(repoPath, 50 * 1024, {
      authorPolicy: 'loose',
    })
    await service.initialize()
    return service.getIdentityMerges()
  }

  it('records what the guessing found, and leaves other people alone', async () => {
    repo = await repoWithTwoAddresses()

    const result = await writeMailmap(repo.path, await guessedMerges(repo.path))

    expect(result.added).toEqual([
      'Gorvek the Ironbane <gorvek@firma.no> <gorvek@privat.no>',
    ])
    expect(await readFile(result.path, 'utf8')).toContain('gorvek@privat.no')
    // Nightshroud shares nothing with anyone and gets no entry.
    expect(await readFile(result.path, 'utf8')).not.toContain('alderstone')
  })

  it('adds nothing the second time', async () => {
    // Not because of bookkeeping, but because it worked: git applies the file
    // while producing the blame, so the addresses arrive already merged and
    // there is no longer anything to guess about.
    repo = await repoWithTwoAddresses()
    await writeMailmap(repo.path, await guessedMerges(repo.path))

    const second = await writeMailmap(repo.path, await guessedMerges(repo.path))

    expect(second.added).toEqual([])
    const contents = await readFile(second.path, 'utf8')
    expect(contents.trim().split('\n')).toHaveLength(1)
  })

  it('keeps what somebody wrote by hand', async () => {
    // A guess has no business overwriting a decision a person made.
    repo = await repoWithTwoAddresses()
    const existing = 'Someone Else <them@example.com> <old@example.com>\n'
    await writeFile(join(repo.path, '.mailmap'), existing)

    const result = await writeMailmap(repo.path, await guessedMerges(repo.path))

    const contents = await readFile(result.path, 'utf8')
    expect(contents).toContain('Someone Else')
    expect(contents).toContain('gorvek@privat.no')
  })

  it('does not run the lines together when the file lacks a final newline', async () => {
    repo = await repoWithTwoAddresses()
    await writeFile(
      join(repo.path, '.mailmap'),
      'Someone Else <them@example.com> <old@example.com>',
    )

    const result = await writeMailmap(repo.path, await guessedMerges(repo.path))
    const lines = (await readFile(result.path, 'utf8')).trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('Someone Else <them@example.com> <old@example.com>')
  })

  // Root can read a file whatever its mode, so the case cannot be staged.
  const cannotBeRead =
    typeof process.getuid === 'function' && process.getuid() === 0
  it.skipIf(cannotBeRead)(
    'refuses to append when the file is there but cannot be read',
    async () => {
      // A write-only .mailmap can still be appended to. Treating the failed
      // read as "no file yet" would therefore append entries the file already
      // contains, duplicating the very lines this promises to leave alone.
      repo = await repoWithTwoAddresses()
      const path = join(repo.path, '.mailmap')
      await writeFile(
        path,
        'Someone Else <them@example.com> <old@example.com>\n',
      )
      await chmod(path, 0o222)

      await expect(
        writeMailmap(repo.path, await guessedMerges(repo.path)),
      ).rejects.toThrow()

      await chmod(path, 0o644)
    },
  )

  it('writes nothing when everybody has one address', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'alone',
      author: GORVEK,
      write: { 'a.ts': 'a\n' },
    })

    const result = await writeMailmap(repo.path, await guessedMerges(repo.path))

    expect(result.added).toEqual([])
  })
})

describe('the guesses that get written', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('explains each one, because a guess nobody can inspect cannot be corrected', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one address',
      author: GORVEK,
      write: { 'a.ts': 'a\n' },
    })
    await repo.commit({
      message: 'another',
      author: GORVEK_AT_HOME,
      write: { 'b.ts': 'b\n' },
    })

    const service = new LineLordService(repo.path, 50 * 1024, {
      authorPolicy: 'loose',
    })
    await service.initialize()
    const [merge] = service.getIdentityMerges()

    expect(merge?.absorbed[0]?.reason).toBeTruthy()
    expect(merge?.absorbed[0]?.reason).not.toBe('')
  })

  it('is reported under the default too, which shows them without taking them', async () => {
    // The default merges nothing. It still has to say what it saw, or a user
    // faced with two entries for one person has no way to know that the tool
    // noticed and declined to act.
    repo = await createTestRepo()
    await repo.commit({
      message: 'one address',
      author: GORVEK,
      write: { 'a.ts': 'a\n' },
    })
    await repo.commit({
      message: 'another',
      author: GORVEK_AT_HOME,
      write: { 'b.ts': 'b\n' },
    })

    const service = new LineLordService(repo.path)
    await service.initialize()

    expect(service.getIdentityMerges()).toHaveLength(1)
    // Shown, not acted on: both addresses still count separately.
    const authors = canonicalAuthors(service.getAnalysis())
    expect(authors).toHaveLength(2)
  })
})
