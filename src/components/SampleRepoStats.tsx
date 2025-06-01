import { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import type { AnalysisStep } from '../types/analysisTypes'

import { RepositoryOverview } from './RepositoryOverview'
import type {
  AnalysisService,
  AuthorContribution
} from '../services/AnalysisService'
import pc from 'picocolors'
import { ContributorRankingBox } from './ContributorRankingBox'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'
import { PieChartSection } from './PieChartSection'

type SimpleRepoStatsProps = {
  repoPath: string
  onBack: () => void
  largeFileThresholdKB: number
  analysisService?: AnalysisService
}

type AnalysisState = {
  isLoading: boolean
  step: AnalysisStep
  progress: number
  processedFiles?: number
  totalFiles: number
  totalLines: number
  binaryFiles: number
  ignoredFiles: number
  largeFiles: number
  contributions: AuthorContribution[]
  error: string | null
  stepMessage: string
}

export default function SimpleRepoStats({
  repoPath,
  onBack,
  largeFileThresholdKB,
  analysisService
}: SimpleRepoStatsProps) {
  const [state, setState] = useState<AnalysisState>({
    isLoading: true,
    step: 'initializing',
    progress: 0,
    contributions: [],
    totalFiles: 0,
    binaryFiles: 0,
    ignoredFiles: 0,
    totalLines: 0,
    largeFiles: 0,
    error: null,
    stepMessage: getRandomBarbarianMessage('initializing')
  })

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack()
    }
  })

  useEffect(() => {
    const analyzeRepository = async () => {
      if (!analysisService) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            'Analysis service not available. Please wait for initialization.',
          stepMessage: 'By Huge, the service is not ready!'
        }))
        return
      }

      try {
        setState((prev) => ({
          ...prev,
          isLoading: true,
          step: 'analyzing',
          progress: 10,
          stepMessage: getRandomBarbarianMessage('analyzing')
        }))

        // Get repository stats
        const repoStats = await analysisService.getRepositoryStats()

        setState((prev) => ({
          ...prev,
          progress: 30,
          totalFiles: repoStats.totalFiles,
          totalLines: repoStats.totalLines,
          binaryFiles: repoStats.totalBinaryFiles,
          ignoredFiles: repoStats.totalIgnoredFiles,
          largeFiles: repoStats.totalLargeFiles
        }))

        const authorContributions =
          await analysisService.getAuthorContributions()

        setState((prev) => ({
          ...prev,
          progress: 80,
          stepMessage: getRandomBarbarianMessage('scanning')
        }))

        setState({
          isLoading: false,
          step: 'complete',
          progress: 100,
          contributions: authorContributions,
          totalFiles: repoStats.totalFiles,
          totalLines: repoStats.totalLines,
          binaryFiles: repoStats.totalBinaryFiles,
          ignoredFiles: repoStats.totalIgnoredFiles,
          largeFiles: repoStats.totalLargeFiles,
          error: null,
          stepMessage: getRandomBarbarianMessage('complete')
        })
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error analyzing repository: ${
            error instanceof Error ? error.message : String(error)
          }`,
          stepMessage: 'By Huge, the analysis has failed!'
        }))
      }
    }

    analyzeRepository()
  }, [analysisService])

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Repository Statistics'))}</Text>

      <Box marginY={1}>
        <Text>Analyzing repository at: {pc.underline(repoPath)}</Text>
      </Box>

      {!state.isLoading && !state.error && (
        <Box flexDirection="column" marginY={1}>
          <Box flexDirection="row" gap={2}>
            <RepositoryOverview
              developers={state.contributions.length}
              totalFiles={state.totalFiles}
              filesAnalyzed={
                state.totalFiles -
                state.binaryFiles -
                state.ignoredFiles -
                state.largeFiles
              }
              binaryFilesSkipped={state.binaryFiles}
              ignoredFilesSkipped={state.ignoredFiles}
              largeFilesSkipped={state.largeFiles}
              largeFilesThresholdKB={largeFileThresholdKB}
              linesOfCode={state.totalLines}
            />
            <ContributorRankingBox contributions={state.contributions} />
          </Box>
          <Box marginBottom={1} marginTop={1}>
            <Text>{pc.bold('Developer Contributions Bar Chart:')}</Text>
          </Box>
          {state.contributions.map((dev, index) => (
            <Box
              key={`${dev.name}-${dev.email}`}
              marginBottom={index === state.contributions.length - 1 ? 1 : 0}
            >
              <Box flexDirection="column" width="100%">
                <Box flexDirection="row">
                  <Box>
                    <Text wrap="truncate-end">
                      {index === 0
                        ? pc.bold(pc.yellow('👑 '))
                        : pc.dim(`${(index + 1).toString().padStart(2, ' ')} `)}
                    </Text>
                    <Text>
                      {pc.cyan(dev.name.padEnd(25, ' ').substring(0, 25))}
                    </Text>
                    <Text> </Text>
                    <Text>{renderSimplePercentageBar(dev.percentage, 20)}</Text>
                    <Text> </Text>
                    <Text>{pc.bold(`${dev.percentage}%`)}</Text>
                    <Text> </Text>
                    <Text>
                      {pc.dim(`(${dev.totalLines.toLocaleString()} lines)`)}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}

          <PieChartSection contributions={state.contributions} />

          <Box marginTop={2}>
            <Text>{pc.dim('Press ESC or q to return to the menu')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
