import { Box, Text } from 'ink'
import { HONESTY_NOTES, type HonestyTopic } from '../resources/honestyNotes'

type HonestyNoteProps = {
  topic: HonestyTopic
  /** Off where the screen already has a heading of its own for the section. */
  showHeading?: boolean
}

/**
 * The note under a screen that says what its numbers do not mean.
 *
 * Drawn from one list so that the longevity screen, the rankings and the
 * About page cannot drift apart in what they admit to.
 */
export function HonestyNote({ topic, showHeading = true }: HonestyNoteProps) {
  const { heading, lines } = HONESTY_NOTES[topic]

  return (
    <Box flexDirection="column">
      {showHeading && <Text color="yellow">{heading}</Text>}
      {lines.map((line) => (
        <Box key={line} paddingLeft={2}>
          <Text color="gray">{line}</Text>
        </Box>
      ))}
    </Box>
  )
}
