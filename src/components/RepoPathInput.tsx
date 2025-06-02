import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'

type RepoPathInputProps = {
  onSubmit: (path: string) => void
  onCancel?: () => void // Add cancel callback
}

export default function RepoPathInput({
  onSubmit,
  onCancel,
}: RepoPathInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showCursor, setShowCursor] = useState(true)

  const defaultPath = process.cwd()

  // Blinking cursor effect
  useEffect(() => {
    const timer = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 500)

    return () => clearInterval(timer)
  }, [])

  useInput((input, key) => {
    // Handle escape key to cancel
    if (key.escape) {
      onCancel?.()
      return
    }

    if (key.return) {
      handleSubmit()
      return
    }

    if (key.backspace || key.delete) {
      setInputValue((prev) => prev.slice(0, -1))
      setError(null)
      return
    }

    // Add typed characters (filter out control characters)
    if (!key.ctrl && !key.meta && !key.escape && input) {
      setInputValue((prev) => prev + input)
      setError(null)
    }
  })

  const expandTilde = (path: string): string => {
    if (path.startsWith('~/') || path === '~') {
      return path.replace(/^~/, homedir())
    }
    return path
  }

  const normalizePath = (path: string): string => {
    // If empty, use current directory
    if (!path.trim()) {
      return defaultPath
    }

    // Expand tilde
    let normalized = expandTilde(path.trim())

    // Convert to absolute path
    if (!normalized.startsWith('/')) {
      normalized = resolve(normalized)
    }

    return normalized
  }

  const validatePath = (path: string): string | null => {
    const normalizedPath = normalizePath(path)

    // Check if directory exists
    if (!existsSync(normalizedPath)) {
      return `Directory does not exist: ${normalizedPath}`
    }

    // Check if it's a git repository
    if (!existsSync(join(normalizedPath, '.git'))) {
      return `Not a git repository: ${normalizedPath}`
    }

    return null // No error
  }

  const handleSubmit = () => {
    const pathToUse = inputValue || defaultPath
    const error = validatePath(pathToUse)

    if (error) {
      setError(error)
      return
    }

    const finalPath = normalizePath(pathToUse)
    onSubmit(finalPath)
  }

  // Calculate display values
  const displayValue = inputValue || ''
  const previewPath = inputValue ? normalizePath(inputValue) : defaultPath
  const showPreview =
    inputValue.includes('~') || (!inputValue && previewPath !== displayValue)

  return (
    <Box flexDirection="column">
      <Text bold>Enter the path to the git repository to analyze:</Text>

      <Box marginY={1}>
        <Text>Path: </Text>
        <Text color="green">
          {displayValue}
          {showCursor ? '█' : ' '}
        </Text>
      </Box>

      {/* Show preview of what path will actually be used */}
      <Box marginTop={1}>
        <Text dimColor>Will use: {previewPath}</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Press Enter to confirm</Text>
        <Text dimColor>Press ESC to return to menu</Text>
        <Text dimColor>Leave empty to use current directory</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Examples:</Text>
        <Text dimColor> ~/code/myproject</Text>
        <Text dimColor> /absolute/path/to/repo</Text>
        <Text dimColor> ../relative/path</Text>
      </Box>
    </Box>
  )
}
