import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import type { AuthorSurvivalWithIdentity } from '../../../core/longevity'
import type { WarriorSource } from '../../../core/warrior'
import { formatAge, HISTOGRAM_BUCKETS } from '../format/ageFormatting'
import { renderSimplePercentageBar } from '../format/simplePercentageBar'
import { curveSpanDays, renderSurvivalCurve } from '../format/survivalCurve'
import { useAsyncData } from '../hooks/useAsyncData'
import { FileContributionRow } from './FileContributionRow'

export type WarriorIdentity = {
  authorId: number
  name: string
  email: string
}

type WarriorDetailProps = {
  source: WarriorSource
  warrior: WarriorIdentity
  onBack: () => void
}

const FILES_SHOWN = 10

/** The crown and medals, for the three who hold the most. */
function positionIcon(rank: number | null): string {
  switch (rank) {
    case 1:
      return '👑 '
    case 2:
      return '🥈 '
    case 3:
      return '🥉 '
    default:
      return ''
  }
}

/**
 * What is known about how long their work lasts, in a sentence.
 *
 * A history that only ever saw somebody once knows nothing about their
 * half-life, which is a different thing from having watched their code hold.
 */
function halfLifeSentence(survival: AuthorSurvivalWithIdentity): string {
  if (survival.halfLifeDays !== null) {
    return `Half of a month's work is gone after ${formatAge(
      survival.halfLifeDays,
    )}`
  }
  const watched = survival.survivalCurve.at(-1)?.ageDays ?? 0
  if (watched <= 0) {
    return 'The history saw this work only once, so it says nothing about how long it lasts'
  }
  return `Half of it is still there after ${formatAge(
    watched,
  )}, which is as far as this history reaches`
}

/**
 * One warrior, in full.
 *
 * What they hold and how much of the whole it is; how old it is and where
 * the oldest of it sits; what became of everything they ever wrote, when the
 * history has been walked. One screen where there were two, reached the
 * same way from the overview, the longevity table and the rankings.
 */
export function WarriorDetail({ source, warrior, onBack }: WarriorDetailProps) {
  useInput((input, key) => {
    if (key.escape || input === 'q') onBack()
  })

  const loaded = useAsyncData(async () => {
    const [share, files, age, oldestFiles, survival] = await Promise.all([
      source.share(warrior.authorId),
      source.files(warrior.authorId),
      source.age(warrior.authorId),
      source.oldestFiles(warrior.authorId),
      source.survival(warrior.authorId),
    ])
    return { share, files, age, oldestFiles, survival }
  }, [source, warrior.authorId])

  if (loaded.status === 'loading') {
    return (
      <Box flexDirection="column">
        <Text>{pc.bold(pc.green(warrior.name))}</Text>
        <Text color="gray">{warrior.email}</Text>
        <Box marginTop={1}>
          <Text color="gray">Reading the warrior's deeds…</Text>
        </Box>
      </Box>
    )
  }

  if (loaded.status === 'failed') {
    return (
      <Box flexDirection="column">
        <Text>{pc.bold(pc.green(warrior.name))}</Text>
        <Text color="red">Could not read their deeds: {loaded.error}</Text>
        <Box marginTop={1}>
          <Text dimColor>q to go back</Text>
        </Box>
      </Box>
    )
  }

  const { share, files, age, oldestFiles, survival } = loaded.data
  const tallest = age
    ? Math.max(...HISTOGRAM_BUCKETS.map(({ key }) => age.ageHistogram[key]), 1)
    : 1

  return (
    <Box flexDirection="column">
      <Text>
        {pc.bold(pc.green(warrior.name))}
        {share?.title && (
          <Text color="yellow">
            {'   '}
            {positionIcon(share.rank)}
            {share.title}
          </Text>
        )}
      </Text>
      <Text color="gray">{warrior.email}</Text>

      <Box flexDirection="column" marginY={1}>
        {share ? (
          <>
            <Text>
              Holds {pc.bold(share.totalLines.toLocaleString('en-GB'))} lines in{' '}
              {share.totalFiles.toLocaleString('en-GB')} file
              {share.totalFiles === 1 ? '' : 's'} ·{' '}
              {pc.bold(`${share.percentage.toFixed(1)}%`)} of the codebase
            </Text>
            <Text>{renderSimplePercentageBar(share.percentage, 25)}</Text>
          </>
        ) : (
          <Text color="gray">
            Holds no line in the analysed revision. Whatever they wrote has
            since been rewritten.
          </Text>
        )}
      </Box>

      {age && (
        <>
          <Text bold>How old it is</Text>
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">
              {'  '}middle age {pc.bold(formatAge(age.medianAgeDays))} · mean{' '}
              {formatAge(age.meanAgeDays)} · a tenth younger than{' '}
              {formatAge(age.p10AgeDays)}, a tenth older than{' '}
              {formatAge(age.p90AgeDays)}
            </Text>
            {HISTOGRAM_BUCKETS.map(({ key, label }) => {
              const count = age.ageHistogram[key]
              return (
                <Text key={key}>
                  {'  '}
                  {label.padEnd(22)}
                  {count.toLocaleString('en-GB').padStart(7)}
                  {'  '}
                  {renderSimplePercentageBar(
                    (count / tallest) * 100,
                    20,
                    'cyan',
                  )}
                </Text>
              )
            })}
            <Text color="gray">
              {'  oldest  '}
              {age.oldestLine
                ? `${age.oldestLine.path}:${age.oldestLine.lineNumber} — ${formatAge(age.oldestLine.ageDays)}`
                : '—'}
            </Text>
            <Text color="gray">
              {'  newest  '}
              {age.newestLine
                ? `${age.newestLine.path}:${age.newestLine.lineNumber} — ${formatAge(age.newestLine.ageDays)}`
                : '—'}
            </Text>
          </Box>
        </>
      )}

      {survival && (
        <>
          <Text bold>What became of it</Text>
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">
              {'  '}
              {survival.linesEverWritten.toLocaleString('en-GB')} lines written
              in all, {survival.survivingLines.toLocaleString('en-GB')} still
              standing — {Math.round(survival.survivalRate * 100)}%
            </Text>
            <Text color="gray">
              {'  '}
              {halfLifeSentence(survival)}
            </Text>
            <Text>
              {'  '}
              {renderSurvivalCurve(survival.survivalCurve)}
            </Text>
            <Text color="gray">
              {'  new'}
              {' '.repeat(Math.max(1, 24 - 'new'.length - 'older'.length))}
              older → {formatAge(curveSpanDays(survival.survivalCurve))}
            </Text>
          </Box>
        </>
      )}

      {files.length > 0 && (
        <>
          <Text bold>Files they hold the most of</Text>
          <Box flexDirection="column" marginBottom={1}>
            {files.slice(0, FILES_SHOWN).map((file, index) => (
              <FileContributionRow
                key={file.path}
                position={index + 1}
                file={file}
              />
            ))}
          </Box>
        </>
      )}

      {oldestFiles.length > 0 && (
        <>
          <Text bold>Where the oldest of it sits</Text>
          <Box flexDirection="column" marginBottom={1}>
            {oldestFiles.map((file) => (
              <Text key={file.path} color="gray">
                {'  '}
                {formatAge(file.medianAgeDays).padStart(8)}
                {'  '}
                {file.lines.toLocaleString('en-GB').padStart(6)} lines{'  '}
                {file.path}
              </Text>
            ))}
          </Box>
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Age is when a line was last changed, not when it was written · q to go
          back
        </Text>
      </Box>
    </Box>
  )
}

export default WarriorDetail
