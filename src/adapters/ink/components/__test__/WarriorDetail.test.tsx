import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { WarriorDetail } from '../WarriorDetail'
import {
  fakeWarriorSource,
  GORVEK,
  GORVEK_SURVIVAL,
  STABLE_BOY,
  settle,
  stripAnsi,
} from './fakeAnalysisService'

const noop = () => {}

const gorvek = {
  authorId: GORVEK.id,
  name: GORVEK.displayName,
  email: GORVEK.email,
}

describe('WarriorDetail', () => {
  it('shows their share, how old it is, where it sits, and the files they hold most of', async () => {
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource()}
        warrior={gorvek}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Gorvek the Ironbane')
    expect(frame).toContain('gorvek@ashendale.realm')
    expect(frame).toContain('legend')
    expect(frame).toContain('700 lines in 12 files')
    expect(frame).toContain('70.0%')

    expect(frame).toContain('How old it is')
    expect(frame).toContain('1y 1m') // the median, 400 days
    expect(frame).toContain('under a week')
    expect(frame).toContain('src/old.ts:1')
    expect(frame).toContain('src/new.ts:4')

    expect(frame).toContain('Files they hold the most of')
    expect(frame).toContain('GitService')
    expect(frame).toContain('[400/500]')

    expect(frame).toContain('Where the oldest of it sits')
    expect(frame).toContain('tsconfig.json')
  })

  it('leaves the history section out when no history has been walked', async () => {
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource()}
        warrior={gorvek}
        onBack={noop}
      />,
    )
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).not.toContain('What became of it')
  })

  it('draws what became of their work when the history knows', async () => {
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource({ survival: async () => GORVEK_SURVIVAL })}
        warrior={gorvek}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('What became of it')
    expect(frame).toContain(
      '1,000 lines written in all, 700 still standing — 70%',
    )
    expect(frame).toContain("Half of a month's work is gone after 4m")
  })

  it('says a forgotten warrior holds nothing now, and still shows what they wrote', async () => {
    // Somebody whose every line has been rewritten has no share and no age,
    // and is exactly who the history exists to show.
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource({
          share: async () => null,
          age: async () => null,
          survival: async () => ({
            ...GORVEK_SURVIVAL,
            survivingLines: 0,
            survivalRate: 0,
          }),
        })}
        warrior={gorvek}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Holds no line in the analysed revision')
    expect(frame).not.toContain('How old it is')
    expect(frame).toContain('1,000 lines written in all, 0 still standing — 0%')
  })

  it('shows a share without an age when the lines carry no date', async () => {
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource()}
        warrior={{
          authorId: STABLE_BOY.id,
          name: STABLE_BOY.displayName,
          email: STABLE_BOY.email,
        }}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('50 lines in 1 file ')
    expect(frame).not.toContain('How old it is')
    expect(frame).not.toContain('Files they hold the most of')
  })

  it('reports a failure rather than staying on loading', async () => {
    const { lastFrame } = render(
      <WarriorDetail
        source={fakeWarriorSource({
          files: async () => {
            throw new Error('the archive is sealed')
          },
        })}
        warrior={gorvek}
        onBack={noop}
      />,
    )
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).toContain('the archive is sealed')
  })

  it('goes back on q', async () => {
    let left = 0
    const { stdin } = render(
      <WarriorDetail
        source={fakeWarriorSource()}
        warrior={gorvek}
        onBack={() => {
          left += 1
        }}
      />,
    )
    await settle()
    stdin.write('q')
    await settle()

    expect(left).toBe(1)
  })
})
