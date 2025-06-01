import { Box, Text } from 'ink'
import { bannerAsciiSmall } from '../resources/asciiAart'

type ExitProps = { quote: string }

export default function ExitScreen({ quote }: ExitProps) {
  return (
    <Box flexDirection="column" justifyContent="center" width={80}>
      <Box
        marginY={1}
        flexDirection="column"
        borderStyle={'single'}
        paddingX={4}
        paddingY={1}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text>{'Exiting'}</Text>
        </Box>
        <Box flexDirection="column" justifyContent="center">
          {bannerAsciiSmall.map((line) => (
            <Box key={line} justifyContent="center">
              <Text dimColor color="green" bold>
                {line}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        marginY={1}
        alignItems="center"
        justifyContent="center"
        paddingX={4}
        alignSelf="auto"
      >
        <Text dimColor color="red" bold>
          {quote}
        </Text>
      </Box>

      <Box
        marginY={2}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
        paddingX={4}
      >
        <Text>Thank you for using LineLord!</Text>
        <Text>May your code be mighty and your commits legendary!</Text>
      </Box>
    </Box>
  )
}
