import { afterEach, describe, expect, it } from 'bun:test'
import { DRUSK, type Driven, GORVEK, NASK, SARN, shell } from './harness'

let screen:
  | (Driven & { quits: () => number; chosen: () => string[] })
  | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const footer = (frame: string) => frame.trimEnd().split('\n').at(-1) ?? ''

describe('the frame', () => {
  it('names the screen and the repository at its head', async () => {
    screen = await shell()
    const frame = screen.frame()
    expect(frame).toContain('THE MAIN HALL')
    expect(frame).toContain('🏰 bonereach @ abc1234')
  })

  it('opens every menu entry by its number', async () => {
    const titles: Array<[string, string]> = [
      ['1', 'REPOSITORY OVERVIEW'],
      ['2', "GORVEK'S BRUTAL BARBARIAN RANKINGS"],
      ['3', 'CODE LONGEVITY'],
      ['4', 'MERGE WARRIORS'],
      ['5', "THE WARRIOR'S GUIDE"],
      ['6', 'CHOOSE A REALM'],
      ['7', 'ABOUT'],
    ]
    for (const [key, title] of titles) {
      screen = await shell()
      await screen.press(key)
      expect(screen.frame(), key).toContain(title)
      screen.done()
      screen = undefined
    }
  })

  it('leaves through 8, the exit', async () => {
    screen = await shell()
    await screen.press('8')
    expect(screen.quits()).toBe(1)
  })

  it('shows the hint of the screen on top', async () => {
    screen = await shell()
    expect(footer(screen.frame())).toContain('1–8 open directly')
    await screen.press('1')
    expect(footer(screen.frame())).toContain('m merge')
    await screen.press('esc')
    expect(footer(screen.frame())).toContain('1–8 open directly')
  })
})

describe('leaving', () => {
  for (const keys of [
    ['q'],
    [':', 'q', 'enter'],
    [':', 'x', 'enter'],
    [':', 'q', '!', 'enter'],
  ]) {
    it(`leaves on ${keys.filter((k) => k !== 'enter').join('')}`, async () => {
      screen = await shell()
      await screen.press(...keys)
      expect(screen.quits()).toBe(1)
    })
  }
})

describe('the command line and the status', () => {
  it('says what it does not know', async () => {
    screen = await shell()
    await screen.press(':', 'c', 'o', 'n', 'q', 'u', 'e', 'r')
    expect(footer(screen.frame())).toContain(':conquer')
    await screen.press('enter')
    expect(footer(screen.frame())).toContain('Not a command: conquer')
  })

  it('says Esc on the main hall goes nowhere, and forgets it on the next key', async () => {
    screen = await shell()
    await screen.press('esc')
    expect(footer(screen.frame())).toContain('main')
    await screen.press('j')
    expect(footer(screen.frame())).not.toContain('main menu')
    expect(footer(screen.frame())).not.toContain('main hall')
  })

  it('shows the search prompt as it is typed', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press('/', 'N', 'a')
    expect(footer(screen.frame())).toContain('/Na')
  })

  it('moves a list with :3, and with n and N between matches', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press(':', '3', 'enter')
    expect(screen.frame()).toMatch(new RegExp(`› .*${DRUSK.name}`))

    // "a" answers to all four: Bonereach, Sarn, Captain, Nask. Enter keeps the first.
    await screen.press('/', 'a', 'enter')
    expect(screen.frame()).toMatch(new RegExp(`› .*${GORVEK.name}`))
    await screen.press('n')
    expect(screen.frame()).toMatch(new RegExp(`› .*${SARN.name}`))
    await screen.press('n', 'n')
    expect(screen.frame()).toMatch(new RegExp(`› .*${NASK.name}`))
    await screen.press('N')
    expect(screen.frame()).toMatch(new RegExp(`› .*${DRUSK.name}`))
  })
})

describe('the help', () => {
  it('shows the keys and the legend of the screen under it, and closes again', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press('j', '?')
    const help = screen.frame()
    expect(help).toContain('HELP')
    expect(help).toContain('Keys, on every screen')
    expect(help).toContain('leave the realm')
    // The overview's own key and legend.
    expect(help).toContain('merge the warrior under the cursor')
    expect(help).toContain('their lines as a part of every surviving line')
    expect(footer(help)).toContain('closes the help')

    await screen.press('?')
    expect(screen.frame()).toContain('REPOSITORY OVERVIEW')
    expect(screen.frame()).toMatch(new RegExp(`› .*${SARN.name}`))

    await screen.press('?', 'esc')
    expect(screen.frame()).toMatch(new RegExp(`› .*${SARN.name}`))
  })

  it('takes no keys for the screen under it while open', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press('?', 'j', 'j', '?')
    expect(screen.frame()).toMatch(new RegExp(`› .*${GORVEK.name}`))
  })
})

describe('the stack', () => {
  it('lets only the screen on top answer the keyboard', async () => {
    // The overview stays mounted under the warrior. A key it would answer --
    // m, to merge -- must do nothing while the warrior is on top.
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press('enter', 'm')
    expect(screen.frame()).toContain('ONE WARRIOR')
    expect(screen.frame()).not.toContain('MERGE WARRIORS')
  })

  it('goes back one screen at a time', async () => {
    screen = await shell()
    await screen.press('2', 'enter')
    expect(screen.frame()).toContain('ONE WARRIOR')
    await screen.press('h')
    expect(screen.frame()).toContain("GORVEK'S BRUTAL BARBARIAN RANKINGS")
    await screen.press('left')
    expect(screen.frame()).toContain('THE MAIN HALL')
  })
})

describe('reading the realm', () => {
  it('shows the banner and the progress while it is read', async () => {
    screen = await shell({
      realm: {
        status: 'loading',
        fraction: 0.5,
        message: 'Analyzed 3/6 files',
        walkingHistory: false,
      },
    })
    const frame = screen.frame()
    expect(frame).toContain('READING THE REALM')
    expect(frame).toContain('Forging the blade of analysis...')
    expect(frame).toContain('50%')
    expect(frame).toContain('Analyzed 3/6 files')
  })

  it('says when it is walking the history', async () => {
    screen = await shell({
      realm: {
        status: 'loading',
        fraction: 0.25,
        message: 'Snapshot 1 of 4',
        walkingHistory: true,
      },
    })
    expect(screen.frame()).toContain('⏳ Snapshot 1 of 4')
    expect(footer(screen.frame())).toContain('walking the history')
  })

  it('says why a realm could not be read, and offers another', async () => {
    screen = await shell({
      realm: { status: 'failed', error: 'Not a git repository: /nowhere' },
    })
    expect(screen.frame()).toContain('NO REALM')
    expect(screen.frame()).toContain('Not a git repository: /nowhere')
    await screen.press('enter')
    expect(screen.frame()).toContain('CHOOSE A REALM')
  })

  it('starts on the path when no repository was named, and hands over the one chosen', async () => {
    screen = await shell({ repoPath: null })
    expect(screen.frame()).toContain('CHOOSE A REALM')
    await screen.type(process.cwd())
    await screen.press('enter')
    expect(screen.chosen()).toEqual([process.cwd()])
  })

  it('leaves from the path screen when there is nowhere to go back to', async () => {
    screen = await shell({ repoPath: null })
    await screen.press('esc')
    expect(screen.quits()).toBe(1)
  })
})
