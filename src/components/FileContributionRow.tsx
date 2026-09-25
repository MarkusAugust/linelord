import { Box, Text } from 'ink'
import pc from 'picocolors'
import type { FileContribution } from '../services/AnalysisService'
import { parseFileName } from '../utility/fileName'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'

type FileContributionRowProps = {
  /** One-based place in the list it is drawn in. */
  position: number
  file: FileContribution
}

/**
 * One file somebody holds lines in: name, extension, their share of it as a
 * bar and a percentage, and the raw count behind the percentage.
 *
 * The same row is drawn wherever a person's files are listed, so that the
 * columns line up the same way on every screen.
 */
export function FileContributionRow({
  position,
  file,
}: FileContributionRowProps) {
  const { baseName, extension } = parseFileName(file.filename)

  const baseNameDisplay =
    baseName.length > 12
      ? `${baseName.substring(0, 12)}...`
      : baseName.padEnd(15, ' ')

  const extensionDisplay = extension
    ? pc.yellow(extension.padEnd(5, ' ').substring(0, 5))
    : ' '.repeat(5)

  const percentDisplay = `${file.percentage}%`.padStart(4, ' ')
  const lineCountDisplay = `[${file.authorLines}/${file.totalLines}]`

  return (
    <Box>
      <Text>
        {pc.dim(`${position.toString().padStart(2, ' ')}. `)}
        {baseNameDisplay}
        {extension ? ' .' : '  '}
        {extensionDisplay}
        {'  '}
        <Text dimColor>{renderSimplePercentageBar(file.percentage, 10)}</Text>
        {'  '}
        {pc.bold(percentDisplay)}
        {'    '}
        {pc.dim(lineCountDisplay)}
      </Text>
    </Box>
  )
}
