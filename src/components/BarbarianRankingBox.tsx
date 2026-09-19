import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { useEffect, useState } from 'react'
import { BarbarianAnalysisService } from '../services/BarbarianAnalysisService'
import type { LineLordService } from '../services/LineLordService'
import type { BarbarianRanking } from '../types/analysisTypes'
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
  const [rankings, setRankings] = useState<BarbarianRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onBack()
    }
  })

  useEffect(() => {
    // Ink owns the terminal, so a result arriving after the screen has been
    // left must not be written into a dead component.
    let cancelled = false

    const loadBarbarianRankings = async () => {
      if (!lineLordService?.isInitialized()) {
        if (cancelled) return
        setError('LineLord service is unavailable or not initialized')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const barbarianService = new BarbarianAnalysisService(
          lineLordService.getDatabase(),
        )
        const barbarianRankings = await barbarianService.getBarbarianRankings()

        if (cancelled) return
        setRankings(barbarianRankings)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load barbarian rankings',
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadBarbarianRankings()

    return () => {
      cancelled = true
    }
  }, [lineLordService])

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
