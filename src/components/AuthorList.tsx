import { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import type { AnalysisService } from '../services/AnalysisService'
import { getDistributedTitlesWithAssignment } from '../resources/rankedTitles'
import { capitalizeString } from '../utility/capitalizeString'

interface AuthorsListProps {
  repoPath: string
  analysisService: AnalysisService
  mergePolicy?: 'strict' | 'loose'
}

interface AuthorSummary {
  id: number
  name: string
  email: string
  displayName: string
  totalLines: number
  percentage: number
}

export const AuthorsList: React.FC<AuthorsListProps> = ({
  repoPath,
  analysisService
}) => {
  const [authors, setAuthors] = useState<AuthorSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAuthors = async () => {
      try {
        setIsLoading(true)
        const contributions = await analysisService.getAuthorContributions()

        const authorSummaries: AuthorSummary[] = contributions.map(
          (contrib) => ({
            id: contrib.id,
            name: contrib.name,
            email: contrib.email,
            displayName: contrib.displayName,
            totalLines: contrib.totalLines,
            percentage: contrib.percentage
          })
        )

        setAuthors(authorSummaries)
        setError(null)
      } catch (err) {
        setError(
          `Failed to load authors: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadAuthors()
  }, [analysisService])

  if (isLoading) {
    return (
      <Box marginBottom={1}>
        <Text>Loading authors...</Text>
      </Box>
    )
  }

  if (error) {
    return (
      <Box marginBottom={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    )
  }

  // Get titles distributed by contribution ranking
  const authorNames = authors.map((author) => author.displayName)
  const titledAuthors = getDistributedTitlesWithAssignment(authorNames)

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>All contributors ({authors.length}):</Text>
      {authors.map((author, index) => {
        const authorTitle = titledAuthors[index]

        // Get icon for top 3 contributors
        const getPositionIcon = (position: number) => {
          switch (position) {
            case 0:
              return '👑' // Crown for 1st place
            case 1:
              return '🥈' // Silver medal for 2nd place
            case 2:
              return '🥉' // Bronze medal for 3rd place
            default:
              return '  ' // Two spaces to align with icons
          }
        }

        return (
          <Box
            key={`author-${author.id}-${index}`}
            flexDirection="column"
            marginLeft={1}
          >
            <Box flexDirection="row">
              <Box width={3}>
                <Text>{getPositionIcon(index)}</Text>
              </Box>
              <Box flexDirection="row" gap={1}>
                <Box flexDirection="row" gap={1}>
                  <Text color="yellow">
                    {capitalizeString(authorTitle?.title || '')}
                  </Text>

                  <Text>{author.displayName}</Text>
                </Box>
                <Text color={'green'}>{author.percentage}%</Text>
              </Box>
            </Box>
            <Box flexDirection="row">
              <Box width={3} />
              <Text color="gray">{author.email}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
