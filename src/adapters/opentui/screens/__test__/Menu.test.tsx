import { afterEach, describe, expect, it } from 'bun:test'
import {
  type Driven,
  fixtureRealm,
  SUGGESTION,
  shell,
} from '../../__test__/harness'
import type { RealmParts } from '../../data'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const BIG_BANNER = '██╗     ██╗███╗   ██╗'
const SMALL_BANNER = '█░░ █ █▄░█'

async function menu(
  overrides: Partial<RealmParts> = {},
  size = { width: 140, height: 44 },
) {
  screen = await shell(
    { realm: { status: 'ready', realm: fixtureRealm(overrides) } },
    size,
  )
  return screen.frame()
}

describe('Menu', () => {
  it('draws the large banner when there is height for it, and the small one when not', async () => {
    expect(await menu({}, { width: 140, height: 40 })).toContain(BIG_BANNER)
    screen?.done()
    const short = await menu({}, { width: 140, height: 30 })
    expect(short).toContain(SMALL_BANNER)
    expect(short).not.toContain(BIG_BANNER)
  })

  it('lists every entry, and says what the one under the cursor does', async () => {
    const frame = await menu()
    for (const label of [
      'Repository Overview',
      'Brutal Barbarian Rankings',
      'Code Longevity',
      'Merge warriors who are one person',
      "The Warrior's Guide",
      'Change Repository',
      'About',
      'Exit',
    ]) {
      expect(frame).toContain(label)
    }
    expect(frame).toContain('who holds how much of the realm')
    await screen?.press('j')
    expect(screen?.frame()).toContain("Gorvek's measure of every warrior")
    await screen?.press('G')
    expect(screen?.frame()).toContain('leave the realm')
  })

  it('says Esc goes nowhere from here', async () => {
    await menu()
    await screen?.press('esc')
    expect(screen?.frame()).toContain('q or :q leaves the realm')
  })

  it('opens the entry under the cursor with Enter', async () => {
    await menu()
    await screen?.press('j', 'j', 'enter')
    expect(screen?.frame()).toContain('CODE LONGEVITY')
  })

  it('ignores a number that is no entry', async () => {
    await menu()
    await screen?.press('9')
    expect(screen?.frame()).toContain('THE MAIN HALL')
  })
})

describe('the tidings', () => {
  it('names the revision, and the files with uncommitted changes', async () => {
    const frame = await menu({
      context: {
        headSha: 'abc1234def5678',
        uncommittedFileCount: 3,
        ignoredRevisionCount: 0,
        ignoreRevSources: { file: false, flag: false },
        unresolvedIgnoreRevs: [],
      },
    })
    expect(frame).toContain('Analysing HEAD abc1234')
    expect(frame).toContain('3 files with uncommitted changes, not counted')
  })

  it('says nothing about a revision in a repository with no commits', async () => {
    const frame = await menu({
      context: {
        headSha: null,
        uncommittedFileCount: 0,
        ignoredRevisionCount: 0,
        ignoreRevSources: { file: false, flag: false },
        unresolvedIgnoreRevs: [],
      },
    })
    expect(frame).not.toContain('Analysing HEAD')
  })

  it('says where the numbers came from, for every way the cache can go', async () => {
    expect(
      await menu({ cache: { mode: 'reused', filesBlamed: 0, filesReused: 5 } }),
    ).toContain('Reused the stored analysis of 5 files')
    screen?.done()
    expect(
      await menu({
        cache: { mode: 'incremental', filesBlamed: 2, filesReused: 3 },
      }),
    ).toContain('Re-read 2 changed files, reused 3')
    screen?.done()
    expect(
      await menu({
        cache: {
          mode: 'full',
          filesBlamed: 5,
          filesReused: 0,
          reason: 'the size threshold changed',
        },
      }),
    ).toContain('Analysed everything again: the size threshold changed')
    screen?.done()
    expect(
      await menu({ cache: { mode: 'full', filesBlamed: 1, filesReused: 0 } }),
    ).toContain('Analysed 1 file')
    screen?.done()
    const disabled = await menu({
      cache: { mode: 'disabled', filesBlamed: 5, filesReused: 0 },
    })
    expect(disabled).not.toContain('Reused')
    expect(disabled).not.toContain('Analysed')
  })

  it('says how many commits are looked past, and names the entries that are no commit', async () => {
    const frame = await menu({
      context: {
        headSha: 'abc1234def5678',
        uncommittedFileCount: 0,
        ignoredRevisionCount: 2,
        ignoreRevSources: { file: true, flag: false },
        unresolvedIgnoreRevs: [{ entry: 'deadbeef', source: 'file' }],
      },
    })
    expect(frame).toContain('Looking past 2 commits')
    expect(frame).toContain('1 ignore entry name no commit here')
    expect(frame).toContain('deadbeef')
  })

  it('shows who may be one person, and that nothing was merged', async () => {
    const frame = await menu({ merges: [SUGGESTION] })
    expect(frame).toContain(
      '1 warrior may have committed under more than one address',
    )
    expect(frame).toContain('Gorvek of Bonereach <gorvek@bonereach.realm>')
    expect(frame).toContain('← gorvek@privat.realm')
    expect(frame).toContain('Nothing was merged')
  })

  it('says what the history and the analysis could not read', async () => {
    const frame = await menu({
      historyFailures: [
        { path: 'src/a.ts', revision: 'abc1234', error: 'gone' },
      ],
      failures: [
        { path: 'src/broken.ts', error: 'fatal: no such path\nmore detail' },
      ],
    })
    expect(frame).toContain('The history could not read 1 file')
    expect(frame).toContain(
      '1 file could not be analysed and is missing from every number',
    )
    expect(frame).toContain('src/broken.ts — fatal: no such path')
    expect(frame).not.toContain('more detail')
  })
})
