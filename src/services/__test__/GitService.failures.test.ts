import { afterEach, describe, expect, it } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { blameLines, files } from '../../db/schema'
import { GitService } from '../GitService'

/** A file long enough to have overrun SQLite's parameter limit in one insert. */
function longFile(lines: number): string {
  return `${Array.from({ length: lines }, (_, i) => `const a${i} = ${i}`).join(
    '\n',
  )}\n`
}

describe('GitService - long files are stored whole', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('stores every line of a file far past one statement of parameters', async () => {
    // Six columns per row, one placeholder per value. A single values() call
    // for this file asked SQLite to bind 120,000 parameters, the insert threw,
    // the catch swallowed it, and the file contributed nothing at all. Not a
    // crash and not a partial result: zero lines, silently.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a very long file',
      write: { 'src/long.ts': longFile(20000) },
    })

    const db = createDatabase()
    const gitService = new GitService(repo.path, db, 50 * 1024 * 1024)
    await gitService.initialize()

    const stored = await db.select({ id: blameLines.id }).from(blameLines)
    const [row] = await db.select({ total: files.totalLines }).from(files)

    expect(stored).toHaveLength(20000)
    expect(row?.total).toBe(20000)
    expect(gitService.getFailures()).toEqual([])
  })

  it('keeps the stored line count and the stored lines in agreement', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'two files of different lengths',
      write: { 'src/a.ts': longFile(1200), 'src/b.ts': longFile(30) },
    })

    const db = createDatabase()
    await new GitService(repo.path, db, 50 * 1024 * 1024).initialize()

    // The rows and the count on the file row are written in one transaction,
    // so a file can never claim a total it does not have.
    const rows = await db
      .select({ id: files.id, path: files.path, total: files.totalLines })
      .from(files)
    for (const file of rows) {
      const actual = await db
        .select({ id: blameLines.id })
        .from(blameLines)
        .where(eq(blameLines.fileId, file.id))
      expect(actual.length).toBe(file.total ?? -1)
    }
  })
})

describe('GitService - failures are collected, not printed', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('writes nothing to the console during a normal run', async () => {
    // Ink owns the terminal. Its patchConsole relocates stray output above the
    // frame rather than letting it overwrite the app, but the message still
    // arrives from nowhere and is gone on the next render.
    repo = await createTestRepo()
    await repo.commit({
      message: 'ordinary',
      write: { 'src/a.ts': 'const a = 1\n' },
    })

    const calls: string[] = []
    const original = {
      warn: console.warn,
      error: console.error,
      log: console.log,
    }
    console.warn = (...args) => calls.push(`warn: ${String(args[0])}`)
    console.error = (...args) => calls.push(`error: ${String(args[0])}`)
    console.log = (...args) => calls.push(`log: ${String(args[0])}`)

    try {
      await new GitService(repo.path, createDatabase()).initialize()
    } finally {
      Object.assign(console, original)
    }

    expect(calls).toEqual([])
  })

  it('reports an unreadable file instead of losing it quietly', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'two files',
      write: {
        'src/fine.ts': 'const a = 1\n',
        'src/broken.ts': 'const b = 2\n',
      },
    })

    // Remove the blob backing one file, so git can list it from the tree but
    // cannot read its content. That is the shape of a real failure here.
    const blob = (await repo.git(['rev-parse', 'HEAD:src/broken.ts'])).trim()
    await rm(
      join(repo.path, '.git', 'objects', blob.slice(0, 2), blob.slice(2)),
    )

    const calls: string[] = []
    const original = { warn: console.warn, error: console.error }
    console.warn = (...args) => calls.push(String(args[0]))
    console.error = (...args) => calls.push(String(args[0]))

    const db = createDatabase()
    const gitService = new GitService(repo.path, db)
    try {
      await gitService.initialize()
    } finally {
      Object.assign(console, original)
    }

    const failures = gitService.getFailures()
    expect(failures.map((failure) => failure.path)).toEqual(['src/broken.ts'])
    expect(failures[0]?.error).toBeTruthy()
    // The point of collecting them: nothing was printed into the UI.
    expect(calls).toEqual([])
    // And the file that was readable is still analysed.
    const stored = await db.select({ id: blameLines.id }).from(blameLines)
    expect(stored).toHaveLength(1)
  })

  it('does not carry failures over from a previous run', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'ordinary',
      write: { 'src/a.ts': 'const a = 1\n' },
    })

    const gitService = new GitService(repo.path, createDatabase())
    await gitService.initialize()
    await gitService.initialize()

    expect(gitService.getFailures()).toEqual([])
  })
})
