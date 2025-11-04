import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import type { AnalysisService } from '../services/AnalysisService'
import { EnhancedProgressBar } from './ProgressBar'

interface Author {
  name: string
  email: string
  displayName: string
  rank: number | null
  alternativeNames?: string[]
  percentage?: number
}

interface AuthorSelectorProps {
  onSelect: (author: Author) => void
  onCancel: () => void
  mergePolicy?: 'strict' | 'loose'
  analysisService?: AnalysisService | null
}

export function AuthorSelector({
  onSelect,
  onCancel,
  mergePolicy = 'loose',
  analysisService,
}: AuthorSelectorProps) {
  const [authors, setAuthors] = useState<Author[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [numberInput, setNumberInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [stepMessage, setStepMessage] = useState('')

  useEffect(() => {
    const loadAuthors = async () => {
      if (!analysisService) {
        setError(
          'Analysis service not available. Please wait for initialization.',
        )
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setProgress(10)
        setStepMessage(getRandomBarbarianMessage('initializing'))

        setProgress(50)
        setStepMessage(getRandomBarbarianMessage('scanning'))

        // Use getAuthorContributions to get ranked authors
        const contributions = await analysisService.getAuthorContributions()

        setProgress(90)
        setStepMessage('Processing authors...')

        // Map to Author[]
        const authorList: Author[] = contributions.map((contrib) => ({
          name: contrib.displayName,
          email: contrib.email,
          displayName: contrib.displayName,
          rank: contrib.rank ?? null,
          alternativeNames: contrib.aliases?.map((a) => a.name) ?? undefined,
          percentage: contrib.percentage,
        }))

        setAuthors(authorList)
        setProgress(100)
        setStepMessage(getRandomBarbarianMessage('complete'))
        setIsLoading(false)
      } catch (err) {
        setError(
          `Failed to get authors: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        setIsLoading(false)
        setStepMessage('By Huge, the analysis has failed!')
      }
    }

    loadAuthors()
  }, [analysisService])

  useInput((input, key) => {
    // Don't handle input while loading
    if (isLoading) return

    if (key.escape || input === 'q') {
      onCancel()
      return
    }

    if (key.return) {
      // If user has typed a number, use that
      if (numberInput) {
        const num = Number.parseInt(numberInput, 10)
        if (num >= 1 && num <= authors.length) {
          const author = authors[num - 1]
          if (author) {
            onSelect(author)
          }
        }
        setNumberInput('')
        return
      }

      // Otherwise use selected index
      if (authors[selectedIndex]) {
        onSelect(authors[selectedIndex])
      }
      return
    }

    // Handle number input (multi-digit)
    if (input >= '0' && input <= '9') {
      const newInput = numberInput + input
      const num = Number.parseInt(newInput, 10)

      if (
        newInput.length === 1 &&
        authors.length <= 9 &&
        num >= 1 &&
        num <= authors.length
      ) {
        // Immediate selection only when total authors ≤ 9
        const author = authors[num - 1]
        if (author) {
          onSelect(author)
        }
        return
      }

      if (num >= 1 && num <= authors.length) {
        // Valid number - update input and highlight
        setNumberInput(newInput)
        setSelectedIndex(num - 1)
      } else if (newInput.length === 1 || num * 10 <= authors.length) {
        // Still building a potentially valid number
        setNumberInput(newInput)
      }
      return
    }

    // Clear number input on any other key
    if (numberInput) {
      setNumberInput('')
    }

    // Arrow key navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < authors.length - 1 ? prev + 1 : prev))
    }
  })

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Loading repository contributors...</Text>
        </Box>
        <Box flexDirection="column" marginY={1}>
          <Box marginBottom={1}>
            <Text color="yellow">⚔️ {stepMessage}</Text>
          </Box>
          <EnhancedProgressBar
            value={progress}
            total={100}
            label={progress < 80 ? 'Processing files' : 'Analyzing'}
            color={progress < 80 ? 'blue' : 'green'}
            width={30}
          />
        </Box>
      </Box>
    )
  }

  if (error) {
    return <Text color="red">{error}</Text>
  }

  if (authors.length === 0) {
    return <Text>No authors found in this repository.</Text>
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select a repository contributor:</Text>
        {numberInput && <Text color="yellow"> (typing: {numberInput})</Text>}
        {mergePolicy === 'strict' && (
          <Text dimColor> (Showing separate entries for different emails)</Text>
        )}
      </Box>

      <Box flexDirection="column">
        {authors.map((author, index) => {
          const isSelected = index === selectedIndex
          const number = (index + 1).toString().padStart(2, ' ')
          const hasAlternatives =
            author.alternativeNames && author.alternativeNames.length > 0

          return (
            <Box key={`${author.email}-${author.name}`} flexDirection="column">
              <Box flexDirection="row">
                <Box flexDirection="row">
                  <Box width={5} gap={0}>
                    <Text color={isSelected ? 'green' : 'gray'}>{number}</Text>
                    <Text color={isSelected ? 'green' : undefined}>
                      {isSelected ? ' ›' : '  '}
                    </Text>
                  </Box>
                </Box>
                <Box flexDirection="row" flexWrap="wrap">
                  <Text bold={isSelected}>{author.name}</Text>
                  <Text dimColor>{`<${author.email}>`}</Text>
                  <Text color="green">
                    {author.percentage != null ? `${author.percentage}%` : ''}
                  </Text>
                </Box>
              </Box>

              {hasAlternatives && (
                <Box marginLeft={5} width={60}>
                  <Text dimColor>
                    Also known as: {author.alternativeNames?.join(', ')}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Type any number 1-{authors.length} to select</Text>
        {authors.length > 9 && (
          <Text dimColor>Press Enter after typing multi-digit numbers</Text>
        )}
        <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
        <Text dimColor>Press Esc or 'q' to go back</Text>
      </Box>
    </Box>
  )
}
