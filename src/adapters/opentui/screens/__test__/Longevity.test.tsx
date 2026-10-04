import { afterEach, describe, expect, it } from 'bun:test'
import { author } from '../../../../core/__test__/fixtures'
import {
  ageOfRepository,
  type HistoryReading,
  halfLifeOf,
  survivalByAuthor,
} from '../../../../core/longevity'
import {
  type Driven,
  fixtureRealm,
  GORVEK,
  NOW,
  REALM_ANALYSIS,
  SARN,
  shell,
} from '../../__test__/harness'
import { formatAge } from '../../format/ageFormatting'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const LONGEVITY = [{ kind: 'menu' as const }, { kind: 'longevity' as const }]
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
const COHORT = at('2025-01-01T00:00:00Z')

/** Somebody whose every line has since been rewritten: in the history, not in HEAD. */
const VURN = { id: 5, name: 'Vurn the Ashborn', email: 'vurn@ashfall.realm' }
const WITH_VURN = {
  ...REALM_ANALYSIS,
  authors: [
    ...REALM_ANALYSIS.authors,
    author(VURN.id, { name: VURN.name, email: VURN.email }),
  ],
}

/**
 * Gorvek's January stood whole at every snapshot; Sarn's lost three in four
 * by April and was gone by July; Vurn's was seen once and then rewritten.
 */
function history(describes: string): HistoryReading {
  return {
    describes,
    history: {
      snapshots: [
        {
          id: 1,
          commitSha: 'a1',
          snapshotTimestamp: at('2025-01-15T00:00:00Z'),
          totalLines: 22,
        },
        {
          id: 2,
          commitSha: 'a2',
          snapshotTimestamp: at('2025-04-15T00:00:00Z'),
          totalLines: 12,
        },
        {
          id: 3,
          commitSha: 'a3',
          snapshotTimestamp: at('2025-07-15T00:00:00Z'),
          totalLines: 10,
        },
      ],
      cohortLines: [
        {
          snapshotId: 1,
          authorId: GORVEK.id,
          cohortMonth: COHORT,
          lineCount: 10,
        },
        {
          snapshotId: 2,
          authorId: GORVEK.id,
          cohortMonth: COHORT,
          lineCount: 10,
        },
        {
          snapshotId: 3,
          authorId: GORVEK.id,
          cohortMonth: COHORT,
          lineCount: 10,
        },
        { snapshotId: 1, authorId: SARN.id, cohortMonth: COHORT, lineCount: 8 },
        { snapshotId: 2, authorId: SARN.id, cohortMonth: COHORT, lineCount: 2 },
        { snapshotId: 1, authorId: VURN.id, cohortMonth: COHORT, lineCount: 4 },
      ],
    },
  }
}

const CURRENT = history('abc1234def5678')
const STALE = history('fff0000aaa1111')

function lineWith(frame: string, text: string): string {
  return frame.split('\n').find((line) => line.includes(text)) ?? ''
}

/** The table row of a warrior, by the start of their name. */
function rowOf(frame: string, name: string): string {
  const start = name.slice(0, 15)
  return (
    frame
      .split('\n')
      .find((line) => line.includes(start) && /\s\d+\s/.test(line)) ?? ''
  )
}

const realmWith = (reading: HistoryReading) => ({
  status: 'ready' as const,
  realm: fixtureRealm({ analysis: WITH_VURN, history: reading }),
})

describe('Longevity', () => {
  it("tells the realm's age at the middle, and how much is recent", async () => {
    screen = await shell({ initialScreens: LONGEVITY })
    const frame = screen.frame()
    const repository = ageOfRepository(REALM_ANALYSIS, NOW)

    expect(frame).toContain('CODE LONGEVITY')
    expect(frame).toContain(
      `The codebase is ${formatAge(repository.medianAgeDays ?? 0)} old at the middle`,
    )
    // The newest lines are 92 days old, so none is within ninety days.
    expect(frame).toContain('0.0% of it last touched within ninety days')
    expect(frame).toMatch(/Oldest line still standing: src\/\S+:\d+ — /)
  })

  it('sorts by median age, oldest first, and leaves half-life a dash without history', async () => {
    screen = await shell({ initialScreens: LONGEVITY })
    const frame = screen.frame()

    expect(frame).toContain('⏳ 4 warriors · sorted by median age')
    expect(rowOf(frame, GORVEK.name)).toContain('›')
    expect(rowOf(frame, GORVEK.name)).toMatch(/\s9\s.*—/)
    expect(frame.indexOf(rowOf(frame, GORVEK.name))).toBeLessThan(
      frame.indexOf(rowOf(frame, SARN.name)),
    )
    expect(frame).toContain(
      'Half-life and survival need the history walked: run with --history.',
    )
  })

  it('changes the order with o, and says which, round the three it has without history', async () => {
    screen = await shell({ initialScreens: LONGEVITY })

    await screen.press('o')
    expect(screen.frame()).toContain('Sorted by mean age')
    expect(screen.frame()).toContain('sorted by mean age')
    await screen.press('o')
    expect(screen.frame()).toContain('Sorted by surviving lines')
    // Gorvek's nine lines first, then Sarn's five.
    const frame = screen.frame()
    expect(frame.indexOf(rowOf(frame, GORVEK.name))).toBeLessThan(
      frame.indexOf(rowOf(frame, SARN.name)),
    )
    await screen.press('o')
    expect(screen.frame()).toContain('Sorted by median age')
  })

  it('refuses a history about another revision, and says which it was about', async () => {
    screen = await shell({ initialScreens: LONGEVITY, realm: realmWith(STALE) })
    const frame = screen.frame()

    expect(frame).toContain(
      '⚠ The stored history describes fff0000, not what is analysed; half-life is left out.',
    )
    expect(rowOf(frame, GORVEK.name)).toMatch(/—/)
    // Vurn is only in the history, and a history about another revision is not drawn.
    expect(frame).not.toContain(VURN.name)
  })

  it('draws half-life from a history about this revision, and puts back the forgotten', async () => {
    screen = await shell({
      initialScreens: LONGEVITY,
      realm: realmWith(CURRENT),
    })
    const frame = screen.frame()
    const survival = new Map(
      survivalByAuthor(CURRENT.history, WITH_VURN.authors).map((one) => [
        one.authorId,
        one,
      ]),
    )
    const gorvek = halfLifeOf(survival.get(GORVEK.id))
    const sarn = halfLifeOf(survival.get(SARN.id))

    expect(gorvek.kind).toBe('outlasted')
    expect(sarn.kind).toBe('measured')
    if (gorvek.kind === 'unknown' || sarn.kind === 'unknown') return
    expect(rowOf(frame, GORVEK.name)).toContain(`> ${formatAge(gorvek.days)}`)
    expect(rowOf(frame, SARN.name)).toContain(formatAge(sarn.days))
    expect(frame).toContain('⏳ 5 warriors')
    // Vurn holds nothing now: no lines, no age.
    expect(lineWith(frame, VURN.name)).toMatch(/\s0\s+—\s+—/)
    expect(frame).not.toContain('need the history walked')
  })

  it('goes round all five orders once the history is about this revision', async () => {
    screen = await shell({
      initialScreens: LONGEVITY,
      realm: realmWith(CURRENT),
    })

    await screen.press('o', 'o', 'o')
    expect(screen.frame()).toContain('Sorted by half-life')
    // Work that outlived the history is the longest-lived; the unmeasured go last.
    const frame = screen.frame()
    expect(frame.indexOf(rowOf(frame, GORVEK.name))).toBeLessThan(
      frame.indexOf(rowOf(frame, SARN.name)),
    )
    await screen.press('o')
    expect(screen.frame()).toContain('Sorted by survival rate')
    await screen.press('o')
    expect(screen.frame()).toContain('Sorted by median age')
  })

  it('opens the warrior under the cursor with Enter', async () => {
    screen = await shell({ initialScreens: LONGEVITY })
    await screen.press('enter')
    expect(screen.frame()).toContain('ONE WARRIOR')
    expect(screen.frame()).toContain(GORVEK.name)
  })

  it('opens somebody the present has forgotten, and says they hold nothing', async () => {
    screen = await shell(
      { initialScreens: LONGEVITY, realm: realmWith(CURRENT) },
      { height: 60 },
    )
    await screen.press('/', 'v', 'u', 'r', 'n', 'enter', 'enter')
    const frame = screen.frame()

    expect(frame).toContain('ONE WARRIOR')
    expect(frame).toContain(VURN.name)
    expect(frame).toContain('Holds no line in the analysed revision.')
    expect(frame).toContain('4 lines written in all, 0 still standing — 0.0%')
  })
})
