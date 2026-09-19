import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { blameLines, files } from '../../db/schema'
import { GitService } from '../GitService'

type FileRow = {
  path: string
  isBinary: boolean | null
  isIgnored: boolean | null
  isLargerThanThreshold: boolean | null
  totalLines: number | null
}

async function analyse(repoPath: string, thresholdBytes = 50 * 1024) {
  const db = createDatabase()
  await new GitService(repoPath, db, thresholdBytes).initialize()

  const rows: FileRow[] = await db
    .select({
      path: files.path,
      isBinary: files.isBinary,
      isIgnored: files.isIgnored,
      isLargerThanThreshold: files.isLargerThanThreshold,
      totalLines: files.totalLines,
    })
    .from(files)

  const blamed = await db.select({ fileId: blameLines.fileId }).from(blameLines)

  return {
    byPath: new Map(rows.map((row) => [row.path, row])),
    blamedFileCount: new Set(blamed.map((row) => row.fileId)).size,
  }
}

describe('GitService - which files are analysed', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('analyses ordinary source files and records their line count', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'source',
      write: {
        'src/a.ts': 'const one = 1\nconst two = 2\n',
        'src/b.py': 'x = 1\n',
      },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('src/a.ts')?.isIgnored).toBeFalsy()
    expect(byPath.get('src/a.ts')?.isBinary).toBeFalsy()
    expect(byPath.get('src/a.ts')?.totalLines).toBe(2)
    expect(byPath.get('src/b.py')?.totalLines).toBe(1)
  })

  it('does not count blank lines towards a file', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'padded',
      write: { 'src/padded.ts': 'const one = 1\n\n\n   \nconst two = 2\n' },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('src/padded.ts')?.totalLines).toBe(2)
  })

  it('marks binary files by extension and never blames them', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'assets',
      write: {
        'src/a.ts': 'const one = 1\n',
        'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]),
      },
    })

    const { byPath, blamedFileCount } = await analyse(repo.path)

    expect(byPath.get('logo.png')?.isBinary).toBe(true)
    expect(blamedFileCount).toBe(1)
  })

  it('marks generated and lock files as ignored', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'generated',
      write: {
        'src/a.ts': 'const one = 1\n',
        'package-lock.json': '{"lockfileVersion": 3}\n',
        'dist/bundle.js': 'console.log(1)\n',
        'src/app.min.js': 'var a=1\n',
      },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('package-lock.json')?.isIgnored).toBe(true)
    expect(byPath.get('dist/bundle.js')?.isIgnored).toBe(true)
    expect(byPath.get('src/app.min.js')?.isIgnored).toBe(true)
    expect(byPath.get('src/a.ts')?.isIgnored).toBeFalsy()
  })

  it('sets aside files over the size threshold without blaming them', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one small and one large',
      write: {
        'src/small.ts': 'const one = 1\n',
        'src/large.ts': `${'const filler = 1\n'.repeat(200)}`,
      },
    })

    // 200 lines of 17 bytes is about 3.4 KB, so a 1 KB threshold separates them.
    const { byPath, blamedFileCount } = await analyse(repo.path, 1024)

    expect(byPath.get('src/large.ts')?.isLargerThanThreshold).toBe(true)
    expect(byPath.get('src/small.ts')?.isLargerThanThreshold).toBeFalsy()
    expect(blamedFileCount).toBe(1)
  })

  it('analyses paths containing dollar signs, spaces and non-ASCII characters', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'awkward but analysable',
      write: {
        'routes/user.$userId.ts': 'const id = 1\n',
        'src/filnavn med mellomrom.ts': 'const two = 2\n',
      },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('routes/user.$userId.ts')?.totalLines).toBe(1)
    expect(byPath.get('src/filnavn med mellomrom.ts')?.totalLines).toBe(1)
  })

  it('does not ignore a directory whose name merely ends with an ignored one', async () => {
    // The old matcher fell back to `filePath.includes(pattern)`, so `build/`
    // swallowed `rebuild/`, `out/` swallowed `checkout/` and `bin/` swallowed
    // `robin/` -- ordinary source directories, gone from the analysis with no
    // trace. Removing the fallback alone would not have been enough: the regex
    // arm compiled `build/` to /^build\/$/, which matches no real path, so
    // directory rules depended on the fallback entirely.
    repo = await createTestRepo()
    await repo.commit({
      message: 'directories that merely look generated',
      write: {
        'rebuild/index.ts': 'const rebuilt = 1\n',
        'src/checkout/cart.ts': 'const cart = 1\n',
        'src/robin/hood.ts': 'const robin = 1\n',
        'src/layout/Layout.tsx': 'const layout = 1\n',
        'build/output.js': 'console.log(1)\n',
      },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('rebuild/index.ts')?.isIgnored).toBeFalsy()
    expect(byPath.get('src/checkout/cart.ts')?.isIgnored).toBeFalsy()
    expect(byPath.get('src/robin/hood.ts')?.isIgnored).toBeFalsy()
    expect(byPath.get('src/layout/Layout.tsx')?.isIgnored).toBeFalsy()
    // The genuine build directory must still be excluded.
    expect(byPath.get('build/output.js')?.isIgnored).toBe(true)
  })

  it('analyses test files, which the README has always promised to count', async () => {
    // `*.test` is a Go pattern for a compiled test binary. Under the substring
    // fallback it matched any path containing ".test", which excluded every
    // `*.test.ts` in every JavaScript repository -- 15 of them in this one.
    repo = await createTestRepo()
    await repo.commit({
      message: 'tests are code too',
      write: {
        'src/thing.test.ts': 'const t = 1\n',
        'src/thing.spec.ts': 'const s = 1\n',
        'cmd/server.test': 'compiled test binary\n',
      },
    })

    const { byPath } = await analyse(repo.path)

    expect(byPath.get('src/thing.test.ts')?.isIgnored).toBeFalsy()
    expect(byPath.get('src/thing.spec.ts')?.isIgnored).toBeFalsy()
    // A file actually named `<something>.test` is what the pattern meant.
    expect(byPath.get('cmd/server.test')?.isIgnored).toBe(true)
  })
})
