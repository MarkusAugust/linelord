import { Box, Text } from 'ink'
import type React from 'react'
import type {
  BarbarianRanking,
  BarbarianWarriorMetrics,
} from '../types/analysisTypes'
import { HonestyNote } from './HonestyNote'

interface BarbarianRankingsProps {
  rankings: BarbarianRanking[]
  isLoading?: boolean
}

const WARRIORS_SHOWN = 10

/** Every line in the legend names what is actually counted, not what it is called. */
const METRIC_LEGEND: Array<{
  label: string
  explanation: string
  read: (metrics: BarbarianWarriorMetrics) => number
  unit: string
}> = [
  {
    label: 'Battle Scars',
    explanation: 'surviving lines in large or legacy-looking files',
    read: (m) => m.battleScars,
    unit: 'lines',
  },
  {
    label: 'Territory Conquered',
    explanation: 'files where this warrior owns more than half the lines',
    read: (m) => m.territoryConquered,
    unit: 'files',
  },
  {
    label: 'Solo Quests',
    explanation: 'files where every surviving line is theirs',
    read: (m) => m.soloQuestVictories,
    unit: 'files',
  },
  {
    label: 'Weapon Mastery',
    explanation: 'distinct file types they hold lines in',
    read: (m) => m.weaponMastery,
    unit: 'types',
  },
  {
    label: 'Ancient Code',
    explanation: 'surviving lines last touched more than a year ago',
    read: (m) => m.ancientCodeSurvival,
    unit: 'lines',
  },
  {
    label: 'Massive Battles',
    explanation: `days when over 100 of their surviving lines were last touched`,
    read: (m) => m.massiveBattles,
    unit: 'days',
  },
  {
    label: 'Campaigns',
    explanation: 'distinct days their surviving lines were last touched',
    read: (m) => m.totalCampaigns,
    unit: 'days',
  },
]

/**
 * Gorvek's brutal barbarian rankings display.
 *
 * "Behold! The mightiest warriors of the digital realm,
 *  ranked by their brutal conquests and barbaric deeds!"
 */
export const BarbarianRankings: React.FC<BarbarianRankingsProps> = ({
  rankings,
  isLoading = false,
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

  const [topWarrior, ...challengers] = rankings
  const remainingWarriors = challengers.slice(0, WARRIORS_SHOWN - 1)

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="cyanBright" bold>
          GORVEK'S BRUTAL BARBARIAN RANKINGS
        </Text>
      </Box>

      {topWarrior && (
        <Box flexDirection="column" padding={1} borderStyle="single">
          <Text color="redBright" bold>
            {topWarrior.barbarianTitle}
          </Text>
          <Text color="cyan" bold>
            {topWarrior.displayName}
          </Text>
          <Text color="green">
            Gorvek Score: {topWarrior.gorvekScore.toLocaleString()}
            <Text color="gray">
              {'  '}({topWarrior.metrics.survivingLines.toLocaleString()} lines
              held)
            </Text>
          </Text>

          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Battle Statistics:</Text>
            {METRIC_LEGEND.map(({ label, read, unit }) => (
              <Text key={label}>
                {'  '}
                {label}: {read(topWarrior.metrics).toLocaleString()} {unit}
              </Text>
            ))}
          </Box>

          {topWarrior.specialAchievements.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="yellow">Legendary Achievements:</Text>
              {topWarrior.specialAchievements.map((achievement) => (
                <Text key={achievement} color="magenta">
                  {'  '}
                  {achievement}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {remainingWarriors.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan" bold>
            🏆 OTHER MIGHTY WARRIORS 🏆
          </Text>
          {remainingWarriors.map((warrior) => (
            <Box key={warrior.authorId} flexDirection="column" marginTop={1}>
              <Box flexDirection="row">
                <Text color="white" bold>
                  #{warrior.rank + 1}{' '}
                </Text>
                <Text color="cyan">{warrior.barbarianTitle}</Text>
              </Box>

              <Box flexDirection="row">
                <Text color="gray">{'  '}Warrior: </Text>
                <Text color="white">{warrior.displayName}</Text>
                <Text color="gray"> | Score: </Text>
                <Text color="green">
                  {warrior.gorvekScore.toLocaleString()}
                </Text>
                <Text color="gray">
                  {' '}
                  | {warrior.metrics.survivingLines.toLocaleString()} lines
                </Text>
              </Box>

              <Box flexDirection="row">
                <Text color="gray">
                  {'  '}🗡️ {warrior.metrics.battleScars} 🏰{' '}
                  {warrior.metrics.territoryConquered} 🛡️{' '}
                  {warrior.metrics.soloQuestVictories} ⚡{' '}
                  {warrior.metrics.weaponMastery} 🏺{' '}
                  {warrior.metrics.ancientCodeSurvival} 💥{' '}
                  {warrior.metrics.massiveBattles} 🔥{' '}
                  {warrior.metrics.totalCampaigns}
                </Text>
              </Box>

              {warrior.specialAchievements.length > 0 && (
                <Box flexDirection="column">
                  {warrior.specialAchievements.map((achievement) => (
                    <Text
                      key={`${warrior.authorId}-${achievement}`}
                      color="magenta"
                    >
                      {'  '}
                      {achievement}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box
        flexDirection="column"
        marginTop={2}
        borderStyle="single"
        borderColor="gray"
        padding={1}
      >
        <Text color="gray" bold>
          LEGEND OF THE BARBARIAN METRICS
        </Text>
        <Box marginTop={1} flexDirection="column">
          {METRIC_LEGEND.map(({ label, explanation }) => (
            <Text key={label} color="gray">
              {label}: {explanation}
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
