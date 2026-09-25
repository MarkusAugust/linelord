import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { useState } from 'react'
import { BarbarianAnalysisService } from '../services/BarbarianAnalysisService'
import type { LineLordService } from '../services/LineLordService'
import type { WarriorSource } from '../services/WarriorSource'
import { useAsyncData } from '../utility/useAsyncData'
import BarbarianRankings, { WARRIORS_SHOWN } from './BarbarianRankings'
import { WarriorDetail } from './WarriorDetail'

interface BarbarianRankingBoxProps {
  onBack: () => void
  lineLordService?: LineLordService | null
  warriorSource?: WarriorSource | null
}

/**
 * Container component for the Brutal Barbarian Ranking System
 */
export const BarbarianRankingBox: React.FC<BarbarianRankingBoxProps> = ({
  onBack,
  lineLordService,
  warriorSource,
}) => {
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

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
  const shown = rankings.slice(0, WARRIORS_SHOWN)
  const chosen = shown[selected]

  useInput((input, key) => {
    if (inDetail) return
    if (key.escape || input === 'q' || input === 'Q') {
      onBack()
      return
    }
    if (key.upArrow) setSelected((at) => Math.max(0, at - 1))
    if (key.downArrow) {
      setSelected((at) => Math.min(shown.length - 1, at + 1))
    }
    if (key.return && chosen && warriorSource) setInDetail(true)
  })

  if (inDetail && chosen && warriorSource) {
    return (
      <WarriorDetail
        source={warriorSource}
        warrior={{
          authorId: chosen.authorId,
          name: chosen.displayName,
          email: chosen.email,
        }}
        onBack={() => setInDetail(false)}
      />
    )
  }

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
      <BarbarianRankings
        rankings={rankings}
        isLoading={isLoading}
        selected={selected}
      />

      {!isLoading && (
        <Box marginTop={1}>
          <Text color="gray">
            ↑↓ and Enter for one warrior · q to return to the main menu
          </Text>
        </Box>
      )}
    </Box>
  )
}

export default BarbarianRankingBox
