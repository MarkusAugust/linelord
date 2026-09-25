import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useMemo, useState } from 'react'
import type { AnalysisData } from '../core/model'
import { authorContributions, repositoryStats } from '../core/ownership'
import type { WarriorSource } from '../services/WarriorSource'
import { ContributorTable } from './ContributorTable'
import { RepositoryOverview } from './RepositoryOverview'
import { WarriorDetail } from './WarriorDetail'

type OverviewProps = {
  analysis: AnalysisData
  warriorSource: WarriorSource
  largeFileThresholdKB: number
  onBack: () => void
}

/**
 * The repository at a glance: what was analysed, and who holds how much of it.
 *
 * One screen where there were three. The contributor list on the menu, the
 * statistics screen and its extended twin all drew the same percentages, in
 * a list, a bar chart, a pie chart, its legend and a top-and-bottom box —
 * the same number for the same person up to four times on one screen. This
 * is the one table, and Enter on a row is where the detail went.
 *
 * Drawn from the analysis as values: nothing here waits on anything.
 */
export function Overview({
  analysis,
  warriorSource,
  largeFileThresholdKB,
  onBack,
}: OverviewProps) {
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  const stats = useMemo(() => repositoryStats(analysis), [analysis])
  const contributions = useMemo(() => authorContributions(analysis), [analysis])
  const chosen = contributions[selected]

  useInput((input, key) => {
    if (inDetail) return
    if (key.escape || input === 'q') {
      onBack()
      return
    }
    if (key.upArrow) setSelected((at) => Math.max(0, at - 1))
    if (key.downArrow) {
      setSelected((at) => Math.min(contributions.length - 1, at + 1))
    }
    if (key.return && chosen) setInDetail(true)
  })

  if (inDetail && chosen) {
    return (
      <WarriorDetail
        source={warriorSource}
        warrior={{
          authorId: chosen.id,
          name: chosen.displayName,
          email: chosen.email,
        }}
        onBack={() => setInDetail(false)}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Repository Overview'))}</Text>

      <Box marginY={1}>
        <RepositoryOverview
          developers={contributions.length}
          totalFiles={stats.totalFiles}
          filesAnalyzed={stats.totalAnalyzedFiles}
          binaryFilesSkipped={stats.totalBinaryFiles}
          ignoredFilesSkipped={stats.totalIgnoredFiles}
          largeFilesSkipped={stats.totalLargeFiles}
          largeFilesThresholdKB={largeFileThresholdKB}
          linesOfCode={stats.totalLines}
        />
      </Box>

      {contributions.length === 0 ? (
        <Text color="gray">Nobody holds a line in this repository.</Text>
      ) : (
        <ContributorTable contributions={contributions} selected={selected} />
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ and Enter for one warrior · q to go back</Text>
      </Box>
    </Box>
  )
}

export default Overview
