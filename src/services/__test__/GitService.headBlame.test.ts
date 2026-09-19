import { afterEach, describe, expect, it } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { authors, blameLines, files } from '../../db/schema'
import { GitService } from '../GitService'

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const NIGHTSHROUD = {
  name: 'Sister Nightshroud',
  email: 'nightshroud@alderstone.realm',
}

async function analyse(repoPath: string) {
  const db = createDatabase()
  const gitService = new GitService(repoPath, db)
  await gitService.initialize()

  const authorRows = await db
    .select({ name: authors.name, email: authors.email })
    .from(authors)
  const lineRows = await db
    .select({ authorId: blameLines.authorId })
    .from(blameLines)

  const linesByEmail = new Map<string, number>()
  const emailById = new Map<number, string>()
  const idRows = await db
    .select({ id: authors.id, email: authors.email })
    .from(authors)
  for (const row of idRows) {
    emailById.set(row.id, row.email)
  }
  for (const row of lineRows) {
    const email = emailById.get(row.authorId) ?? 'unknown'
    linesByEmail.set(email, (linesByEmail.get(email) ?? 0) + 1)
  }

  return {
    authors: authorRows,
    linesByEmail,
    context: gitService.getAnalysisContext(),
  }
}

describe('GitService - blames HEAD rather than the working copy', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('does not invent a "Not Committed Yet" author when the worktree is dirty', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'initial',
      author: GORVEK,
      date: new Date('2023-01-10T09:00:00Z'),
      write: { 'a.ts': 'const one = 1\nconst two = 2\nconst three = 3\n' },
    })
    await repo.commit({
      message: 'second file',
      author: NIGHTSHROUD,
      date: new Date('2023-06-10T09:00:00Z'),
      write: { 'b.ts': 'const four = 4\n' },
    })

    const clean = await analyse(repo.path)

    // Edit a tracked file without committing it.
    await writeFile(
      join(repo.path, 'a.ts'),
      'const one = 1\nconst RENAMED = 2\nconst three = 3\nconst added = 4\n',
    )

    const dirty = await analyse(repo.path)

    const authorNames = dirty.authors.map((a) => a.name)
    expect(authorNames).not.toContain('Not Committed Yet')
    expect(authorNames.sort()).toEqual([GORVEK.name, NIGHTSHROUD.name].sort())

    // The numbers must be identical with and without the unsaved edit.
    expect(Object.fromEntries(dirty.linesByEmail)).toEqual(
      Object.fromEntries(clean.linesByEmail),
    )
    expect(dirty.linesByEmail.get(GORVEK.email)).toBe(3)
    expect(dirty.linesByEmail.get(NIGHTSHROUD.email)).toBe(1)
  })

  it('reports the revision analysed and how many files were left out', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'initial',
      author: GORVEK,
      write: { 'a.ts': 'const one = 1\n', 'b.ts': 'const two = 2\n' },
    })
    const head = await repo.head()

    const clean = await analyse(repo.path)
    expect(clean.context.headSha).toBe(head)
    expect(clean.context.uncommittedFileCount).toBe(0)

    await writeFile(join(repo.path, 'a.ts'), 'const one = 999\n')

    const dirty = await analyse(repo.path)
    expect(dirty.context.headSha).toBe(head)
    expect(dirty.context.uncommittedFileCount).toBe(1)
  })

  it('skips a tracked file that has been staged but never committed', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'initial',
      author: GORVEK,
      write: { 'committed.ts': 'const committed = 1\n' },
    })

    await repo.writeFiles({ 'staged.ts': 'const staged = 1\n' })
    await repo.git(['add', 'staged.ts'])

    // staged.ts is listed by `git ls-files` but has no content in HEAD.
    // It must be excluded without failing the run.
    const result = await analyse(repo.path)

    expect(result.authors.map((a) => a.name)).toEqual([GORVEK.name])
    expect(result.linesByEmail.get(GORVEK.email)).toBe(1)
  })
})

describe('GitService - the file list comes from HEAD, not the index', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  async function analysedPaths(repoPath: string, thresholdBytes?: number) {
    const db = createDatabase()
    await new GitService(repoPath, db, thresholdBytes).initialize()
    const rows = await db
      .select({ path: files.path, size: files.size })
      .from(files)
    return new Map(rows.map((row) => [row.path, row.size]))
  }

  it('still analyses a file that is staged for deletion', async () => {
    // The file has left the index but is very much part of HEAD. Listing the
    // index dropped it silently while the UI claimed to describe HEAD.
    repo = await createTestRepo()
    await repo.commit({
      message: 'two files',
      author: GORVEK,
      write: { 'a.ts': 'const a = 1\n', 'doomed.ts': 'const d = 1\n' },
    })
    await repo.git(['rm', '--quiet', 'doomed.ts'])

    const paths = await analysedPaths(repo.path)

    expect([...paths.keys()].sort()).toEqual(['a.ts', 'doomed.ts'])
  })

  it('does not analyse a file that exists only in the index', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one file',
      author: GORVEK,
      write: { 'committed.ts': 'const c = 1\n' },
    })
    await repo.writeFiles({ 'staged.ts': 'const s = 1\n' })
    await repo.git(['add', 'staged.ts'])

    const paths = await analysedPaths(repo.path)

    expect([...paths.keys()]).toEqual(['committed.ts'])
  })

  it('measures a file by its size in HEAD, not in the working copy', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'a small file',
      author: GORVEK,
      write: { 'small.ts': 'const a = 1\n' },
    })
    // Balloon the working copy well past the threshold without committing it.
    await repo.writeFiles({
      'small.ts': `${'const filler = "aaaaaaaaaaaaaaaa"\n'.repeat(200)}`,
    })

    const paths = await analysedPaths(repo.path, 1024)

    // 12 bytes in HEAD, so it stays under a 1 KB threshold and is analysed.
    expect(paths.get('small.ts')).toBe(12)
  })

  it('carries paths with spaces, non-ASCII characters and newlines through intact', async () => {
    // `git ls-tree -z` is what makes this work: the default output would quote
    // the non-ASCII path and split the one containing newlines into two.
    repo = await createTestRepo()
    const awkward = [
      'src/filnavn med mellomrom.ts',
      'src/åpen fil.ts',
      'src/navn\nmed\nnewline.ts',
      'routes/user.$userId.ts',
    ]
    const write: Record<string, string> = {}
    for (const file of awkward) {
      write[file] = 'const line = 1\n'
    }
    await repo.commit({ message: 'awkward paths', author: GORVEK, write })

    const paths = await analysedPaths(repo.path)

    expect([...paths.keys()].sort()).toEqual([...awkward].sort())
  })
})
