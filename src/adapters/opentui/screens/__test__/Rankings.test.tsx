import { afterEach, describe, expect, it } from 'bun:test'
import { EMPTY_ANALYSIS } from '../../../../core/model'
import {
  DRUSK,
  type Driven,
  fixtureRealm,
  GORVEK,
  NASK,
  SARN,
  shell,
} from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const RANKINGS = [{ kind: 'menu' as const }, { kind: 'rankings' as const }]

/** The one line of the frame that holds `text`. */
function lineWith(frame: string, text: string): string {
  return frame.split('\n').find((line) => line.includes(text)) ?? ''
}

/**
 * The table row of a warrior: the line with the start of their name and a
 * score after it. The name column is cut to fit, so only its start is sure.
 */
function rowOf(frame: string, name: string): string {
  const start = name.slice(0, 15)
  return (
    frame
      .split('\n')
      .find((line) => line.includes(start) && /\d+\s+\d+\s+\d/.test(line)) ?? ''
  )
}

describe('Rankings', () => {
  // Gorvek score: Gorvek 47.5, Drusk 24, Sarn 22, Nask 20 -- so Drusk, with
  // two lines, ranks above Sarn with five.
  it('ranks every warrior by Gorvek score, with every column when there is room', async () => {
    screen = await shell({ initialScreens: RANKINGS })
    const frame = screen.frame()

    expect(frame).toContain("GORVEK'S BRUTAL BARBARIAN RANKINGS")
    expect(frame).toContain('🪓 4 warriors')
    expect(frame).not.toContain('only in the battle record')
    expect(lineWith(frame, 'Warrior')).toMatch(
      /Score\s+Lines\s+Share\s+Scars\s+Terr\s+Solo\s+Types\s+Anc\s+Mass\s+Camp/,
    )

    // Score, lines, share, then Scars Terr Solo Types Anc Mass Camp.
    expect(rowOf(frame, GORVEK.name)).toMatch(
      /1 Gorvek of Bonerea\S*\s+48\s+9\s+52\.9% .*\s3\s+2\s+1\s+1\s+9\s+0\s+1/,
    )
    expect(rowOf(frame, DRUSK.name)).toMatch(
      /2 Captain Drusk\s+24\s+2\s+11\.8% .*\s2\s+1\s+1\s+1\s+0\s+0\s+1/,
    )
    expect(rowOf(frame, SARN.name)).toMatch(
      /3 Sarn the Faceless\s+22\s+5\s+29\.4% .*\s1\s+1\s+1\s+1\s+0\s+0\s+1/,
    )
    expect(rowOf(frame, NASK.name)).toMatch(
      /4 Brother Nask\s+20\s+1\s+5\.9% .*\s0\s+1\s+1\s+1\s+0\s+0\s+1/,
    )
    const order = [GORVEK, DRUSK, SARN, NASK].map((one) =>
      frame.indexOf(rowOf(frame, one.name)),
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('shows the battle record of the chosen warrior below the table when it is tall enough', async () => {
    screen = await shell({ initialScreens: RANKINGS }, { height: 40 })
    await screen.press('j')
    const frame = screen.frame()

    expect(frame).toContain('🥈 #2 · Captain Drusk — battle record')
    expect(lineWith(frame, 'Lines in HEAD')).toMatch(
      /2 of 17 lines\s+11\.8% .*3rd of 4/,
    )
    // Drusk's two lines are both in a .js file, which looks legacy.
    expect(lineWith(frame, 'Battle Scars')).toMatch(
      /2 of 6 lines\s+33\.3% .*2nd of 4/,
    )
    expect(lineWith(frame, 'Territory Conquered')).toMatch(
      /1 of 5 files\s+20\.0% .*=2nd of 4/,
    )
    // Nobody holds a massive battle, so nobody has a place in it.
    expect(lineWith(frame, 'Massive Battles')).toMatch(/0 of 2 days\s+0\.0%/)
    expect(lineWith(frame, 'Massive Battles')).not.toContain(' of 4')
  })

  it('leaves the battle record out when the terminal is too short for it', async () => {
    screen = await shell({ initialScreens: RANKINGS }, { height: 30 })
    expect(screen.frame()).not.toContain('battle record')
    expect(rowOf(screen.frame(), GORVEK.name)).toContain('›')
  })

  it('names the achievements beside the record in a wide terminal, without the variation selector', async () => {
    screen = await shell({ initialScreens: RANKINGS }, { width: 150 })
    const frame = screen.frame()

    expect(frame).toContain('🏆 LEGENDARY ACHIEVEMENTS')
    expect(frame).toContain('Slayer of Legacy Dragons')
    expect(frame).toContain('Lone Wolf Warrior')
    expect(frame).toContain('Veteran of a Hundred Battles')
    expect(frame).not.toContain('️')
    expect(frame).toContain(`legend · ${GORVEK.email}`)
  })

  it('drops columns one at a time when narrow, and says where they went', async () => {
    screen = await shell({ initialScreens: RANKINGS }, { width: 80 })
    const frame = screen.frame()

    expect(frame).toContain('6 columns only in the battle record')
    const header = lineWith(frame, 'Warrior')
    expect(header).toMatch(/Score\s+Lines\s+Share\s+Terr/)
    for (const gone of ['Scars', 'Mass', 'Types', 'Camp', 'Solo', 'Anc']) {
      expect(header).not.toContain(gone)
    }
    // The share is never cut through the middle: it is all there or not at all.
    expect(rowOf(frame, GORVEK.name)).toMatch(/48\s+9\s+52\.9%/)
  })

  it('goes to a place with :2, and says so when there is no such place', async () => {
    screen = await shell({ initialScreens: RANKINGS })
    await screen.press(':', '2', 'enter')
    expect(rowOf(screen.frame(), DRUSK.name)).toContain('›')

    await screen.press(':', '9', 'enter')
    expect(screen.frame()).toContain('There are 4, not 9')
    expect(rowOf(screen.frame(), DRUSK.name)).toContain('›')
  })

  it('searches names and addresses, and n and N go round the matches', async () => {
    screen = await shell({ initialScreens: RANKINGS })
    await screen.press('/', 's', 'k')
    // Captain Drusk and Brother Nask; Drusk comes first.
    expect(screen.frame()).toContain('2 matches')
    expect(rowOf(screen.frame(), DRUSK.name)).toContain('›')

    await screen.press('enter', 'n')
    expect(rowOf(screen.frame(), NASK.name)).toContain('›')
    await screen.press('n')
    expect(rowOf(screen.frame(), DRUSK.name)).toContain('›')
    await screen.press('N')
    expect(rowOf(screen.frame(), NASK.name)).toContain('›')
  })

  it('opens the warrior with Enter, and comes back to the same place with Esc', async () => {
    screen = await shell({ initialScreens: RANKINGS })
    await screen.press('j', 'j', 'enter')
    expect(screen.frame()).toContain('ONE WARRIOR')
    expect(screen.frame()).toContain(SARN.name)

    await screen.press('esc')
    expect(screen.frame()).toContain("GORVEK'S BRUTAL BARBARIAN RANKINGS")
    expect(rowOf(screen.frame(), SARN.name)).toContain('›')
  })

  it('says so when there is nobody to rank', async () => {
    screen = await shell({
      initialScreens: RANKINGS,
      realm: {
        status: 'ready',
        realm: fixtureRealm({ analysis: EMPTY_ANALYSIS }),
      },
    })
    expect(screen.frame()).toContain('No warriors found')
  })
})

describe('Rankings, the score beside the battle record', () => {
  it('writes the Gorvek score in full, as the table does', async () => {
    // fit(score, 0) wrote every score under a million in thousands: 48 as "0k".
    screen = await shell(
      { initialScreens: [{ kind: 'menu' }, { kind: 'rankings' }] },
      { width: 150, height: 40 },
    )
    expect(screen.frame()).toContain('Gorvek score 48')
  })
})
