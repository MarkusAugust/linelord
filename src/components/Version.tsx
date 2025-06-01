import { Box, Text } from 'ink'

type VersionProps = {
  icon?: 'crown' | 'sword'
  dim?: boolean
}

export default function Version({ icon = 'crown', dim = false }: VersionProps) {
  // Read version dynamically
  const packageJson = require('../../package.json')
  const version = packageJson.version

  return (
    <Box>
      <Text dimColor={dim}>{`${
        icon === 'crown' ? '👑' : '⚔️'
      }  LineLord - Git Analysis Tool v${version}`}</Text>
    </Box>
  )
}
