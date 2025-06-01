import { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import type { AnalysisService } from '../services/AnalysisService'

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

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>All contributors ({authors.length}):</Text>
      {authors.map((author, index) => (
        <Text key={author.id}>
          {index + 1}. {author.displayName} ({author.percentage}%)
        </Text>
      ))}
    </Box>
  )
}
