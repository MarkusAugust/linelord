import { afterEach, describe, expect, it } from 'bun:test'
import packageJson from '../../../../../package.json'
import { HONESTY_NOTES } from '../../../../core/honestyNotes'
import { type Driven, shell } from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

/** Every line About has to say, seen by scrolling it through from top to bottom. */
async function readAll(): Promise<string> {
  screen = await shell(
    { initialScreens: [{ kind: 'menu' }, { kind: 'about' }] },
    { width: 160, height: 30 },
  )
  const seen = [screen.frame()]
  for (let page = 0; page < 6; page++) {
    await screen.press('pgdn')
    seen.push(screen.frame())
  }
  return seen.join('\n')
}

describe('About', () => {
  it('says which version it is', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'about' }],
    })
    expect(screen.frame()).toContain(`Version ${packageJson.version}`)
  })

  it('says what is counted and what is set aside', async () => {
    const all = await readAll()
    expect(all).toContain('lines alive in HEAD, in text files git tracks')
    expect(all).toContain('blank lines, and lines of only whitespace')
    expect(all).toContain('lock files, minified and bundled code')
    expect(all).toContain('no network, no telemetry')
  })

  it('carries the honesty notes, the licence and the copyright', async () => {
    const all = await readAll()
    for (const line of [
      ...HONESTY_NOTES.age.lines,
      ...HONESTY_NOTES.rankings.lines,
    ]) {
      expect(all).toContain(line)
    }
    expect(all).toContain('Copyright (C) 2026 August Søberg-Klyver.')
    expect(all).toContain('GNU General Public License, version 3')
  })

  it('links to the repository and to Søbernetics', async () => {
    const all = await readAll()
    expect(all).toContain('https://github.com/MarkusAugust/linelord')
    expect(all).toContain('https://sobernetics.no')
  })

  it('scrolls to the end with G, and back to the top with gg', async () => {
    screen = await shell(
      { initialScreens: [{ kind: 'menu' }, { kind: 'about' }] },
      { width: 160, height: 30 },
    )
    expect(screen.frame()).not.toContain('Count your lines')
    await screen.press('G')
    expect(screen.frame()).toContain(
      'Count your lines, claim your territory, conquer!',
    )
    await screen.press('g', 'g')
    expect(screen.frame()).toContain(`Version ${packageJson.version}`)
    await screen.press('j', 'k', 'ctrl-d', 'ctrl-u')
    expect(screen.frame()).toContain(`Version ${packageJson.version}`)
  })
})

describe('About, the marks in a list', () => {
  it('puts the text right after a mark, not in the column the long names need', async () => {
    const { shell } = await import('../../__test__/harness')
    const driven = await shell(
      { initialScreens: [{ kind: 'menu' }, { kind: 'about' }] },
      { width: 140, height: 60 },
    )
    try {
      const frame = driven.frame()
      expect(frame).toMatch(/✅ {1,3}lines alive in HEAD/)
      expect(frame).toMatch(/❌ {1,3}blank lines/)
      expect(frame).toMatch(/• Age is when a line was last changed/)
      // The names still have their column.
      expect(frame).toMatch(/Native git {6,}every number comes from git blame/)
    } finally {
      driven.done()
    }
  })
})
