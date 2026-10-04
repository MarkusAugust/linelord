import { afterEach, describe, expect, it } from 'bun:test'
import { type Driven, shell } from '../../__test__/harness'
import { GUIDE } from '../../guide'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

async function guide(size = { width: 140, height: 40 }) {
  screen = await shell(
    { initialScreens: [{ kind: 'menu' }, { kind: 'guide' }] },
    size,
  )
  return screen
}

describe("The Warrior's Guide", () => {
  it('lists every chapter, and opens on the first', async () => {
    const frame = (await guide()).frame()
    for (const chapter of GUIDE)
      expect(frame).toContain(chapter.title.slice(0, 30))
    expect(frame).toContain('Every screen answers the same keys')
  })

  it('moves between chapters with j and k, and shows the one chosen', async () => {
    const screen = await guide()
    await screen.press('j')
    expect(screen.frame()).toContain(
      'LineLord runs git blame on every file in HEAD',
    )
    await screen.press('k')
    expect(screen.frame()).toContain('Every screen answers the same keys')
  })

  it('says what writing .mailmap does, everywhere and for everyone', async () => {
    const screen = await guide({ width: 160, height: 60 })
    // Found by name, not by counting chapters, so a new chapter does not move it.
    await screen.press('/', ...'mailmap', 'enter')
    const frame = screen.frame()
    expect(frame).toContain(
      'git log, git shortlog and git blame show the merged name',
    )
    expect(frame).toContain('it holds for you alone')
    expect(frame).toContain('it holds for everyone who clones')
    expect(frame).toContain('no commit is rewritten')
    expect(frame).toContain('delete the line to count them apart again')
    expect(frame).toContain('A wrong merge credits one person with another')
  })

  it('reads on with PgDn and Enter, and starts a new chapter at its top', async () => {
    const screen = await guide({ width: 140, height: 20 })
    // Found by name, not by counting chapters, so a new chapter does not move it.
    await screen.press('/', ...'mailmap', 'enter')
    expect(screen.frame()).not.toContain('LineLord only ever adds lines')
    await screen.press('pgdn', 'pgdn', 'enter', 'ctrl-d')
    expect(screen.frame()).toContain('LineLord only ever adds lines')
    await screen.press('ctrl-u', 'j')
    expect(screen.frame()).toContain('A commit that only reformatted the code')
  })

  it('stacks the chapters above the page in a narrow terminal', async () => {
    const screen = await guide({ width: 80, height: 40 })
    expect(screen.frame()).toContain('Getting around')
    expect(screen.frame()).toContain('Every screen answers the same keys')
  })
})

describe('Guide, in a small terminal', () => {
  it('keeps the chapter list short so the chapter has room, and follows the selection', async () => {
    // Eleven chapters stacked above the page left five lines of text at 80x24.
    const screen = await guide({ width: 80, height: 24 })
    expect(screen.frame()).toContain('Ctrl-u Ctrl-d')
    await screen.press('G')
    expect(screen.frame()).toMatch(/› .*Flags, for scripts/)
  })
})
