import { Box, Text } from 'ink'
import pc from 'picocolors'

type RepositoryOverviewProps = {
  developers: number
  totalFiles: number
  filesAnalyzed: number
  binaryFilesSkipped: number
  ignoredFilesSkipped: number
  largeFilesSkipped: number
  largeFilesThresholdKB: number
  linesOfCode: number
}

export function RepositoryOverview({
  developers,
  totalFiles,
  filesAnalyzed,
  binaryFilesSkipped,
  ignoredFilesSkipped,
  largeFilesSkipped,
  largeFilesThresholdKB,
  linesOfCode,
}: RepositoryOverviewProps) {
  return (
    <Box flexDirection="column" borderStyle={'round'} padding={1} width={40}>
      <Box marginBottom={1} alignSelf="center">
        <Text>{pc.bold('Repository Overview')}</Text>
      </Box>

      {/* Header */}
      <Box justifyContent="space-between">
        <Text>Metric</Text>
        <Text>Count</Text>
      </Box>

      <Text>{'─'.repeat(36)}</Text>

      {/* Data rows */}
      <Box justifyContent="space-between">
        <Text>Developers</Text>
        <Text>{pc.yellow(developers.toString())}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>Total files</Text>
        <Text>{totalFiles.toLocaleString()}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>Files analyzed</Text>
        <Text>{pc.green(filesAnalyzed.toLocaleString())}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>Ignored files</Text>
        <Text>{pc.dim(ignoredFilesSkipped.toLocaleString())}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>Binary files skipped</Text>
        <Text>{pc.dim(binaryFilesSkipped.toLocaleString())}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>{`Large files skipped (>${largeFilesThresholdKB}KB)`}</Text>
        <Text>{pc.dim(largeFilesSkipped.toLocaleString())}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text>Lines of code</Text>
        <Text>{pc.bold(pc.green(linesOfCode.toLocaleString()))}</Text>
      </Box>
    </Box>
  )
}
