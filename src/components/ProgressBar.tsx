import { Box, Text } from 'ink'
import pc from 'picocolors'
import type React from 'react'

interface EnhancedProgressBarProps {
  value: number
  total?: number
  width?: number
  label?: string
  showDetails?: boolean
  completeChar?: string
  incompleteChar?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'magenta' | 'cyan'
}

/**
 * An enhanced progress bar component for Ink applications
 */
export const EnhancedProgressBar: React.FC<EnhancedProgressBarProps> = ({
  value,
  total = 100,
  width = 30,
  label = '',
  showDetails = true,
  completeChar = '█',
  incompleteChar = '░',
  color = 'blue',
}) => {
  // Calculate percentage and bar segments
  const percent = Math.min(100, Math.round((value / total) * 100))
  const filled = Math.round((width * percent) / 100)
  const empty = width - filled

  // Choose color function
  const colorFn = {
    blue: pc.blue,
    green: pc.green,
    yellow: pc.yellow,
    red: pc.red,
    magenta: pc.magenta,
    cyan: pc.cyan,
  }[color]

  // Render the progress bar with colored segments
  const bar =
    colorFn(completeChar.repeat(filled)) + pc.gray(incompleteChar.repeat(empty))

  // Create label with consistent width if provided
  const formattedLabel = label ? `${label.padEnd(20)} ` : ''

  return (
    <Box>
      <Text>
        {label && <Text>{formattedLabel}</Text>}
        <Text>{bar}</Text>
        {showDetails && (
          <>
            <Text> {colorFn(`${percent}%`)}</Text>
            <Text> {pc.dim(`(${value}/${total})`)}</Text>
          </>
        )}
      </Text>
    </Box>
  )
}
