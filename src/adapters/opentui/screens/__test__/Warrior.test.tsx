import { afterEach, describe, expect, it } from 'bun:test'
import type { HistoryReading } from '../../../../core/longevity'
import {
  type Driven,
  fixtureRealm,
  GORVEK,
  SARN,
  shell,
} from '../../__test__/harness'
import { formatAge } from '../../format/ageFormatting'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
const COHORT = at('2025-01-01T00:00:00Z')

/**
 * A history about the analysed revision: Gorvek's January stood whole at
 * every snapshot, Sarn's January lost three in four by April and was gone by
 * July.
 */
const HISTORY: HistoryReading = {
  describes: 'abc1234def5678',
  history: {
    snapshots: [
      {
        id: 1,
        commitSha: 'a1',
        snapshotTimestamp: at('2025-01-15T00:00:00Z'),
        totalLines: 18,
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
    ],
  },
}

function lineWith(frame: string, text: string): string {
  return frame.split('\n').find((line) => line.includes(text)) ?? ''
}

const warrior = (authorId: number) => [
  { kind: 'menu' as const },
  { kind: 'warrior' as const, authorId },
]

describe('Warrior', () => {
  it('says what they hold, as a part of the realm, and where they rank', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 60 })
    const frame = screen.frame()

    expect(frame).toContain('ONE WARRIOR')
    expect(frame).toContain(`👑 ${GORVEK.name}`)
    expect(frame).toContain(
      `legend · ${GORVEK.email} · 1st of 4 in the rankings`,
    )
    expect(frame).toMatch(/9 of 17 lines, in 2 files\s+52\.9% of the realm/)
  })

  it('gives every measure out of the whole it belongs to, and the place it earns', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 60 })
    const frame = screen.frame()

    expect(lineWith(frame, 'Lines in HEAD')).toMatch(
      /9 of 17 lines\s+52\.9% .*\s1st of 4/,
    )
    expect(lineWith(frame, 'Battle Scars')).toMatch(
      /3 of 6 lines\s+50\.0% .*\s1st of 4/,
    )
    expect(lineWith(frame, 'Territory Conquered')).toMatch(
      /2 of 5 files\s+40\.0% .*\s1st of 4/,
    )
    // Every warrior holds one file alone and one file type: a shared first.
    expect(lineWith(frame, 'Solo Quests')).toMatch(
      /1 of 5 files\s+20\.0% .*=1st of 4/,
    )
    expect(lineWith(frame, 'Weapon Mastery')).toMatch(
      /1 of 3 file types\s+33\.3% .*=1st of 4/,
    )
    expect(lineWith(frame, 'Ancient Code')).toMatch(
      /9 of 9 lines\s+100\.0% .*\s1st of 4/,
    )
    expect(lineWith(frame, 'Massive Battles')).toMatch(/0 of 2 days\s+0\.0%/)
    expect(lineWith(frame, 'Massive Battles')).not.toContain(' of 4')
    expect(lineWith(frame, 'Campaigns')).toMatch(
      /1 of 2 days\s+50\.0% .*=1st of 4/,
    )
    expect(frame).toContain('Gorvek score 48')
  })

  it('names their achievements without the variation selector', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 60 })
    const frame = screen.frame()

    expect(frame).toContain('🏆 LEGENDARY ACHIEVEMENTS')
    for (const title of [
      'Slayer of Legacy Dragons',
      'Conqueror of Domains',
      'Lone Wolf Warrior',
      'Master of Many Weapons',
      'Guardian of Ancient Code',
      'Veteran of a Hundred Battles',
    ]) {
      expect(frame).toContain(title)
    }
    // Nobody had a massive battle, so nobody breaks mountains.
    expect(frame).not.toContain('Breaker of Mountains')
    expect(frame).not.toContain('️')
  })

  it('gives a measure they have none of no place', async () => {
    screen = await shell({ initialScreens: warrior(SARN.id) }, { height: 60 })
    const frame = screen.frame()

    expect(frame).toContain(
      'warlord · sarn@kell.realm · 3rd of 4 in the rankings',
    )
    expect(lineWith(frame, 'Ancient Code')).toMatch(/0 of 9 lines\s+0\.0%/)
    expect(lineWith(frame, 'Ancient Code')).not.toContain(' of 4')
    expect(lineWith(frame, 'Battle Scars')).toMatch(
      /1 of 6 lines\s+16\.7% .*\s3rd of 4/,
    )
    expect(lineWith(frame, 'Territory Conquered')).toMatch(/=2nd of 4/)
    expect(frame).not.toContain('LEGENDARY ACHIEVEMENTS')
  })

  it('tells how old it is as a part of their own lines', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 80 })
    const frame = screen.frame()
    // Every one of Gorvek's lines was last touched in January 2020.
    const age = formatAge(
      (at('2025-09-01T00:00:00Z') - at('2020-01-15T10:00:00Z')) / 86400,
    )

    expect(frame).toContain('⏳ HOW OLD IT IS')
    expect(frame).toContain(`middle age ${age}`)
    expect(lineWith(frame, 'over two years')).toMatch(
      /9 of their lines\s+100\.0%/,
    )
    expect(lineWith(frame, 'under a week')).toMatch(/0 of their lines\s+0\.0%/)
    expect(frame).toMatch(/oldest\s+src\/\S+:\d+ — /)
  })

  it('lists their files with their part of each, and where the oldest sits', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 80 })
    const frame = screen.frame()

    expect(frame).toContain('🏰 FILES THEY HOLD THE MOST OF')
    expect(frame).toMatch(/1\.\s+6 of 6\s+100% .*src\/hall\.ts/)
    expect(frame).toMatch(/2\.\s+3 of 4\s+75% .*src\/legacy\/old\.ts/)
    expect(frame).toContain('🏺 WHERE THE OLDEST OF IT SITS')
    expect(frame).toMatch(/\s6 lines\s+src\/hall\.ts/)
    expect(frame).toMatch(/\s3 lines\s+src\/legacy\/old\.ts/)
  })

  it('says the history is needed when it has not been walked', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 80 })
    expect(screen.frame()).toContain(
      'Needs the history walked: run with --history.',
    )
  })

  it('says what became of their work when the history is about this revision', async () => {
    screen = await shell(
      {
        initialScreens: warrior(GORVEK.id),
        realm: { status: 'ready', realm: fixtureRealm({ history: HISTORY }) },
      },
      { height: 80 },
    )
    const frame = screen.frame()

    expect(frame).toContain('💀 WHAT BECAME OF IT')
    expect(frame).toContain(
      '10 lines written in all, 10 still standing — 100.0%',
    )
    expect(frame).toContain('Half of it is still there after')
    expect(frame).not.toContain('Needs the history walked')
  })

  it('says when half of their work was gone', async () => {
    screen = await shell(
      {
        initialScreens: warrior(SARN.id),
        realm: { status: 'ready', realm: fixtureRealm({ history: HISTORY }) },
      },
      { height: 80 },
    )
    const frame = screen.frame()

    expect(frame).toContain('8 lines written in all, 0 still standing — 0.0%')
    expect(frame).toContain("Half of a month's work is gone after")
  })

  it('scrolls the page with G and gg', async () => {
    screen = await shell({ initialScreens: warrior(GORVEK.id) }, { height: 30 })
    expect(screen.frame()).toContain('WHAT THEY HOLD')
    expect(screen.frame()).not.toContain('WHERE THE OLDEST OF IT SITS')

    await screen.press('G')
    expect(screen.frame()).toContain('WHERE THE OLDEST OF IT SITS')
    expect(screen.frame()).not.toContain('WHAT THEY HOLD')

    await screen.press('g', 'g')
    expect(screen.frame()).toContain('WHAT THEY HOLD')

    await screen.press('ctrl-d', 'j', 'pgdn')
    expect(screen.frame()).not.toContain('WHAT THEY HOLD')
    await screen.press('pgup', 'ctrl-u', 'k', 'home')
    expect(screen.frame()).toContain('WHAT THEY HOLD')
  })

  it('goes back with Esc', async () => {
    screen = await shell({
      initialScreens: [
        { kind: 'menu' },
        { kind: 'overview' },
        { kind: 'warrior', authorId: GORVEK.id },
      ],
    })
    await screen.press('esc')
    expect(screen.frame()).toContain('REPOSITORY OVERVIEW')
  })
})
