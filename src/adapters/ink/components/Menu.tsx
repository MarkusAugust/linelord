import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

export type MenuOption = {
  label: string
  value: string
}

type MenuProps = {
  title?: string
  options: MenuOption[]
  onSelect: (option: MenuOption) => void
}

export default function Menu({ title, options, onSelect }: MenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [commandMode, setCommandMode] = useState(false)
  const [command, setCommand] = useState('')

  useInput((input, key) => {
    // If in command mode, handle command input
    if (commandMode) {
      if (key.return) {
        // Execute command
        const cmd = command.toLowerCase().trim()
        if (cmd === 'q' || cmd === 'x') {
          // Find exit option and trigger it
          const exitOption = options.find((opt) => opt.value === 'exit')
          if (exitOption) {
            onSelect(exitOption)
          }
        }
        // Reset command mode
        setCommandMode(false)
        setCommand('')
      } else if (key.escape) {
        // Cancel command mode
        setCommandMode(false)
        setCommand('')
      } else if (key.backspace || key.delete) {
        // Remove last character
        setCommand((prev) => prev.slice(0, -1))
      } else if (input && input.length === 1) {
        // Add character to command
        setCommand((prev) => prev + input)
      }
      return
    }

    // Normal menu navigation mode
    if (input === ':') {
      // Enter command mode
      setCommandMode(true)
      setCommand('')
    } else if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev))
    } else if (key.return) {
      const selectedOption = options[selectedIndex]
      if (selectedOption) {
        onSelect(selectedOption)
      }
    }
    // Number key selection (1-9)
    else if (/^[1-9]$/.test(input)) {
      const index = Number.parseInt(input, 10) - 1
      if (index >= 0 && index < options.length) {
        const selectedOption = options[index]
        if (selectedOption) {
          onSelect(selectedOption)
        }
      }
    }
  })

  return (
    <Box flexDirection="column" marginTop={2}>
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}
      {options.map((option, index) => (
        <Box key={option.value} marginY={0}>
          <Text>
            {selectedIndex === index ? (
              <Text color="green">{`${index + 1}. › ${option.label}`}</Text>
            ) : (
              <Text>{`${index + 1}.   ${option.label}`}</Text>
            )}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          Use arrow keys or numbers (1-{Math.min(9, options.length)}) to select,
          Enter to confirm
        </Text>
      </Box>
    </Box>
  )
}
