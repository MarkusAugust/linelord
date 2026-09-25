import { Box, Text } from 'ink'
import type { AuthorContribution } from '../services/AnalysisService'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'

type ContributorTableProps = {
  contributions: AuthorContribution[]
  /** Index of the highlighted row, or none. */
  selected?: number
}

const NAME_WIDTH = 24
const BAR_WIDTH = 20

/** The crown and medals, for the three who hold the most. */
function positionIcon(rank: number | null): string {
  switch (rank) {
    case 1:
      return '👑 '
    case 2:
      return '🥈 '
    case 3:
      return '🥉 '
    default:
      return ''
  }
}

/**
 * Every contributor, ranked by the share of the codebase they hold.
 *
 * Two lines a person: the ranking on the first, and on the second the title
 * and the address — the address because it is what tells two entries with
 * the same name apart, and that is a thing worth being able to see.
 */
export function ContributorTable({
  contributions,
  selected,
}: ContributorTableProps) {
  return (
    <Box flexDirection="column">
      <Text bold>
        {'   # '}
        {'Warrior'.padEnd(NAME_WIDTH)}
        {'Share'.padStart(7)}
        {'Lines'.padStart(9)}
      </Text>

      {contributions.map((one, index) => {
        const highlighted = index === selected
        return (
          <Box key={one.id} flexDirection="column">
            <Text color={highlighted ? 'green' : undefined}>
              {highlighted ? '› ' : '  '}
              {String(index + 1).padStart(2)}{' '}
              {one.displayName.slice(0, NAME_WIDTH - 1).padEnd(NAME_WIDTH)}
              {`${one.percentage.toFixed(1)}%`.padStart(7)}
              {one.totalLines.toLocaleString('en-GB').padStart(9)}
              {'  '}
              {renderSimplePercentageBar(one.percentage, BAR_WIDTH)}
            </Text>
            <Text color="gray">
              {'     '}
              {positionIcon(one.rank)}
              {one.title ?? ''}
              {one.title ? ' · ' : ''}
              {one.email}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
