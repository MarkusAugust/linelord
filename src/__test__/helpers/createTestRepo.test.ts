import { afterEach, describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTestRepo, type TestRepo, toGitDate } from './createTestRepo'

describe('createTestRepo', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('starts on the requested branch regardless of the developer global config', async () => {
    repo = await createTestRepo({ initialBranch: 'main' })
    await repo.commit({ message: 'first', write: { 'a.ts': 'const a = 1\n' } })

    const branch = (
      await repo.git(['rev-parse', '--abbrev-ref', 'HEAD'])
    ).trim()
    expect(branch).toBe('main')
  })

  it('attributes each commit to the author it was given', async () => {
    repo = await createTestRepo()
    const gorvek = {
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
    }
    const nightshroud = {
      name: 'Sister Nightshroud',
      email: 'nightshroud@alderstone.realm',
    }

    await repo.commit({
      message: 'gorvek writes',
      author: gorvek,
      write: { 'a.ts': 'const a = 1\n' },
    })
    await repo.commit({
      message: 'nightshroud writes',
      author: nightshroud,
      write: { 'b.ts': 'const b = 2\n' },
    })

    const log = await repo.git(['log', '--format=%aN <%aE>', '--reverse'])
    expect(log.trim().split('\n')).toEqual([
      `${gorvek.name} <${gorvek.email}>`,
      `${nightshroud.name} <${nightshroud.email}>`,
    ])
  })

  it('uses the commit dates it is given, so age assertions are deterministic', async () => {
    repo = await createTestRepo()
    const old = new Date('2020-03-01T12:00:00Z')
    const recent = new Date('2024-11-15T08:30:00Z')

    await repo.commit({
      message: 'ancient',
      date: old,
      write: { 'ancient.ts': 'const ancient = true\n' },
    })
    await repo.commit({
      message: 'recent',
      date: recent,
      write: { 'recent.ts': 'const recent = true\n' },
    })

    const timestamps = (await repo.git(['log', '--format=%at', '--reverse']))
      .trim()
      .split('\n')
      .map(Number)

    expect(timestamps).toEqual([
      Math.floor(old.getTime() / 1000),
      Math.floor(recent.getTime() / 1000),
    ])
  })

  it('round-trips paths with spaces, non-ASCII characters, dollar signs and newlines', async () => {
    repo = await createTestRepo()
    const awkwardPaths = [
      'filnavn med mellomrom.ts',
      'åpen fil.ts',
      'smørbrød/lørdag.ts',
      'product.$id.tsx',
      'navn\nmed\nnewline.ts',
    ]

    const write: Record<string, string> = {}
    for (const path of awkwardPaths) {
      write[path] = `// ${path}\n`
    }
    await repo.commit({ message: 'awkward paths', write })

    // -z is the only listing that survives these names; the default output
    // would quote the non-ASCII ones and split the newline across two entries.
    const listed = (await repo.git(['ls-files', '-z']))
      .split('\0')
      .filter(Boolean)

    expect(listed.sort()).toEqual([...awkwardPaths].sort())
  })

  it('stores binary content byte for byte', async () => {
    repo = await createTestRepo()
    // A PNG header followed by a NUL byte: git must treat this as binary.
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe,
    ])

    await repo.commit({ message: 'add binary', write: { 'logo.png': bytes } })

    const onDisk = await readFile(join(repo.path, 'logo.png'))
    expect(new Uint8Array(onDisk)).toEqual(bytes)

    const numstat = await repo.git(['show', '--numstat', '--format=', 'HEAD'])
    // git reports binary files as "-\t-\t<path>" rather than line counts.
    expect(numstat).toContain('-\t-\tlogo.png')
  })

  it('records rewrites and deletions as blame-visible changes', async () => {
    repo = await createTestRepo()
    const author = {
      name: 'Zygofer the Defiler',
      email: 'zygofer@ashendale.realm',
    }

    await repo.commit({
      message: 'four lines',
      write: { 'doomed.ts': 'one\ntwo\nthree\nfour\n', 'kept.ts': 'kept\n' },
    })
    await repo.commit({
      message: 'rewrite down to two lines',
      author,
      write: { 'doomed.ts': 'one\nrewritten\n' },
    })

    const blame = await repo.git([
      'blame',
      '--porcelain',
      'HEAD',
      '--',
      'doomed.ts',
    ])
    expect(blame).toContain(`author ${author.name}`)
    expect(blame).not.toContain('\tthree')
    expect(blame).not.toContain('\tfour')

    await repo.commit({ message: 'delete it', remove: ['doomed.ts'] })

    const tracked = (await repo.git(['ls-files', '-z']))
      .split('\0')
      .filter(Boolean)
    expect(tracked).toEqual(['kept.ts'])
  })

  it('rejects an unparseable commit date instead of silently using now', async () => {
    expect(() => toGitDate('ikke en dato')).toThrow()
  })
})
