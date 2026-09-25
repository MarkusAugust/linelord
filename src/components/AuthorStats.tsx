import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import type {
  AnalysisService,
  AuthorContribution,
} from '../services/AnalysisService'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'
import { useAsyncData } from '../utility/useAsyncData'
import { FileContributionRow } from './FileContributionRow'

/** What a screen needs to know to draw one warrior's statistics. */
export type AuthorStatsSource = Pick<
  AnalysisService,
  'getAuthorContributions' | 'getAuthorFileContributions'
>

type AuthorStatsProps = {
  analysisService: AuthorStatsSource
  author: Pick<
    AuthorContribution,
    'id' | 'displayName' | 'email' | 'title' | 'aliases'
  >
  onBack: () => void
}

const FILES_SHOWN = 15

/**
 * One warrior's share of the codebase: how many lines, in how many files,
 * what part of the whole, and the files they hold the most of.
 */
export function AuthorStats({
  analysisService,
  author,
  onBack,
}: AuthorStatsProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q') onBack()
  })

  const loaded = useAsyncData(async () => {
    const [contributions, files] = await Promise.all([
      analysisService.getAuthorContributions(),
      analysisService.getAuthorFileContributions(author.id),
    ])
    const contribution = contributions.find((one) => one.id === author.id)
    return { contribution: contribution ?? null, files }
  }, [analysisService, author.id])

  const aliases = author.aliases?.map((alias) => alias.name) ?? []

  return (
    <Box flexDirection="column">
      <Text>
        Statistics for {author.title && `${author.title} `}
        {pc.bold(pc.green(author.displayName))}
      </Text>
      <Text color="gray">{author.email}</Text>

      {aliases.length > 0 && (
        <Text>
          {pc.dim(
            `Including lines committed under aliases: ${aliases.join(', ')}`,
          )}
        </Text>
      )}

      {loaded.status === 'loading' && (
        <Box marginY={1}>
          <Text color="gray">Reading the warrior's deeds…</Text>
        </Box>
      )}

      {loaded.status === 'failed' && (
        <Box marginY={1}>
          <Text color="red">Could not read their deeds: {loaded.error}</Text>
        </Box>
      )}

      {loaded.status === 'ready' && loaded.data.contribution === null && (
        <Box flexDirection="column" marginY={1}>
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

      {loaded.status === 'ready' && loaded.data.contribution !== null && (
        <Box flexDirection="column" marginY={1}>
          <Box marginBottom={1}>
            <Text>{pc.bold('Code Statistics:')}</Text>
          </Box>

          <Text>
            Lines of code written:{' '}
            {pc.green(loaded.data.contribution.totalLines.toLocaleString())}
          </Text>
          <Text>
            Files with contribution:{' '}
            {loaded.data.contribution.totalFiles.toLocaleString()}
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text>
              Overall contribution:{' '}
              {pc.bold(`${loaded.data.contribution.percentage}%`)}
            </Text>
            <Text>
              {renderSimplePercentageBar(
                loaded.data.contribution.percentage,
                25,
              )}
            </Text>
          </Box>

          {loaded.data.files.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text>{pc.bold('Top files by contribution:')}</Text>
              {loaded.data.files.slice(0, FILES_SHOWN).map((file, index) => (
                <FileContributionRow
                  key={file.path}
                  position={index + 1}
                  file={file}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press ESC or q to go back</Text>
      </Box>
    </Box>
  )
}

export default AuthorStats
