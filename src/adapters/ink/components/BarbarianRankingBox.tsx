import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { useMemo, useState } from 'react'
import { barbarianRankings } from '../../../core/barbarian'
import type { AnalysisData } from '../../../core/model'
import type { WarriorSource } from '../../../core/warrior'
import BarbarianRankings, { WARRIORS_SHOWN } from './BarbarianRankings'
import { WarriorDetail } from './WarriorDetail'

interface BarbarianRankingBoxProps {
  analysis: AnalysisData
  warriorSource: WarriorSource
  onBack: () => void
  /** The instant ancient code is measured against. Injected so a test can fix it. */
  now?: Date
}

/**
 * The Brutal Barbarian Ranking System, with a cursor.
 *
 * Drawn from the analysis as values: the rankings are computed once per
 * analysis and nothing here waits.
 */
export const BarbarianRankingBox: React.FC<BarbarianRankingBoxProps> = ({
  analysis,
  warriorSource,
  onBack,
  now,
}) => {
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  const measuredAt = useMemo(() => now ?? new Date(), [now])
  const rankings = useMemo(
    () => barbarianRankings(analysis, measuredAt),
    [analysis, measuredAt],
  )
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
    if (key.return && chosen) setInDetail(true)
  })

  if (inDetail && chosen) {
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

  return (
    <Box flexDirection="column">
      <BarbarianRankings rankings={rankings} selected={selected} />

      <Box marginTop={1}>
        <Text color="gray">
          ↑↓ and Enter for one warrior · q to return to the main menu
        </Text>
      </Box>
    </Box>
  )
}

export default BarbarianRankingBox
