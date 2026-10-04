import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useKeyboard } from '@opentui/react'
import { useState } from 'react'
import {
  createTestRepo,
  type TestRepo,
} from '../../../__test__/helpers/createTestRepo'
import { defaultPorts } from '../../../app/ports'
import type { LineLordPorts } from '../../../core/lineLord'
import type { GitPort } from '../../../ports/git'
import { type RealmOptions, type RealmState, realmOf, useRealm } from '../data'
import {
  type Driven,
  drive,
  fixtureRealm,
  GORVEK,
  NO_HISTORY,
  NOW,
  REALM_ANALYSIS,
} from './harness'

describe('realmOf', () => {
  it('works out the rankings, the totals and the warriors from the analysis', async () => {
    const realm = fixtureRealm()

    expect(realm.rankings.map((one) => one.displayName)[0]).toBe(GORVEK.name)
    expect(realm.totals.lines).toBe(17)
    expect(realm.totals.files).toBe(5)
    expect(realm.measuredAt).toBe(NOW)
    expect((await realm.warriorSource.share(GORVEK.id))?.totalLines).toBe(9)
  })

  it('keeps the parts it was given as they were', () => {
    const realm = realmOf({
      analysis: REALM_ANALYSIS,
      context: {
        headSha: null,
        uncommittedFileCount: 2,
        ignoredRevisionCount: 0,
        ignoreRevSources: { file: false, flag: false },
        unresolvedIgnoreRevs: [],
      },
      failures: [],
      historyFailures: [],
      cache: { mode: 'disabled', filesBlamed: 5, filesReused: 0 },
      merges: [],
      history: NO_HISTORY,
      measuredAt: NOW,
    })
    expect(realm.context.uncommittedFileCount).toBe(2)
    expect(realm.cache.mode).toBe('disabled')
    expect(realm.analysis).toBe(REALM_ANALYSIS)
  })
})

// Made once: useRealm reads the repository again when its ports change, as
// they would if a component built new ones on every render.
const PORTS = defaultPorts()

const OPTIONS: RealmOptions = {
  thresholdBytes: 50 * 1024,
  useCache: false,
  refresh: false,
  authorPolicy: 'strict',
  ignoreRevisions: [],
}

/** A git that answers nothing: every call is refused, as when git cannot be run. */
const REFUSING_PORTS: LineLordPorts = {
  ...PORTS,
  git: {
    locate: PORTS.git.locate,
    at: () =>
      new Proxy(
        {},
        {
          get: () => async () => {
            throw new Error('git could not be run')
          },
        },
      ) as GitPort,
  },
}

/** useRealm, with r to read the same repository again. Prints what it has. */
function Probe({
  path,
  seen,
  ports = PORTS,
  options = OPTIONS,
  messages = [],
}: {
  path: string | null
  seen: RealmState['status'][]
  ports?: LineLordPorts
  options?: RealmOptions
  /** What the loading screen said while the history was walked. */
  messages?: string[]
}) {
  const [generation, setGeneration] = useState(0)
  const state = useRealm(ports, path, options, generation)
  if (seen.at(-1) !== state.status) seen.push(state.status)
  if (
    state.status === 'loading' &&
    state.walkingHistory &&
    messages.at(-1) !== state.message
  ) {
    messages.push(state.message)
  }
  useKeyboard((key) => {
    if (key.name === 'r') setGeneration((at) => at + 1)
  })
  return (
    <text>
      {state.status === 'ready'
        ? `ready ${state.realm.totals.lines} lines`
        : state.status === 'failed'
          ? `failed ${state.error}`
          : `loading ${state.message}`}
    </text>
  )
}

/** Let the analysis run, a few milliseconds at a time, until the frame says so. */
async function until(screen: Driven, text: string): Promise<string> {
  for (let tries = 0; tries < 200; tries++) {
    if (screen.frame().includes(text)) return screen.frame()
    await screen.resize(80, 10)
  }
  return screen.frame()
}

describe('useRealm', () => {
  let repo: TestRepo | undefined
  let screen: Driven | undefined

  afterEach(async () => {
    screen?.done()
    screen = undefined
    await repo?.cleanup()
    repo = undefined
  })

  it('reads a repository, and is loading until it has', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'the hall',
      author: { name: GORVEK.name, email: GORVEK.email },
      write: { 'hall.ts': 'one\ntwo\nthree\n' },
    })
    const seen: RealmState['status'][] = []
    screen = await drive(<Probe path={repo.path} seen={seen} />, {
      width: 80,
      height: 10,
    })

    expect(await until(screen, 'ready')).toContain('ready 3 lines')
    expect(seen[0]).toBe('loading')
    expect(seen.at(-1)).toBe('ready')
  })

  it('reads it again when asked, and goes back to loading on the way', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'a\n' } })
    const seen: RealmState['status'][] = []
    screen = await drive(<Probe path={repo.path} seen={seen} />, {
      width: 80,
      height: 10,
    })
    await until(screen, 'ready')

    await repo.commit({ message: 'two', write: { 'b.ts': 'b\nc\n' } })
    await screen.press('r')
    expect(await until(screen, 'ready 3 lines')).toContain('ready 3 lines')
    expect(seen).toEqual(['loading', 'ready', 'loading', 'ready'])
  })

  // A directory that is no repository was once analysed as an empty realm --
  // "ready 0 lines" -- so the failure screen could not be reached from it.
  it('fails, with a reason, on a path that is no repository', async () => {
    const seen: RealmState['status'][] = []
    const empty = await mkdtemp(join(tmpdir(), 'linelord-no-repo-'))
    screen = await drive(<Probe path={empty} seen={seen} />, {
      width: 120,
      height: 10,
    })
    expect(await until(screen, 'failed')).toContain('failed')
    expect(seen.at(-1)).toBe('failed')
  })

  it('waits, reading nothing, until there is a path', async () => {
    const seen: RealmState['status'][] = []
    screen = await drive(<Probe path={null} seen={seen} />, {
      width: 80,
      height: 10,
    })
    expect(screen.frame()).toContain('loading')
    expect(seen).toEqual(['loading'])
  })

  it('fails, saying why, when git refuses', async () => {
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'a\n' } })
    const seen: RealmState['status'][] = []
    screen = await drive(
      <Probe path={repo.path} seen={seen} ports={REFUSING_PORTS} />,
      { width: 120, height: 10 },
    )
    expect(await until(screen, 'failed')).toContain(
      'failed git could not be run',
    )
    expect(seen.at(-1)).toBe('failed')
  })

  it('says it is walking the history while it does', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'one',
      date: '2025-01-15T10:00:00Z',
      write: { 'a.ts': 'a\n' },
    })
    await repo.commit({
      message: 'two',
      date: '2025-03-15T10:00:00Z',
      write: { 'b.ts': 'b\n' },
    })
    const seen: RealmState['status'][] = []
    const messages: string[] = []
    screen = await drive(
      <Probe
        path={repo.path}
        seen={seen}
        messages={messages}
        options={{
          ...OPTIONS,
          history: { interval: 'month', maxSnapshots: 3 },
        }}
      />,
      { width: 120, height: 10 },
    )
    expect(await until(screen, 'ready')).toContain('ready 2 lines')
    expect(messages.length).toBeGreaterThan(0)
  })
})
