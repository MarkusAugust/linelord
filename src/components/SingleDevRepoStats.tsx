import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useEffect, useState } from 'react'
import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import type { AnalysisService } from '../services/AnalysisService'
import type { AnalysisStep } from '../types/analysisTypes'
import { AuthorSelector } from './AuthorSelector'
import { FileContributionRow } from './FileContributionRow'
import { EnhancedProgressBar } from './ProgressBar'

// Simple Author interface to match AuthorSelector
interface Author {
  name: string
  email: string
  alternativeNames?: string[]
}

type SingleDevRepoStatsProps = {
  repoPath: string
  onBack: () => void
  analysisService?: AnalysisService | null
}

interface AuthorInfo {
  id: number
  name: string
  email: string
  displayName: string
  title: string | null
  rank: number | null
  aliases: string[]
}

interface FileContribution {
  filename: string
  path: string
  authorLines: number
  totalLines: number
  percentage: number
}

interface AuthorStats {
  totalLines: number
  totalFiles: number
  percentage: number
  title: string | null
  rank: number | null
  fileContributions: FileContribution[]
}

type StatsState = {
  isLoading: boolean
  authorStats: AuthorStats | null
  currentStep: AnalysisStep
  progress: number
  stepMessage: string
  error: string | null
}

export default function SingleDevRepoStats({
  repoPath,
  onBack,
  analysisService,
}: SingleDevRepoStatsProps) {
  const [mode, setMode] = useState<'selector' | 'stats'>('selector')
  const [selectedAuthor, setSelectedAuthor] = useState<AuthorInfo | null>(null)
  /** A lookup that failed or found nobody, reported where the user is standing. */
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [stats, setStats] = useState<StatsState>({
    isLoading: false,
    authorStats: null,
    currentStep: 'initializing',
    progress: 0,
    stepMessage: getRandomBarbarianMessage('initializing'),
    error: null,
  })

  useInput((input, key) => {
    if (mode === 'stats' && (key.escape || input === 'q')) {
      setMode('selector')
      setSelectedAuthor(null)
    }
  })

  useEffect(() => {
    if (stats.isLoading) {
      setStats((prev) => ({
        ...prev,
        stepMessage: getRandomBarbarianMessage(prev.currentStep),
      }))
    }
  }, [stats.isLoading])

  useEffect(() => {
    if (!selectedAuthor || mode !== 'stats' || !analysisService) {
      return
    }

    const analyzeAuthorStats = async () => {
      setStats({
        isLoading: true,
        authorStats: null,
        currentStep: 'analyzing',
        progress: 10,
        stepMessage: getRandomBarbarianMessage('analyzing'),
        error: null,
      })

      try {
        setStats((prev) => ({
          ...prev,
          progress: 30,
        }))

        // Get author contributions to find our author
        const authorContributions =
          await analysisService.getAuthorContributions()
        const authorContrib = authorContributions.find(
          (a) => a.id === selectedAuthor.id,
        )

        if (!authorContrib) {
          setStats({
            isLoading: false,
            authorStats: null,
            currentStep: 'complete',
            progress: 100,
            stepMessage: 'Author not found in repository',
            error:
              'This author has no contributions in the current repository.',
          })
          return
        }

        setStats((prev) => ({
          ...prev,
          progress: 60,
          currentStep: 'scanning',
        }))

        // Get detailed file contributions
        const fileContributions =
          await analysisService.getAuthorFileContributions(selectedAuthor.id)

        setStats((prev) => ({
          ...prev,
          progress: 90,
        }))

        const authorStats: AuthorStats = {
          totalLines: authorContrib.totalLines,
          totalFiles: authorContrib.totalFiles,
          percentage: authorContrib.percentage,
          title: authorContrib.title,
          rank: authorContrib.rank,
          fileContributions: fileContributions.map((file) => ({
            filename: file.filename,
            path: file.path,
            authorLines: file.authorLines,
            totalLines: file.totalLines,
            percentage: file.percentage,
          })),
        }

        setTimeout(() => {
          setStats({
            isLoading: false,
            authorStats,
            currentStep: 'complete',
            progress: 100,
            stepMessage: getRandomBarbarianMessage('complete'),
            error: null,
          })
        }, 300)
      } catch (error) {
        // Reported through the stats state below, not to the terminal Ink owns.
        setStats({
          isLoading: false,
          authorStats: null,
          currentStep: 'complete',
          progress: 100,
          stepMessage: 'By Huge, the analysis has failed!',
          error: `Error analyzing author stats: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }
    }

    analyzeAuthorStats()
  }, [selectedAuthor, mode, analysisService])

  const handleSelectAuthor = async (author: Author) => {
    // Find the author ID from the analysis service
    if (!analysisService) return

    setLookupError(null)

    try {
      const authorId = await analysisService.findCanonicalAuthorByEmail(
        author.email,
      )
      if (authorId === null) {
        // Selecting a warrior the lookup cannot resolve used to do nothing at
        // all, which is indistinguishable from the key press being ignored.
        setLookupError(
          `No warrior is recorded under ${author.email}. They may have been merged into another identity.`,
        )
        return
      }
      if (authorId) {
        // Get the full author contribution data to get title and rank
        const authorContributions =
          await analysisService.getAuthorContributions()
        const authorContrib = authorContributions.find((a) => a.id === authorId)

        setSelectedAuthor({
          id: authorId,
          name: author.name,
          email: author.email,
          displayName: author.name,
          title: authorContrib?.title || null,
          rank: authorContrib?.rank || null,
          aliases: author.alternativeNames || [],
        })

        setMode('stats')
      }
    } catch (error) {
      // This used to go to the console and nowhere else, so a lookup failure
      // looked like the key press had simply not registered.
      setLookupError(
        `Could not look up ${author.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const handleAuthorSelectorCancel = () => {
    onBack()
  }

  if (mode === 'selector') {
    return (
      <Box flexDirection="column">
        {lookupError && (
          <Box marginBottom={1}>
            <Text color="yellow">⚠ {lookupError}</Text>
          </Box>
        )}
        <AuthorSelector
          onSelect={handleSelectAuthor}
          onCancel={handleAuthorSelectorCancel}
          analysisService={analysisService}
        />
      </Box>
    )
  }

  if (!selectedAuthor) {
    // Reachable only if something sets stats mode without a warrior. The
    // template below would render the string "Statistics for undefined", so
    // say what actually happened instead.
    return (
      <Box flexDirection="column">
        <Text color="yellow">No warrior is selected.</Text>
        <Text color="gray">Press 'q' to choose one.</Text>
      </Box>
    )
  }

  const renderProgressBar = (percent: number, width = 15) => {
    const filled = Math.round((width * percent) / 100)
    const empty = width - filled
    return pc.green('█'.repeat(filled)) + pc.gray('░'.repeat(empty))
  }

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Single Developer Repository Statistics'))}</Text>

      <Box marginY={1}>
        <Text>Analyzing repository at: {pc.underline(repoPath)}</Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>
          Statistics for {selectedAuthor.title && `${selectedAuthor.title} `}
          {pc.bold(pc.green(selectedAuthor.displayName))}
        </Text>

        {selectedAuthor.aliases.length > 0 && (
          <Text>
            {pc.dim(
              `Including lines committed under aliases: ${selectedAuthor.aliases.join(
                ', ',
              )}`,
            )}
          </Text>
        )}

        {stats.isLoading ? (
          <Box flexDirection="column" marginY={1} gap={1}>
            <Text>
              {pc.yellow('⚔️ ')} {stats.stepMessage}
            </Text>
            <EnhancedProgressBar
              value={stats.progress}
              total={100}
              label={
                stats.currentStep === 'scanning'
                  ? 'Processing files'
                  : 'Analyzing'
              }
              color={stats.currentStep === 'scanning' ? 'blue' : 'green'}
              width={30}
            />
          </Box>
        ) : stats.error ? (
          <Box marginY={1}>
            <Text color="red">{stats.error}</Text>
          </Box>
        ) : stats.authorStats ? (
          <Box flexDirection="column" marginY={1}>
            <Box marginBottom={1}>
              <Text>{pc.bold('Code Statistics:')}</Text>
            </Box>

            <Box>
              <Text>Lines of code written: </Text>
              <Text>
                {pc.green(stats.authorStats.totalLines.toLocaleString())}
              </Text>
            </Box>

            <Box>
              <Text>Files with contribution: </Text>
              <Text>{stats.authorStats.totalFiles.toLocaleString()}</Text>
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text>
                Overall contribution:{' '}
                {pc.bold(`${stats.authorStats.percentage}%`)}
              </Text>
              <Text>{renderProgressBar(stats.authorStats.percentage, 25)}</Text>
            </Box>

            {stats.authorStats.fileContributions.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text>{pc.bold('Top Files by Contribution:')}</Text>

                {stats.authorStats.fileContributions
                  .slice(0, 15)
                  .map((file, fileIndex) => (
                    <FileContributionRow
                      key={`file-${fileIndex}-${file.path}`}
                      position={fileIndex + 1}
                      file={file}
                    />
                  ))}
              </Box>
            )}
          </Box>
        ) : (
          <Box marginY={1}>
            <Text>
              {pc.red('No code statistics available for this developer.')}
            </Text>
            <Text>
              {pc.dim(
                'This developer may not have any lines in the current repository.',
              )}
            </Text>
          </Box>
        )}

        <Box marginTop={2}>
          <Text>
            {pc.dim('Press ESC or q to return to the contributor list')}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
