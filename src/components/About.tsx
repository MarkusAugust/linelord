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
            • {pc.cyan('Code Longevity')} - How old the code each warrior still
            holds is
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
          <Text>
            • Warriors are told apart by {pc.yellow('email address')}; .mailmap
            unites them
          </Text>
          <Text>• Great refactors may shift territorial control</Text>
          <Text>• Blank lines are banished from the realm</Text>
        </Box>
      </Box>

      {/*
        L6. The longevity screen is the easiest of these to misread as a
        judgement of people, and the barbarian tone must not be allowed to
        hide that it is not one.
      */}
      <Box flexDirection="column" marginY={1}>
        <Text>{pc.bold('⏳ On the age of code:')}</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>
            • Age is when a line was {pc.yellow('last changed')}, not when it
            was written
          </Text>
          <Text>
            • A reformatting resets it — name those commits in
            .git-blame-ignore-revs
          </Text>
          <Text>• Old code is stable code. Stable is not the same as good</Text>
          <Text>
            • New code usually means working where the work is, not working
            badly
          </Text>
          <Text>
            •{' '}
            {pc.yellow(
              'None of this measures a warrior. Do not use it that way.',
            )}
          </Text>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text>{pc.dim('Press ESC or q to return to the menu')}</Text>
      </Box>
    </Box>
  )
}
