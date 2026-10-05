import { afterEach, describe, expect, it } from 'bun:test'
import {
  DRUSK,
  type Driven,
  GORVEK,
  RUUN,
  SARN,
  shell,
} from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

describe('Overview', () => {
  it('counts the realm and lists every warrior with their share', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    const frame = screen.frame()

    expect(frame).toContain('REPOSITORY OVERVIEW')
    expect(frame).toMatch(/Developers\s+4/)
    expect(frame).toMatch(/Lines of code\s+17/)
    expect(frame).toMatch(/Over 50 KB, skipped\s+0/)
    // Gorvek holds 9 of 17 lines.
    expect(frame).toMatch(new RegExp(`${GORVEK.name}\\s+52\\.9%`))
    for (const one of [SARN, DRUSK, RUUN]) expect(frame).toContain(one.name)
    expect(frame).toContain(`legend · ${GORVEK.email}`)
  })

  it('opens the warrior under the cursor, and comes back to the same place', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })

    await screen.press('j', 'enter')
    expect(screen.frame()).toContain('ONE WARRIOR')
    expect(screen.frame()).toContain(SARN.name)

    await screen.press('esc')
    expect(screen.frame()).toContain('REPOSITORY OVERVIEW')
    expect(screen.frame()).toMatch(new RegExp(`› .*${SARN.name}`))
  })
})
