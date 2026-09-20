import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestRepo, type TestRepo } from './helpers/createTestRepo'

/**
 * The flags as a person actually types them.
 *
 * These run the real entry point in a subprocess, because the failure they
 * guard against is one no unit test of the services can see: a flag that meow
 * does not know about is not rejected, it is quietly dropped, and LineLord
 * then works on the current directory while reporting that it did what was
 * asked.
 */

const CLI = join(import.meta.dir, '..', 'cli.ts')

async function runCli(args: string[], cacheHome: string): Promise<string> {
  const child = Bun.spawn(['bun', 'run', CLI, ...args], {
    cwd: join(import.meta.dir, '..', '..'),
    env: { ...process.env, XDG_CACHE_HOME: cacheHome },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  await child.exited
  return out + err
}

describe('--no-cache', () => {
  let repo: TestRepo | undefined
  let cacheHome: string | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    if (cacheHome) await rm(cacheHome, { force: true, recursive: true })
    cacheHome = undefined
  })

  it('actually stops the analysis being stored', async () => {
    // meow reads --no-cache as the negation of a flag called `cache`, so a
    // flag declared as `noCache` is never set by it and never rejected
    // either: the run goes on caching, and the only sign is a cache file
    // nobody asked for.
    repo = await createTestRepo()
    await repo.commit({ message: 'only commit', write: { 'a.ts': 'a\n' } })
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-nocache-'))

    await runCli(['--write-mailmap', '--no-cache', '-p', repo.path], cacheHome)

    expect(existsSync(join(cacheHome, 'linelord'))).toBe(false)
  }, 30000)

  it('stores it when nobody says otherwise', async () => {
    // The other half: without the flag a cache is written, so the test above
    // is measuring the flag and not some unrelated reason for an empty
    // directory.
    repo = await createTestRepo()
    await repo.commit({ message: 'only commit', write: { 'a.ts': 'a\n' } })
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-cache-'))

    await runCli(['--write-mailmap', '-p', repo.path], cacheHome)

    expect(existsSync(join(cacheHome, 'linelord'))).toBe(true)
  }, 30000)
})

describe('the short form of --path', () => {
  let repo: TestRepo | undefined
  let cacheHome: string | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
    if (cacheHome) await rm(cacheHome, { force: true, recursive: true })
    cacheHome = undefined
  })

  it('points LineLord at the repository it names', async () => {
    // Documented in the help text and the README. Without it the flag is
    // dropped and the current directory is analysed instead -- so `-p` on a
    // --clear-cache run forgot the wrong repository entirely, and said it had
    // done the right one.
    repo = await createTestRepo()
    await repo.commit({
      message: 'only commit',
      write: { 'a.ts': 'a\n' },
    })
    cacheHome = await mkdtemp(join(tmpdir(), 'linelord-cli-'))

    const output = await runCli(['--clear-cache', '-p', repo.path], cacheHome)

    expect(output).toContain(repo.path)
  }, 30000)
})
