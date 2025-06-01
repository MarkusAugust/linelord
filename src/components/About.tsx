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
          A powerful git repository analysis tool that reveals code ownership
          using
        </Text>
        <Text>
          native git blame. By Crom's hammer, discover who truly rules your
          codebase!
        </Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('🏰 Key Features:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            • {pc.cyan('Native Git Power')} - Uses only git commands, works
            anywhere
          </Text>
          <Text>
            • {pc.cyan('Smart Author Merging')} - Combines similar names
            automatically
          </Text>
          <Text>
            • {pc.cyan('Intelligent Filtering')} - Skips binaries, generated
            files, and large files
          </Text>
          <Text>
            • {pc.cyan('Current Ownership')} - Shows who owns code now via git
            blame
          </Text>
          <Text>
            • {pc.cyan('Parallel Processing')} - Fast analysis of large
            repositories
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('📊 What Gets Analyzed:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>✅ All git-tracked text files</Text>
          <Text>✅ Source code, configs, documentation</Text>
          <Text>❌ Binary files (images, executables, etc.)</Text>
          <Text>❌ Ignored files (lock files, build artifacts, etc.)</Text>
          <Text>❌ Large files (configurable threshold, default 50KB)</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('⚡ Important Notes:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            • Shows {pc.yellow('current ownership')}, not historical commits
          </Text>
          <Text>
            • Author names are intelligently merged using fuzzy matching
          </Text>
          <Text>• Large refactors may shift ownership significantly</Text>
          <Text>• Works entirely offline with no external dependencies</Text>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text>{pc.dim('Press ESC or q to return to the menu')}</Text>
      </Box>
    </Box>
  )
}
