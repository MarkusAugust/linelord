import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useEffect, useState } from 'react'

import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import type {
  AnalysisService,
  AuthorContribution,
} from '../services/AnalysisService'
import type { AnalysisStep } from '../types/analysisTypes'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'
import { ContributorRankingBox } from './ContributorRankingBox'
import { PieChartSection } from './PieChartSection'
import { EnhancedProgressBar } from './ProgressBar'
import { RepositoryOverview } from './RepositoryOverview'

type RepoStatsProps = {
  repoPath: string
  onBack: () => void
  largeFileThresholdKB: number
  analysisService?: AnalysisService
}

interface ExtendedAuthorContribution extends AuthorContribution {
  topFiles?: Array<{
    filename: string
    path: string
    authorLines: number
    totalLines: number
    percentage: number
  }>

  aliases?: Array<{ name: string; email: string }>
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
  contributions: ExtendedAuthorContribution[]
  error: string | null
  stepMessage: string
}

export default function RepoStats({
  repoPath,
  onBack,
  largeFileThresholdKB,
  analysisService,
}: RepoStatsProps) {
  const [state, setState] = useState<AnalysisState>({
    isLoading: true,
    step: 'initializing',
    progress: 0,
    contributions: [],
    totalFiles: 0,
    binaryFiles: 0,
    ignoredFiles: 0,
    largeFiles: 0,
    totalLines: 0,
    error: null,
    stepMessage: getRandomBarbarianMessage('initializing'),
  })

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack()
    }
  })

  useEffect(() => {
    if (state.isLoading) {
      const newMessage = getRandomBarbarianMessage(state.step)
      setState((prev) => ({
        ...prev,
        stepMessage: newMessage,
      }))
    }
  }, [state.step, state.isLoading])

  const parseFileName = (filename: string) => {
    if (filename.startsWith('.')) {
      const remainingName = filename.slice(1)
      const dotIndex = remainingName.indexOf('.')

      if (dotIndex === -1) {
        return {
          baseName: filename,
          extension: '',
        }
      }
      return {
        baseName: filename.slice(0, dotIndex + 1),
        extension: remainingName.slice(dotIndex + 1),
      }
    }

    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return {
        baseName: filename,
        extension: '',
      }
    }
    return {
      baseName: filename.slice(0, lastDotIndex),
      extension: filename.slice(lastDotIndex + 1),
    }
  }

  useEffect(() => {
    const analyzeRepository = async () => {
      if (!analysisService) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            'Analysis service not available. Please wait for initialization.',
          stepMessage: 'By Huge, the service is not ready!',
        }))
        return
      }

      try {
        setState((prev) => ({
          ...prev,
          isLoading: true,
          step: 'analyzing',
          progress: 10,
          stepMessage: getRandomBarbarianMessage('analyzing'),
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
          largeFiles: repoStats.totalLargeFiles,
        }))

        // Get author contributions with detailed info
        const authorContributions =
          await analysisService.getAuthorContributions()

        setState((prev) => ({
          ...prev,
          progress: 60,
          stepMessage: getRandomBarbarianMessage('scanning'),
        }))

        // Get detailed file contributions for each author
        const extendedContributions: ExtendedAuthorContribution[] = []

        for (const author of authorContributions) {
          setState((prev) => ({
            ...prev,
            progress:
              60 +
              (extendedContributions.length / authorContributions.length) * 20,
          }))

          const fileContributions =
            await analysisService.getAuthorFileContributions(author.id)

          extendedContributions.push({
            id: author.id,
            name: author.name,
            email: author.email,
            displayName: author.displayName,
            totalLines: author.totalLines,
            totalFiles: author.totalFiles,
            percentage: author.percentage,
            title: author.title,
            rank: author.rank,
            topFiles: fileContributions.slice(0, 5).map((file) => ({
              filename: file.filename,
              path: file.path,
              authorLines: file.authorLines,
              totalLines: file.totalLines,
              percentage: file.percentage,
            })),
            aliases: author.aliases,
          })
        }

        setState({
          isLoading: false,
          step: 'complete',
          progress: 100,
          contributions: extendedContributions,
          totalFiles: repoStats.totalFiles,
          totalLines: repoStats.totalLines,
          binaryFiles: repoStats.totalBinaryFiles,
          ignoredFiles: repoStats.totalIgnoredFiles,
          largeFiles: repoStats.totalLargeFiles,
          error: null,
          stepMessage: getRandomBarbarianMessage('complete'),
        })
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error analyzing repository: ${
            error instanceof Error ? error.message : String(error)
          }`,
          stepMessage: 'By Huge, the analysis has failed!',
        }))
      }
    }

    analyzeRepository()
  }, [analysisService])

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Extended Repository Statistics'))}</Text>

      <Box marginY={1}>
        <Text>Analyzing repository at: {pc.underline(repoPath)}</Text>
      </Box>

      {state.isLoading ? (
        <Box flexDirection="column" marginY={1}>
          <Box marginBottom={1}>
            <Text>
              {pc.yellow('⚔️ ')} {state.stepMessage}
            </Text>
          </Box>
          <EnhancedProgressBar
            value={state.progress}
            total={100}
            label={state.step === 'scanning' ? 'Processing files' : 'Analyzing'}
            color={state.step === 'scanning' ? 'blue' : 'green'}
            width={30}
          />
        </Box>
      ) : state.error ? (
        <Box marginY={1}>
          <Text color="red">{state.error}</Text>
          <Text>Press ESC or q to return to the menu</Text>
        </Box>
      ) : (
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
            <Text>
              {pc.bold('Current contribution ranking (by lines of code):')}
            </Text>
          </Box>
          {state.contributions.map((dev, index) => (
            <Box
              key={`${dev.name}-${dev.email}`}
              marginTop={1}
              marginBottom={index === state.contributions.length - 1 ? 0 : 1}
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
                <Box flexDirection="column" paddingLeft={3}>
                  <Text dimColor>{`${dev.email}`}</Text>
                  {dev.aliases && dev.aliases.length > 0 && (
                    <Text dimColor>
                      Aliases: {dev.aliases.map((a) => a.name).join(', ')}
                    </Text>
                  )}
                </Box>

                {dev.topFiles && dev.topFiles.length > 0 && (
                  <Box flexDirection="column" paddingLeft={3} marginTop={1}>
                    <Text>{pc.dim('Top files:')}</Text>
                    {dev.topFiles.map((file, fileIndex) => {
                      const { baseName, extension } = parseFileName(
                        file.filename,
                      )

                      const baseNameDisplay =
                        baseName.length > 12
                          ? `${baseName.substring(0, 12)}...`
                          : baseName.padEnd(15, ' ')

                      const extensionDisplay = extension
                        ? pc.yellow(extension.padEnd(5, ' ').substring(0, 5))
                        : ' '.repeat(5)

                      const percentDisplay = `${file.percentage}%`.padStart(
                        4,
                        ' ',
                      )
                      const lineCountDisplay = `[${file.authorLines}/${file.totalLines}]`

                      return (
                        <Box key={`${index}-${fileIndex}-${file.filename}`}>
                          <Text>
                            {pc.dim(
                              `${(fileIndex + 1).toString().padStart(2, ' ')}. `,
                            )}
                            {baseNameDisplay}
                            {extension ? ' .' : '  '}
                            {extensionDisplay}
                            {'  '}
                            <Text dimColor>
                              {renderSimplePercentageBar(
                                file.percentage,
                                10,
                                'green',
                              )}
                            </Text>
                            {'  '}
                            {pc.bold(percentDisplay)}
                            {'    '}
                            {pc.dim(lineCountDisplay)}
                          </Text>
                        </Box>
                      )
                    })}
                  </Box>
                )}
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
