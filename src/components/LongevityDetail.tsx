import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useEffect, useState } from 'react'
import type { LineLordService } from '../services/LineLordService'
import {
  type AuthorFileLongevity,
  type AuthorLongevity,
  LongevityService,
} from '../services/LongevityService'
import { formatAge, HISTOGRAM_BUCKETS } from '../utility/ageFormatting'
import { renderSimplePercentageBar } from '../utility/simplePercentageBar'

type LongevityDetailProps = {
  lineLordService: LineLordService
  warrior: AuthorLongevity
  onBack: () => void
}

/**
 * One warrior's surviving code, in full.
 *
 * The dashboard says a person's code is old. This says where it is, which is
 * the part anyone can act on: a median age with no path attached is a number
 * nobody can check or do anything about.
 */
export default function LongevityDetail({
  lineLordService,
  warrior,
  onBack,
}: LongevityDetailProps) {
  const [files, setFiles] = useState<AuthorFileLongevity[]>([])

  useInput((input, key) => {
    if (key.escape || input === 'q') onBack()
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const service = new LongevityService(lineLordService.getDatabase())
        const oldest = await service.filesForAuthor(warrior.authorId)
        if (!cancelled) setFiles(oldest)
      } catch {
        // The histogram and the two ends are already on screen; a missing
        // file list is a smaller screen, not an error worth taking it over.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [lineLordService, warrior.authorId])

  const tallest = Math.max(
    ...HISTOGRAM_BUCKETS.map(({ key }) => warrior.ageHistogram[key]),
    1,
  )

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green(warrior.name))}</Text>
      <Text color="gray">{warrior.email}</Text>

      <Box flexDirection="column" marginY={1}>
        <Text>
          {warrior.survivingLines.toLocaleString('en-GB')} surviving lines ·
          middle age {pc.bold(formatAge(warrior.medianAgeDays))} · mean{' '}
          {formatAge(warrior.meanAgeDays)}
        </Text>
        <Text color="gray">
          A tenth is younger than {formatAge(warrior.p10AgeDays)}, a tenth older
          than {formatAge(warrior.p90AgeDays)}. Oldest and newest are{' '}
          {formatAge(warrior.activeSpanDays)} apart.
        </Text>
      </Box>

      <Text bold>How old it is</Text>
      <Box flexDirection="column" marginBottom={1}>
        {HISTOGRAM_BUCKETS.map(({ key, label }) => {
          const count = warrior.ageHistogram[key]
          return (
            <Text key={key}>
              {'  '}
              {label.padEnd(22)}
              {count.toLocaleString('en-GB').padStart(7)}
              {'  '}
              {renderSimplePercentageBar((count / tallest) * 100, 20, 'cyan')}
            </Text>
          )
        })}
      </Box>

      <Text bold>The two ends</Text>
      <Box flexDirection="column" marginBottom={1}>
        {warrior.oldestLine ? (
          <Text color="gray">
            {'  oldest  '}
            {warrior.oldestLine.path}:{warrior.oldestLine.lineNumber} —{' '}
            {formatAge(warrior.oldestLine.ageDays)}
          </Text>
        ) : (
          <Text color="gray">{'  oldest  —'}</Text>
        )}
        {warrior.newestLine ? (
          <Text color="gray">
            {'  newest  '}
            {warrior.newestLine.path}:{warrior.newestLine.lineNumber} —{' '}
            {formatAge(warrior.newestLine.ageDays)}
          </Text>
        ) : (
          <Text color="gray">{'  newest  —'}</Text>
        )}
      </Box>

      {files.length > 0 && (
        <>
          <Text bold>Where the oldest of it sits</Text>
          <Box flexDirection="column" marginBottom={1}>
            {files.map((file) => (
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
