import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { Overview } from '../Overview'
import {
  fakeAnalysis,
  fakeWarriorSource,
  GORVEK,
  KEY,
  SARN,
  STABLE_BOY,
  settle,
  stripAnsi,
} from './fakeAnalysisService'

const noop = () => {}

describe('Overview', () => {
  it('draws the repository summary and every contributor with their share', async () => {
    const { lastFrame } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    // The file categories, as the repository overview box has always shown.
    expect(frame).toContain('Lines of code')
    expect(frame).toContain('1,000')
    expect(frame).toContain('Files analyzed')

    for (const one of [GORVEK, SARN, STABLE_BOY]) {
      expect(frame).toContain(one.displayName)
      expect(frame).toContain(one.email)
      expect(frame).toContain(one.title ?? '')
    }
    expect(frame).toContain('70.0%')
    expect(frame).toContain('700')
  })

  it('says the same number of developers as it lists', async () => {
    const { lastFrame } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toMatch(/Developers\s+3/)
  })

  it('moves the selection with the arrow keys and opens a warrior with Enter', async () => {
    const { lastFrame, stdin } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
      />,
    )
    await settle()

    stdin.write(KEY.down)
    await settle()
    stdin.write(KEY.enter)
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain(SARN.displayName)
    expect(frame).toContain('Holds 250 lines in 5 files')
    // The repository box is gone: the detail has the screen to itself.
    expect(frame).not.toContain('Files analyzed')
  })

  it('does not move the selection past the last row or before the first', async () => {
    const { lastFrame, stdin } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
      />,
    )
    await settle()

    stdin.write(KEY.up)
    await settle()
    for (let i = 0; i < 5; i++) stdin.write(KEY.down)
    await settle()
    stdin.write(KEY.enter)
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      `Holds ${STABLE_BOY.totalLines} lines in 1 file`,
    )
  })

  it('comes back from a warrior to the same table, and q leaves the screen', async () => {
    let left = 0
    const { lastFrame, stdin } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={() => {
          left += 1
        }}
      />,
    )
    await settle()

    stdin.write(KEY.enter)
    await settle()
    expect(stripAnsi(lastFrame() ?? '')).toContain('Holds 700 lines')

    stdin.write('q')
    await settle()
    expect(stripAnsi(lastFrame() ?? '')).toContain('Files analyzed')
    expect(left).toBe(0)

    stdin.write('q')
    await settle()
    expect(left).toBe(1)
  })

  it('has a line for a repository nobody has written in', async () => {
    const { lastFrame } = render(
      <Overview
        analysis={fakeAnalysis([])}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
      />,
    )
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).toContain('Nobody holds a line')
  })

  it('opens the merge with m, starting from the warrior highlighted', async () => {
    const proposed: string[][] = []
    const { lastFrame, stdin } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
        merge={{
          propose: async (_keep, absorbed) => {
            proposed.push(absorbed)
            return []
          },
          write: async () => ({ path: '', added: [], alreadyPresent: [] }),
          onMerged: noop,
        }}
      />,
    )
    await settle()

    stdin.write(KEY.down)
    await settle()
    stdin.write('m')
    await settle()
    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'Merge warriors who are one person',
    )

    // Sarn is marked already; mark Gorvek above him, keep Gorvek.
    stdin.write(KEY.up)
    await settle()
    stdin.write(' ')
    await settle()
    stdin.write(KEY.enter)
    await settle()
    stdin.write(KEY.enter)
    await settle()
    expect(proposed).toEqual([[SARN.email]])

    // Back out of every step to the table again.
    for (const key of ['q', 'q', 'q']) {
      stdin.write(key)
      await settle()
    }
    expect(stripAnsi(lastFrame() ?? '')).toContain('Files analyzed')
  })

  it('says m merges in its footer', async () => {
    const { lastFrame } = render(
      <Overview
        analysis={fakeAnalysis()}
        warriorSource={fakeWarriorSource()}
        largeFileThresholdKB={50}
        onBack={noop}
        merge={{
          propose: async () => [],
          write: async () => ({ path: '', added: [], alreadyPresent: [] }),
          onMerged: noop,
        }}
      />,
    )
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).toContain('m to merge')
  })
})
