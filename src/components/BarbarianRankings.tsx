import { Box, Text } from 'ink'
import type React from 'react'
import type {
  BarbarianRanking,
  BarbarianWarriorMetrics,
} from '../core/barbarian'
import { HonestyNote } from './HonestyNote'

interface BarbarianRankingsProps {
  rankings: BarbarianRanking[]
  isLoading?: boolean
  /** Index of the highlighted warrior, counting the champion as zero. */
  selected?: number
}

export const WARRIORS_SHOWN = 10

// 2 + 2 + 1 + 14 + 8 + 8 + 7 × 6 = 77 columns, which is what an 80-column
// terminal leaves after the layout's own margin. The name pays for it.
const NAME_WIDTH = 14
const SCORE_WIDTH = 8
const LINES_WIDTH = 8
const METRIC_WIDTH = 6

/**
 * Every column names what is actually counted, not what it is called.
 *
 * `short` is the column header, and the legend below the table is what turns
 * the short name back into the long one and the long one into a definition.
 */
const METRIC_LEGEND: Array<{
  short: string
  label: string
  explanation: string
  read: (metrics: BarbarianWarriorMetrics) => number
}> = [
  {
    short: 'Scars',
    label: 'Battle Scars',
    explanation: 'surviving lines in large or legacy-looking files',
    read: (m) => m.battleScars,
  },
  {
    short: 'Terr',
    label: 'Territory Conquered',
    explanation: 'files where this warrior owns more than half the lines',
    read: (m) => m.territoryConquered,
  },
  {
    short: 'Solo',
    label: 'Solo Quests',
    explanation: 'files where every surviving line is theirs',
    read: (m) => m.soloQuestVictories,
  },
  {
    short: 'Types',
    label: 'Weapon Mastery',
    explanation: 'distinct file types they hold lines in',
    read: (m) => m.weaponMastery,
  },
  {
    short: 'Anc',
    label: 'Ancient Code',
    explanation: 'surviving lines last touched more than a year ago',
    read: (m) => m.ancientCodeSurvival,
  },
  {
    short: 'Mass',
    label: 'Massive Battles',
    explanation:
      'days when over 100 of their surviving lines were last touched',
    read: (m) => m.massiveBattles,
  },
  {
    short: 'Camp',
    label: 'Campaigns',
    explanation: 'distinct days their surviving lines were last touched',
    read: (m) => m.totalCampaigns,
  },
]

/**
 * A number in a column, never wider than the column allows for.
 *
 * Two numbers that run together read as one number, and a table where that
 * can happen is a table that lies at exactly the size where it matters. So
 * a value that would fill the column is written as thousands or millions
 * instead, keeping at least one space to its neighbour.
 */
export function fit(n: number, width: number): string {
  const whole = Math.round(n)
  const plain = whole.toLocaleString('en-GB')
  if (plain.length < width) return plain.padStart(width)
  if (whole < 1_000_000) return `${Math.round(whole / 1000)}k`.padStart(width)
  return `${(whole / 1_000_000).toFixed(1)}M`.padStart(width)
}

/**
 * Gorvek's brutal barbarian rankings.
 *
 * One table, every warrior a row, every column named. The previous shape
 * boxed the champion with the metrics spelled out, then gave everyone else
 * a line of seven emoji and seven numbers with the key two screens' worth
 * of scrolling below — the same figures, laid out so that only the first
 * person's could be read.
 */
export const BarbarianRankings: React.FC<BarbarianRankingsProps> = ({
  rankings,
  isLoading = false,
  selected,
}) => {
  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="greenBright" bold>
          ⚔️ FORGING THE BRUTAL RANKINGS... ⚔️
        </Text>
        <Text color="yellow">
          "By the old gods, the warriors are being measured..."
        </Text>
      </Box>
    )
  }

  if (rankings.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          ⚔️ NO WARRIORS FOUND ⚔️
        </Text>
        <Text color="yellow">
          "Even Gorvek needs warriors to rank, O Prince!"
        </Text>
      </Box>
    )
  }

  const shown = rankings.slice(0, WARRIORS_SHOWN)
  const decorated = shown.filter((one) => one.specialAchievements.length > 0)

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>
          GORVEK'S BRUTAL BARBARIAN RANKINGS
        </Text>
      </Box>

      <Text bold>
        {'   # '}
        {'Warrior'.padEnd(NAME_WIDTH)}
        {'Score'.padStart(SCORE_WIDTH)}
        {'Lines'.padStart(LINES_WIDTH)}
        {METRIC_LEGEND.map(({ short }) => short.padStart(METRIC_WIDTH)).join(
          '',
        )}
      </Text>

      {shown.map((warrior, index) => {
        const highlighted = index === selected
        return (
          <Box key={warrior.authorId} flexDirection="column">
            <Text color={highlighted ? 'green' : undefined}>
              {highlighted ? '› ' : '  '}
              {String(warrior.rank + 1).padStart(2)}{' '}
              {warrior.displayName.slice(0, NAME_WIDTH - 1).padEnd(NAME_WIDTH)}
              {fit(warrior.gorvekScore, SCORE_WIDTH)}
              {fit(warrior.metrics.survivingLines, LINES_WIDTH)}
              {METRIC_LEGEND.map(({ read }) =>
                fit(read(warrior.metrics), METRIC_WIDTH),
              ).join('')}
            </Text>
            <Text color="gray">
              {'     '}
              {index === 0 ? '👑 ' : ''}
              {warrior.title ? `${warrior.title} · ` : ''}
              {warrior.email}
            </Text>
          </Box>
        )
      })}

      {rankings.length > WARRIORS_SHOWN && (
        <Text color="gray">
          {'     '}… and {rankings.length - WARRIORS_SHOWN} more who hold ground
        </Text>
      )}

      {decorated.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            LEGENDARY ACHIEVEMENTS
          </Text>
          {decorated.map((warrior) => (
            <Box key={warrior.authorId} flexDirection="column">
              <Text>
                {'  '}
                {warrior.displayName}
              </Text>
              {warrior.specialAchievements.map((achievement) => (
                <Text key={achievement} color="magenta">
                  {'    '}
                  {achievement}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}

      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        padding={1}
      >
        <Text color="gray" bold>
          LEGEND OF THE BARBARIAN METRICS
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            {'Score'.padEnd(7)} Gorvek score: conquest, endurance and intensity,
            weighed together
          </Text>
          <Text color="gray">
            {'Lines'.padEnd(7)} surviving lines this warrior holds in HEAD
          </Text>
          {METRIC_LEGEND.map(({ short, label, explanation }) => (
            <Text key={label} color="gray">
              {short.padEnd(7)} {label}: {explanation}
            </Text>
          ))}
        </Box>

        <Box marginTop={1}>
          <HonestyNote topic="rankings" />
        </Box>

        <Box marginTop={1}>
          <Text color="green" italic>
            "A true barbarian is measured not by lines written, but by battles
            won and legends forged!"
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

export default BarbarianRankings
