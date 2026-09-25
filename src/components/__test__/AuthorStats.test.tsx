import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { AuthorStats } from '../AuthorStats'
import {
  fakeAnalysisService,
  GORVEK,
  STABLE_BOY,
  settle,
  stripAnsi,
} from './fakeAnalysisService'

const noop = () => {}

describe('AuthorStats', () => {
  it("shows a warrior's lines, files, share and the files they hold most of", async () => {
    const { lastFrame } = render(
      <AuthorStats
        analysisService={fakeAnalysisService()}
        author={GORVEK}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Statistics for legend Gorvek the Ironbane')
    expect(frame).toContain('700')
    expect(frame).toContain('12')
    expect(frame).toContain('70%')
    expect(frame).toContain('GitService')
    expect(frame).toContain('[400/500]')
    expect(frame).toContain('README')
  })

  it('leaves the file list out for a warrior who holds no files', async () => {
    const { lastFrame } = render(
      <AuthorStats
        analysisService={fakeAnalysisService()}
        author={STABLE_BOY}
        onBack={noop}
      />,
    )
    await settle()
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Statistics for stable boy Ulfric of the Stables')
    expect(frame).not.toContain('Top files')
  })

  it('reports a failure rather than staying on loading', async () => {
    const { lastFrame } = render(
      <AuthorStats
        analysisService={fakeAnalysisService({
          getAuthorFileContributions: async () => {
            throw new Error('the archive is sealed')
          },
        })}
        author={GORVEK}
        onBack={noop}
      />,
    )
    await settle()

    expect(stripAnsi(lastFrame() ?? '')).toContain('the archive is sealed')
  })

  it('goes back on q', async () => {
    let left = 0
    const { stdin } = render(
      <AuthorStats
        analysisService={fakeAnalysisService()}
        author={GORVEK}
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
