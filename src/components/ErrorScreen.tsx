import { Box, Text } from 'ink'
import Layout from './Layout'

interface ErrorScreenProps {
  error: string
}

export default function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <Layout>
      <Box flexDirection="column" paddingBottom={1}>
        <Text bold color="green">
          {'⚔️  By the Gods! This path is not worthy!'}
        </Text>
        <Box paddingTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <Box paddingTop={1}>
          <Text>
            The path must be a Git repository to analyze its warriors.
          </Text>
        </Box>
        <Box paddingTop={1}>
          <Text dimColor>Press any key to choose a different path...</Text>
        </Box>
      </Box>
    </Layout>
  )
}
