import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../../__test__/helpers/createTestRepo'
import { defaultPorts } from '../../../app/ports'
import type { LineLordPorts } from '../../../core/lineLord'
import { App } from '../App'
import { type Driven, drive } from './harness'

let screen: Driven | undefined
let repo: TestRepo | undefined
afterEach(async () => {
  screen?.done()
  screen = undefined
  await repo?.cleanup()
  repo = undefined
})

/** Wait for the frame to show something, reading the realm on the way. */
async function until(driven: Driven, text: string): Promise<string> {
  for (let tries = 0; tries < 200; tries++) {
    if (driven.frame().includes(text)) return driven.frame()
    await driven.press('ctrl-l')
  }
  return driven.frame()
}

describe('App', () => {
  it('reads the same repository again when it is chosen again after a failure', async () => {
    // Choosing the path that had just failed changed nothing App could see, so
    // nothing read it again: the failure screen came straight back.
    repo = await createTestRepo()
    await repo.commit({ message: 'one', write: { 'a.ts': 'a\nb\n' } })
    const real = defaultPorts()
    let lookups = 0
    const ports: LineLordPorts = {
      ...real,
      git: {
        ...real.git,
        locate: async (path) => {
          lookups += 1
          if (lookups === 1)
            throw new Error('Another LineLord is analysing this repository')
          return real.git.locate(path)
        },
      },
    }
    const options = {
      thresholdBytes: 50 * 1024,
      useCache: false,
      refresh: false,
      authorPolicy: 'strict' as const,
      ignoreRevisions: [],
    }

    screen = await drive(
      <App
        ports={ports}
        initialPath={repo.path}
        options={options}
        onQuit={() => {}}
      />,
    )
    expect(await until(screen, 'Another LineLord')).toContain(
      'Another LineLord',
    )

    await screen.press('enter')
    await screen.press('ctrl-u')
    await screen.type(repo.path)
    await screen.press('enter')

    expect(await until(screen, 'THE MAIN HALL')).toContain('THE MAIN HALL')
    // Once to fail, and again to read it; the reading looks it up itself as well.
    expect(lookups).toBeGreaterThanOrEqual(2)
  }, 30_000)
})
