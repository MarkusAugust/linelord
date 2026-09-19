import { afterEach, describe, expect, it } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { authors, blameLines } from '../../db/schema'
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
