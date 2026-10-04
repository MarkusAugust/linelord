import { afterEach, describe, expect, it } from 'bun:test'
import { type Driven, shell } from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

describe('Loading', () => {
  it('shows the banner, the quote, the progress and the message', async () => {
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
    expect(frame).toContain('██╗     ██╗███╗')
    expect(frame).toContain('"Forging the blade of analysis..."')
    expect(frame).toContain('50%')
    expect(frame).toContain('Analyzed 3/6 files')
    expect(frame).toContain(':q quit')
  })

  it('says what walking the history costs while it walks', async () => {
    screen = await shell({
      realm: {
        status: 'loading',
        fraction: 0.25,
        message: 'Snapshot 2 of 8',
        walkingHistory: true,
      },
    })
    expect(screen.frame()).toContain('⏳ Snapshot 2 of 8')
    expect(screen.frame()).toContain(
      'a pass over the repository for each snapshot',
    )
  })

  it('draws the small banner in a small terminal', async () => {
    screen = await shell(
      {
        realm: {
          status: 'loading',
          fraction: 0,
          message: 'Starting',
          walkingHistory: false,
        },
      },
      { width: 60, height: 16 },
    )
    expect(screen.frame()).toContain('█░░ █ █▄░█')
  })
})

describe('Failed', () => {
  it('shows the error, and Enter leads to choosing another realm', async () => {
    screen = await shell({
      realm: { status: 'failed', error: 'Not a git repository: /x' },
    })
    expect(screen.frame()).toContain('NO REALM')
    expect(screen.frame()).toContain('Not a git repository: /x')

    await screen.press('enter')
    expect(screen.frame()).toContain('CHOOSE A REALM')
  })
})
