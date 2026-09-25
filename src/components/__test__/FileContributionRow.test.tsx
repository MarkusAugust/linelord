import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { FileContributionRow } from '../FileContributionRow'

const stripAnsi = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is what an escape code is
  text.replace(/\[[0-9;]*m/g, '')

describe('FileContributionRow', () => {
  it('shows position, name, extension, share and the line count', () => {
    const { lastFrame } = render(
      <FileContributionRow
        position={1}
        file={{
          filename: 'GitService.ts',
          path: 'src/services/GitService.ts',
          authorLines: 400,
          totalLines: 929,
          percentage: 43,
        }}
      />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain(' 1. ')
    expect(frame).toContain('GitService')
    expect(frame).toContain('.ts')
    expect(frame).toContain('43%')
    expect(frame).toContain('[400/929]')
  })

  it('shortens a long name rather than pushing the columns out of line', () => {
    const { lastFrame } = render(
      <FileContributionRow
        position={12}
        file={{
          filename: 'AuthorNormalizationService.ts',
          path: 'src/services/AuthorNormalizationService.ts',
          authorLines: 1,
          totalLines: 457,
          percentage: 0,
        }}
      />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('AuthorNormal...')
    expect(frame).not.toContain('AuthorNormalizationService')
    expect(frame).toContain('12. ')
  })

  it('leaves the extension column blank for a file that has none', () => {
    const { lastFrame } = render(
      <FileContributionRow
        position={2}
        file={{
          filename: 'Makefile',
          path: 'Makefile',
          authorLines: 10,
          totalLines: 10,
          percentage: 100,
        }}
      />,
    )
    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('Makefile')
    expect(frame).not.toContain('Makefile .')
    expect(frame).toContain('100%')
  })
})
