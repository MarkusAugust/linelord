import { afterEach, describe, expect, it } from 'bun:test'
import { DRUSK, type Driven, GORVEK, RUUN, SARN, shell } from './harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const footer = (frame: string) => frame.trimEnd().split('\n').at(-1) ?? ''
const selected = (frame: string) =>
  frame.split('\n').find((line) => line.includes('›')) ?? ''

/** The overview, in a terminal short enough that a page is a few rows. */
async function overview() {
  screen = await shell(
    { initialScreens: [{ kind: 'menu' }, { kind: 'overview' }] },
    { width: 120, height: 14 },
  )
  return screen
}

describe('a list', () => {
  it('pages, and half-pages, without running off either end', async () => {
    const list = await overview()
    await list.press('pgdn', 'pgdn', 'pgdn')
    expect(selected(list.frame())).toContain(RUUN.name)
    await list.press('pgup', 'pgup', 'pgup')
    expect(selected(list.frame())).toContain(GORVEK.name)
    await list.press('ctrl-d')
    expect(selected(list.frame())).not.toContain(GORVEK.name)
    await list.press('ctrl-u', 'ctrl-u')
    expect(selected(list.frame())).toContain(GORVEK.name)
  })

  it('goes to the ends with End and Home, and with G and gg', async () => {
    const list = await overview()
    await list.press('end')
    expect(selected(list.frame())).toContain(RUUN.name)
    await list.press('home')
    expect(selected(list.frame())).toContain(GORVEK.name)
    await list.press('G')
    expect(selected(list.frame())).toContain(RUUN.name)
    await list.press('g', 'g')
    expect(selected(list.frame())).toContain(GORVEK.name)
  })

  it('stops at the first and the last', async () => {
    const list = await overview()
    await list.press('k')
    expect(selected(list.frame())).toContain(GORVEK.name)
    await list.press('j', 'j', 'j', 'j', 'j')
    expect(selected(list.frame())).toContain(RUUN.name)
  })

  it('searches as it is typed, and says when nothing answers', async () => {
    const list = await overview()
    await list.press('/', 'D', 'r')
    expect(selected(list.frame())).toContain(DRUSK.name)
    await list.press('esc')
    expect(footer(list.frame())).not.toContain('/Dr')

    await list.press('/', 'z', 'z', 'z', 'enter')
    expect(footer(list.frame())).toContain('Nothing here answers to "zzz"')
    await list.press('n')
    expect(footer(list.frame())).toContain('Nothing here answers to "zzz"')
  })

  it('says n has nothing to go to before a search', async () => {
    const list = await overview()
    await list.press('n')
    expect(footer(list.frame())).toContain('Nothing searched for yet')
  })

  it('wraps round the end of the matches, as vim does', async () => {
    const list = await overview()
    // "the" answers to Sarn the Faceless and Brother Ruun.
    await list.press('/', 't', 'h', 'e', 'enter')
    expect(selected(list.frame())).toContain(SARN.name)
    await list.press('n')
    expect(selected(list.frame())).toContain(RUUN.name)
    await list.press('n')
    expect(selected(list.frame())).toContain(SARN.name)
    await list.press('N')
    expect(selected(list.frame())).toContain(RUUN.name)
  })

  it('refuses a place past the end', async () => {
    const list = await overview()
    await list.press(':', '9', '9', 'enter')
    expect(footer(list.frame())).toContain('There are 4, not 99')
  })
})
