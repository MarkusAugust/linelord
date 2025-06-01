import { Box, Text } from 'ink'
import pc from 'picocolors'
import { getDistributedTitles } from '../resources/rankedTitles'

import type { AuthorContribution } from '../services/AnalysisService'

type ContributorRankingBoxProps = {
  contributions: AuthorContribution[]
}

export function ContributorRankingBox({
  contributions
}: ContributorRankingBoxProps) {
  const topContributor = contributions[0]
  const bottomContributor =
    contributions.length > 1 ? contributions[contributions.length - 1] : null

  // Get distributed titles for all contributors
  const distributedTitles = getDistributedTitles(contributions.length)

  // Helper function for very long names
  const formatName = (name: string): string => {
    if (name.length <= 30) return name // Let it wrap naturally
    return `${name.substring(0, 27)}...` // Truncate if too long
  }

  return (
    <Box
      borderStyle={'round'}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      gap={1}
      padding={1}
      width={30}
    >
      <Box flexDirection="column" alignItems="center">
        <Text>Glorious</Text>
        <Text>{distributedTitles[0] || 'unknown'}</Text>
        {topContributor ? (
          <Box alignItems="center" flexDirection="column">
            <Text wrap="wrap">
              {pc.bold(pc.red(formatName(topContributor.name)))}
            </Text>
            <Text>{Math.round(topContributor.percentage)}%</Text>
          </Box>
        ) : (
          <Text>{pc.dim('No contributors')}</Text>
        )}
      </Box>

      {bottomContributor && (
        <Box flexDirection="column" alignItems="center">
          <Text>Lowly</Text>
          <Text>
            {distributedTitles[distributedTitles.length - 1] || 'peasant'}
          </Text>
          <Box alignItems="center" flexDirection="column">
            <Text wrap="wrap">
              {pc.dim(formatName(bottomContributor.name))}
            </Text>
            <Text>{Math.round(bottomContributor.percentage)}%</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
