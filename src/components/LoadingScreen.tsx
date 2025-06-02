import { Box, Text } from 'ink'
import Layout from './Layout'

interface LoadingScreenProps {
  message: string
  progress: {
    current: number
    total: number
    message: string
  }
  isChangingRepo: boolean
}

export default function LoadingScreen({
  message,
  progress,
  isChangingRepo,
}: LoadingScreenProps) {
  return (
    <Layout>
      <Box flexDirection="column" paddingBottom={1}>
        <Text bold>
          {isChangingRepo ? 'Switching repositories...' : message}
        </Text>
        <Box paddingTop={1}>
          <Text>Progress: {progress.current.toFixed(0)}%</Text>
        </Box>
        <Box paddingTop={1}>
          <Text>{progress.message}</Text>
        </Box>
      </Box>
    </Layout>
  )
}
