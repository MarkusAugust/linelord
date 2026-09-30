import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDemoRepo, type DemoRepo } from '../buildDemoRepo'
import { DEMO_HISTORY, resolveDemoHistory } from '../history'

const NOW = new Date('2026-09-30T12:00:00Z')

async function git(root: string, args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], {
    cwd: root,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', TZ: 'UTC' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ])
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${code}`)
  }
  return stdout
}

describe('buildDemoRepo', () => {
  let parent: string | undefined

  afterEach(async () => {
    if (parent) await rm(parent, { force: true, recursive: true })
    parent = undefined
  })

  const build = async (): Promise<DemoRepo> => {
    parent = await mkdtemp(join(tmpdir(), 'linelord-demo-'))
    return buildDemoRepo({ root: join(parent, 'demo-repo'), now: NOW })
  }

  it('commits the whole history, in order, to a master branch', async () => {
    const demo = await build()

    const branch = (
      await git(demo.path, ['rev-parse', '--abbrev-ref', 'HEAD'])
    ).trim()
    expect(branch).toBe('master')

    const messages = (await git(demo.path, ['log', '--format=%s', '--reverse']))
      .trim()
      .split('\n')
    expect(messages.slice(0, DEMO_HISTORY.length)).toEqual(
      resolveDemoHistory(NOW).map((commit) => commit.message),
    )

    const timestamps = (await git(demo.path, ['log', '--format=%at']))
      .trim()
      .split('\n')
      .map(Number)
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i - 1] ?? 0).toBeGreaterThanOrEqual(timestamps[i] ?? 0)
    }
  })

  it('attributes each commit to the address the history names', async () => {
    const demo = await build()

    const authors = (await git(demo.path, ['log', '--format=%aE', '--reverse']))
      .trim()
      .split('\n')
    expect(authors.slice(0, DEMO_HISTORY.length)).toEqual(
      resolveDemoHistory(NOW).map((commit) => commit.author.email),
    )
  })

  it('records the reformatting commit in .git-blame-ignore-revs', async () => {
    const demo = await build()

    expect(demo.ignoredRevs.length).toBe(1)
    const sha = demo.ignoredRevs[0] ?? ''

    const written = await readFile(
      join(demo.path, '.git-blame-ignore-revs'),
      'utf8',
    )
    expect(written).toContain(sha)

    // A hash that names no commit makes git refuse the blame for every file,
    // so the fixture is worthless unless this resolves.
    const resolved = (
      await git(demo.path, ['rev-parse', '--verify', sha])
    ).trim()
    expect(resolved).toBe(sha)
  })

  it('leaves no .mailmap, so the identity warning has something to report', async () => {
    const demo = await build()

    const tracked = (await git(demo.path, ['ls-files'])).trim().split('\n')
    expect(tracked).not.toContain('.mailmap')
  })

  it('tracks the files the exclusions must throw out', async () => {
    const demo = await build()

    const tracked = (await git(demo.path, ['ls-files'])).trim().split('\n')
    expect(tracked).toContain('bun.lock')
    expect(tracked).toContain('assets/sigil.png')
    expect(tracked).toContain('src/schema_generated.ts')
    expect(tracked).toContain('data/roster.csv')
  })

  it('refuses to build over a directory that already holds a repository', async () => {
    const demo = await build()

    await expect(buildDemoRepo({ root: demo.path, now: NOW })).rejects.toThrow(
      /already/i,
    )
  })
})
