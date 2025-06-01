import { Box, Text } from 'ink'
import pc from 'picocolors'
import { pieChartColors } from '../utility/pieChartColors'
import type { AuthorContribution } from '../services/AnalysisService'

type PieChartSectionProps = {
  contributions: AuthorContribution[]
}

export function PieChartSection({ contributions }: PieChartSectionProps) {
  return (
    <>
      <Box marginTop={2} marginBottom={1}>
        <Text>
          {pc.bold('Contribution Distribution (Horizontal Pie Chart):')}
        </Text>
      </Box>
      <Box flexDirection="row">
        {contributions.slice(0, 10).map((dev, index) => {
          const totalWidth = 60 // Fixed width for the entire bar
          const width = Math.max(
            1,
            Math.round((dev.percentage / 100) * totalWidth)
          )

          return (
            <Text key={dev.name}>
              {(
                pieChartColors[index % pieChartColors.length] ??
                ((s: string) => s)
              )('█'.repeat(width))}
            </Text>
          )
        })}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text>{pc.bold('Legend (Top 10 Contributors):')}</Text>
        </Box>
        {contributions.slice(0, 10).map((dev, index) => {
          return (
            <Box key={dev.name} flexDirection="row">
              <Text>
                {(
                  pieChartColors[index % pieChartColors.length] ??
                  ((s: string) => s)
                )('█')}{' '}
              </Text>
              <Text>
                {dev.name} ({Math.round(dev.percentage)}%)
              </Text>
            </Box>
          )
        })}
        {contributions.length > 10 && (
          <Box marginTop={1}>
            <Text>
              {pc.dim(
                `... and ${contributions.length - 10} other contributors`
              )}
            </Text>
          </Box>
        )}
      </Box>
    </>
  )
}
