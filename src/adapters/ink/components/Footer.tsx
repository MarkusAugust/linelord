import { Box, Text } from 'ink'
import Version from './Version'

export default function Footer() {
  return (
    <Box flexDirection="column">
      <Text color="gray">{'─'.repeat(80)}</Text>
      <Box marginLeft={1} flexDirection="column">
        <Version dim icon="sword" />
      </Box>
    </Box>
  )
}
