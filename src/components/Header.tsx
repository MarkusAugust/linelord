import { Box, Text } from 'ink'
import { bannerAsciiLarge } from '../resources/asciiAart'

export default function Header() {
  return (
    <Box borderStyle={'round'} paddingX={2} paddingY={1} flexDirection="column">
      <Box flexDirection="column">
        {bannerAsciiLarge.map((line) => (
          <Box key={line} justifyContent="center">
            <Text color="green" bold>
              {line}
            </Text>
          </Box>
        ))}
      </Box>
      <Box justifyContent="center" marginTop={1}>
        <Text>{'Your code, your glory!'}</Text>
      </Box>
    </Box>
  )
}
