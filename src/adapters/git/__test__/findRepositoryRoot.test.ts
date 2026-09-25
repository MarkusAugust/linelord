import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../../__test__/helpers/createTestRepo'
import { findRepositoryRoot } from '../spawnGit'

describe('findRepositoryRoot', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('returns the root when given the root', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'first', write: { 'a.ts': 'const a = 1\n' } })

    // macOS puts temporary directories behind a symlink, which git resolves.
    expect(await findRepositoryRoot(repo.path)).toEqual({
      found: true,
      root: await realpath(repo.path),
    })
  })

  it('returns the root when given a subdirectory', async () => {
    // This is the case that was quietly wrong: git ls-tree honours the current
    // directory's prefix, so an analysis started inside a subdirectory covered
    // only that subdirectory while presenting itself as the whole repository.
    repo = await createTestRepo()
    await repo.commit({
      message: 'nested',
      write: {
        'top.ts': 'const t = 1\n',
        'src/services/deep.ts': 'const d = 1\n',
      },
    })

    expect(
      await findRepositoryRoot(join(repo.path, 'src', 'services')),
    ).toEqual({ found: true, root: await realpath(repo.path) })
  })

  it('says a directory outside any repository is not a repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'linelord-not-a-repo-'))
    try {
      expect(await findRepositoryRoot(outside)).toEqual({
        found: false,
        reason: 'not-a-repository',
      })
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })

  it('blames the path, not the installation, when the path does not exist', async () => {
    // A missing cwd fails to spawn exactly as a missing git binary does. The
    // two must not be conflated, or a typo in a path would tell the user to go
    // and install git.
    expect(await findRepositoryRoot('/nonexistent-path-for-a-test')).toEqual({
      found: false,
      reason: 'not-a-repository',
    })
  })

  it('reports an unavailable git as such', async () => {
    // Emptying PATH is what makes git genuinely unrunnable here, which is the
    // situation a user without git installed is actually in.
    const originalPath = process.env.PATH
    repo = await createTestRepo()
    await repo.commit({ message: 'first', write: { 'a.ts': 'const a = 1\n' } })

    process.env.PATH = join(tmpdir(), 'linelord-no-git-here') + delimiter
    try {
      expect(await findRepositoryRoot(repo.path)).toEqual({
        found: false,
        reason: 'git-unavailable',
      })
    } finally {
      process.env.PATH = originalPath
    }
  })
})
