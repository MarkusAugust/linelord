import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { BarbarianAnalysisService } from '../services/BarbarianAnalysisService'
import type { LineLordService } from '../services/LineLordService'
import { useAsyncData } from '../utility/useAsyncData'
import BarbarianRankings from './BarbarianRankings'

interface BarbarianRankingBoxProps {
  onBack: () => void
  lineLordService?: LineLordService | null
}

/**
 * Container component for the Brutal Barbarian Ranking System
 */
export const BarbarianRankingBox: React.FC<BarbarianRankingBoxProps> = ({
  onBack,
  lineLordService,
}) => {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onBack()
    }
  })

  const loaded = useAsyncData(async () => {
    if (!lineLordService?.isInitialized()) {
      throw new Error('LineLord service is unavailable or not initialized')
    }
    const barbarianService = new BarbarianAnalysisService(
      lineLordService.getDatabase(),
    )
    return barbarianService.getBarbarianRankings()
  }, [lineLordService])

  const error = loaded.status === 'failed' ? loaded.error : null
  const isLoading = loaded.status === 'loading'
  const rankings = loaded.status === 'ready' ? loaded.data : []

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          ⚔️ ERROR IN THE BARBARIC HALLS ⚔️
        </Text>
        <Text color="yellow">Error: {error}</Text>
        <Text color="gray">Press 'q' to return to menu</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <BarbarianRankings rankings={rankings} isLoading={isLoading} />

      {!isLoading && (
        <Box marginTop={1}>
          <Text color="gray">Press 'q' to return to main menu</Text>
        </Box>
      )}
    </Box>
  )
}

export default BarbarianRankingBox
