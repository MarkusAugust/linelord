import { Box, Text } from 'ink'
import { useState } from 'react'
import type {
  AnalysisService,
  AuthorContribution,
} from '../services/AnalysisService'
import { AuthorSelector } from './AuthorSelector'
import { AuthorStats } from './AuthorStats'

// Simple Author interface to match AuthorSelector
interface Author {
  name: string
  email: string
  alternativeNames?: string[]
}

type SingleDevRepoStatsProps = {
  onBack: () => void
  analysisService?: AnalysisService | null
}

type SelectedAuthor = Pick<
  AuthorContribution,
  'id' | 'displayName' | 'email' | 'title' | 'aliases'
>

/**
 * Pick one warrior from the list, then see their statistics.
 */
export default function SingleDevRepoStats({
  onBack,
  analysisService,
}: SingleDevRepoStatsProps) {
  const [selectedAuthor, setSelectedAuthor] = useState<SelectedAuthor | null>(
    null,
  )
  /** A lookup that failed or found nobody, reported where the user is standing. */
  const [lookupError, setLookupError] = useState<string | null>(null)

  const handleSelectAuthor = async (author: Author) => {
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

      const authorContributions = await analysisService.getAuthorContributions()
      const contribution = authorContributions.find((a) => a.id === authorId)

      setSelectedAuthor({
        id: authorId,
        displayName: author.name,
        email: author.email,
        title: contribution?.title ?? null,
        aliases: (author.alternativeNames ?? []).map((name) => ({
          name,
          email: '',
        })),
      })
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

  if (selectedAuthor && analysisService) {
    return (
      <AuthorStats
        analysisService={analysisService}
        author={selectedAuthor}
        onBack={() => setSelectedAuthor(null)}
      />
    )
  }

  return (
    <Box flexDirection="column">
      {lookupError && (
        <Box marginBottom={1}>
          <Text color="yellow">⚠ {lookupError}</Text>
        </Box>
      )}
      <AuthorSelector
        onSelect={handleSelectAuthor}
        onCancel={onBack}
        analysisService={analysisService}
      />
    </Box>
  )
}
