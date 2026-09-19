import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'

type AboutProps = {
  onBack: () => void
}

export default function About({ onBack }: AboutProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack()
    }
  })

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('About LineLord'))}</Text>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('⚔️ What is LineLord?')}</Text>
        <Text>
          A mighty git repository analysis tool that reveals code ownership
          using
        </Text>
        <Text>
          native git blame. By Huge's hammer, discover who truly rules your
          codebase!
        </Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('🏰 Key Features:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            • {pc.cyan('Native Git Power')} - Wields git blame for line
            ownership
          </Text>
          <Text>
            • {pc.cyan('Honest Identity')} - One address is one warrior;
            .mailmap says otherwise
          </Text>
          <Text>
            • {pc.cyan('Intelligent Filtering')} - Skips binaries and oversized
            files
          </Text>
          <Text>
            • {pc.cyan('Current Dominion')} - Shows who owns each line now
          </Text>
          <Text>
            • {pc.cyan('Parallel Processing')} - Swift conquest of large
            repositories
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('📊 What Gets Analyzed:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>✅ Git-tracked text files under size threshold</Text>
          <Text>✅ Source code, configs, sacred documentation</Text>
          <Text>❌ Binary files (images, executables, etc.)</Text>
          <Text>❌ Files matching ignore patterns</Text>
          <Text>❌ Large files (default 50KB threshold)</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('⚡ Battle-tested Wisdom:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            • Shows {pc.yellow('current line dominance')}, not ancient commit
            history
          </Text>
          <Text>• Warriors are united based on email and name similarity</Text>
          <Text>• Great refactors may shift territorial control</Text>
          <Text>• Blank lines are banished from the realm</Text>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text>{pc.dim('Press ESC or q to return to the menu')}</Text>
      </Box>
    </Box>
  )
}
