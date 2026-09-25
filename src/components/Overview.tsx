import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useState } from 'react'
import type { AnalysisService } from '../services/AnalysisService'
import { useAsyncData } from '../utility/useAsyncData'
import { AuthorStats } from './AuthorStats'
import { ContributorTable } from './ContributorTable'
import { RepositoryOverview } from './RepositoryOverview'

/** What the overview needs to know, which a test can supply without a database. */
export type OverviewSource = Pick<
  AnalysisService,
  'getRepositoryStats' | 'getAuthorContributions' | 'getAuthorFileContributions'
>

type OverviewProps = {
  analysisService: OverviewSource
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
 */
export function Overview({
  analysisService,
  largeFileThresholdKB,
  onBack,
}: OverviewProps) {
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  const loaded = useAsyncData(async () => {
    const [stats, contributions] = await Promise.all([
      analysisService.getRepositoryStats(),
      analysisService.getAuthorContributions(),
    ])
    return { stats, contributions }
  }, [analysisService])

  const contributions =
    loaded.status === 'ready' ? loaded.data.contributions : []
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
      <AuthorStats
        analysisService={analysisService}
        author={chosen}
        onBack={() => setInDetail(false)}
      />
    )
  }

  if (loaded.status === 'loading') {
    return <Text color="gray">Surveying the realm…</Text>
  }

  if (loaded.status === 'failed') {
    return <Text color="red">Could not survey the realm: {loaded.error}</Text>
  }

  const { stats } = loaded.data

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
