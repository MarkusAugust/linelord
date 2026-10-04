import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import type { MailmapWrite } from '../../../../core/mailmap'
import MergeWarriors from '../MergeWarriors'
import {
  GORVEK,
  KEY,
  SARN,
  STABLE_BOY,
  settle,
  stripAnsi,
} from './fakeAnalysisService'

const noop = () => {}

type Call = { keep: { name: string; email: string }; absorbed: string[] }

function harness(overrides: { write?: () => Promise<MailmapWrite> } = {}) {
  const proposed: Call[] = []
  const written: Call[] = []
  let merged = 0
  let left = 0
  const screen = render(
    <MergeWarriors
      contributions={[GORVEK, SARN, STABLE_BOY]}
      propose={async (keep, absorbed) => {
        proposed.push({ keep, absorbed })
        return absorbed.map(
          (email) => `${keep.name} <${keep.email}> <${email}>`,
        )
      }}
      write={
        overrides.write ??
        (async (keep, absorbed) => {
          written.push({ keep, absorbed })
          return {
            path: '/realm/.mailmap',
            added: absorbed.map(
              (email) => `${keep.name} <${keep.email}> <${email}>`,
            ),
            alreadyPresent: [],
          }
        })
      }
      onMerged={() => {
        merged += 1
      }}
      onBack={() => {
        left += 1
      }}
    />,
  )
  const frame = () => stripAnsi(screen.lastFrame() ?? '')
  const press = async (...keys: string[]) => {
    for (const key of keys) {
      screen.stdin.write(key)
      await settle()
    }
  }
  return {
    frame,
    press,
    proposed,
    written,
    merged: () => merged,
    left: () => left,
  }
}

describe('MergeWarriors', () => {
  it('merges two warriors nothing links, shown as the one chosen', async () => {
    const screen = harness()
    await settle()

    // Mark Gorvek and Sarn, then choose to be shown as Sarn.
    await screen.press(' ', KEY.down, ' ', KEY.enter)
    expect(screen.frame()).toContain('shown as?')
    await screen.press(KEY.down, KEY.enter)

    expect(screen.proposed).toEqual([
      {
        keep: { name: SARN.displayName, email: SARN.email },
        absorbed: [GORVEK.email],
      },
    ])
    expect(screen.frame()).toContain(
      `Sarn the Faceless <sarn@kell.realm> <${GORVEK.email}>`,
    )
    // Shown, not written.
    expect(screen.written).toEqual([])

    await screen.press('w')
    expect(screen.written).toEqual(screen.proposed)
    expect(screen.frame()).toContain('Wrote 1 line to /realm/.mailmap')
  })

  it('says how to change the merge afterwards', async () => {
    const screen = harness()
    await settle()
    await screen.press(' ', KEY.down, ' ', KEY.enter, KEY.enter, 'w')
    const frame = screen.frame()

    expect(frame).toContain('To change this later, edit that file')
    expect(frame).toContain('change the first name and')
    expect(frame).toContain('delete the lines added here')
    expect(frame).toContain('commit it')
  })

  it('counts again once the file is written, and not before', async () => {
    const screen = harness()
    await settle()
    await screen.press(' ', KEY.down, ' ', KEY.enter, KEY.enter)
    expect(screen.merged()).toBe(0)

    await screen.press('w')
    expect(screen.merged()).toBe(0)
    await screen.press(KEY.enter)
    expect(screen.merged()).toBe(1)
  })

  it('will not go on with fewer than two marked', async () => {
    const screen = harness()
    await settle()
    await screen.press(' ', KEY.enter)

    expect(screen.frame()).not.toContain('shown as?')
    expect(screen.frame()).toContain('mark two or more')
  })

  it('unmarks a warrior marked twice', async () => {
    const screen = harness()
    await settle()
    await screen.press(' ', KEY.down, ' ', ' ', KEY.enter)

    expect(screen.frame()).not.toContain('shown as?')
  })

  it('starts with the warrior it was opened from already marked', async () => {
    const proposed: Call[] = []
    const screen = render(
      <MergeWarriors
        contributions={[GORVEK, SARN, STABLE_BOY]}
        initiallyMarked={STABLE_BOY.id}
        propose={async (keep, absorbed) => {
          proposed.push({ keep, absorbed })
          return []
        }}
        write={async () => ({ path: '', added: [], alreadyPresent: [] })}
        onMerged={noop}
        onBack={noop}
      />,
    )
    await settle()
    screen.stdin.write(KEY.up)
    await settle()
    screen.stdin.write(' ')
    await settle()
    screen.stdin.write(KEY.enter)
    await settle()
    screen.stdin.write(KEY.enter)
    await settle()

    expect(proposed).toEqual([
      {
        keep: { name: SARN.displayName, email: SARN.email },
        absorbed: [STABLE_BOY.email],
      },
    ])
  })

  it('says so when the file could not be written, and merges nothing', async () => {
    const screen = harness({
      write: async () => {
        throw new Error('EACCES: permission denied')
      },
    })
    await settle()
    await screen.press(' ', KEY.down, ' ', KEY.enter, KEY.enter, 'w')

    expect(screen.frame()).toContain('Could not merge them: EACCES')
    await screen.press(KEY.enter)
    expect(screen.merged()).toBe(0)
  })

  it('goes back a step with Esc, and leaves from the first', async () => {
    const screen = harness()
    await settle()
    await screen.press(' ', KEY.down, ' ', KEY.enter)
    await screen.press('q')
    expect(screen.frame()).toContain('[x]')
    expect(screen.left()).toBe(0)

    await screen.press('q')
    expect(screen.left()).toBe(1)
  })
})

describe('MergeWarriors, counting', () => {
  it('says one line, not one lines', async () => {
    const screen = render(
      <MergeWarriors
        contributions={[GORVEK, { ...STABLE_BOY, totalLines: 1 }]}
        propose={async () => []}
        write={async () => ({ path: '', added: [], alreadyPresent: [] })}
        onMerged={noop}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(screen.lastFrame() ?? '')

    expect(frame).toContain('1 line')
    expect(frame).not.toContain('1 lines')
    expect(frame).toContain('700 lines')
  })
})
