import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

type TextInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mask?: string
  focus?: boolean
  onSubmit?: () => void
}

export const TextInput = ({
  value: initialValue,
  onChange,
  placeholder = '',
  mask,
  focus = true,
  onSubmit,
}: TextInputProps) => {
  const [cursorOffset, setCursorOffset] = useState(initialValue.length)
  const [value, setValue] = useState(initialValue)

  useInput(
    (input, key) => {
      if (!focus) return

      if (key.return) {
        if (onSubmit) {
          onSubmit()
        }
        return
      }

      if (key.backspace || key.delete) {
        if (value.length > 0 && cursorOffset > 0) {
          const newValue =
            value.slice(0, cursorOffset - 1) + value.slice(cursorOffset)
          setValue(newValue)
          onChange(newValue)
          setCursorOffset((prev) => prev - 1)
        }
        return
      }

      if (key.leftArrow) {
        setCursorOffset((prev) => Math.max(0, prev - 1))
        return
      }

      if (key.rightArrow) {
        setCursorOffset((prev) => Math.min(value.length, prev + 1))
        return
      }

      if (key.pageUp) {
        setCursorOffset(0)
        return
      }

      if (key.pageDown) {
        setCursorOffset(value.length)
        return
      }

      // Handle regular input
      if (input) {
        const newValue =
          value.slice(0, cursorOffset) + input + value.slice(cursorOffset)
        setValue(newValue)
        onChange(newValue)
        setCursorOffset((prev) => prev + input.length)
      }
    },
    { isActive: focus },
  )

  const displayValue = mask ? mask.repeat(value.length) : value
  const placeholderShown = !value && placeholder

  if (placeholderShown) {
    return (
      <Box>
        <Text dimColor>{placeholder}</Text>
      </Box>
    )
  }

  // Create "cursor blocks" around the cursor position
  const cursorChar = displayValue[cursorOffset] || ' '

  return (
    <Box>
      <Text>{displayValue.slice(0, cursorOffset)}</Text>
      <Text backgroundColor="white" color="black">
        {cursorChar}
      </Text>
      <Text>{displayValue.slice(cursorOffset + 1)}</Text>
    </Box>
  )
}
