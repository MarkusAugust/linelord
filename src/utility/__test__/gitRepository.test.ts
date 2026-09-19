import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { findRepositoryRoot } from '../gitRepository'

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
    expect(await findRepositoryRoot(repo.path)).toBe(await realpath(repo.path))
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

    const found = await findRepositoryRoot(join(repo.path, 'src', 'services'))

    expect(found).toBe(await realpath(repo.path))
  })

  it('returns null for a directory that is not in a repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'linelord-not-a-repo-'))
    try {
      expect(await findRepositoryRoot(outside)).toBe(null)
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })

  it('returns null for a path that does not exist, rather than throwing', async () => {
    // spawn reports this through the error event, not an exit code.
    expect(await findRepositoryRoot('/nonexistent-path-for-a-test')).toBe(null)
  })
})
