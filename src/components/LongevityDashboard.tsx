import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useEffect, useState } from 'react'
import type { LineLordService } from '../services/LineLordService'
import {
  type AuthorLongevity,
  LongevityService,
  type RepositoryLongevity,
} from '../services/LongevityService'
import {
  formatAge,
  formatSpread,
  renderAgeSparkline,
} from '../utility/ageFormatting'
import LongevityDetail from './LongevityDetail'

type LongevityDashboardProps = {
  lineLordService: LineLordService | null
  onBack: () => void
}

/** What the table is ordered by. Half-life and survival arrive with tier 2. */
type SortKey = 'median' | 'mean' | 'lines'

const SORT_LABELS: Record<SortKey, string> = {
  median: 'median age',
  mean: 'mean age',
  lines: 'surviving lines',
}

const WARRIORS_SHOWN = 10

function sortWarriors(
  warriors: AuthorLongevity[],
  key: SortKey,
): AuthorLongevity[] {
  const sorted = [...warriors]
  if (key === 'lines') {
    return sorted.sort((a, b) => b.survivingLines - a.survivingLines)
  }
  if (key === 'mean')
    return sorted.sort((a, b) => b.meanAgeDays - a.meanAgeDays)
  return sorted.sort((a, b) => b.medianAgeDays - a.medianAgeDays)
}

/**
 * How old the code each warrior still holds is.
 *
 * Sorted by median rather than mean, because a mean is decided by whichever
 * single ancient file somebody happens to still own. The caveats below the
 * table are not decoration: the numbers are easy to read as a judgement of
 * people, and they are not one.
 */
export default function LongevityDashboard({
  lineLordService,
  onBack,
}: LongevityDashboardProps) {
  const [warriors, setWarriors] = useState<AuthorLongevity[]>([])
  const [repository, setRepository] = useState<RepositoryLongevity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('median')
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!lineLordService?.isInitialized()) return
      try {
        setIsLoading(true)
        const service = new LongevityService(lineLordService.getDatabase())
        const [byAuthor, wholeRepository] = await Promise.all([
          service.forAuthors(),
          service.forRepository(),
        ])
        if (cancelled) return
        setWarriors(byAuthor)
        setRepository(wholeRepository)
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [lineLordService])

  const shown = sortWarriors(warriors, sortKey).slice(0, WARRIORS_SHOWN)
  const chosen = shown[selected]

  useInput((input, key) => {
    if (inDetail) return
    if (key.escape || input === 'q') {
      onBack()
      return
    }
    if (key.upArrow) setSelected((at) => Math.max(0, at - 1))
    if (key.downArrow) setSelected((at) => Math.min(shown.length - 1, at + 1))
    if (key.return && chosen) setInDetail(true)
    if (input === 'm') setSortKey('median')
    if (input === 'a') setSortKey('mean')
    if (input === 'l') setSortKey('lines')
  })

  if (inDetail && chosen && lineLordService) {
    return (
      <LongevityDetail
        lineLordService={lineLordService}
        warrior={chosen}
        onBack={() => setInDetail(false)}
      />
    )
  }

  if (isLoading) {
    return <Text color="gray">Reading the age of the stones…</Text>
  }

  if (error) {
    return <Text color="red">Could not measure the code's age: {error}</Text>
  }

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('⏳ Code Longevity'))}</Text>

      {repository && repository.survivingLines > 0 && (
        <Box flexDirection="column" marginY={1}>
          <Text>
            The codebase is {pc.bold(formatAge(repository.medianAgeDays ?? 0))}{' '}
            old at the middle,{' '}
            {Math.round(repository.writtenInLast90Days * 100)}% of it last
            touched within ninety days.
          </Text>
          {repository.oldestLine && (
            <Text color="gray">
              Oldest line still standing: {repository.oldestLine.path}:
              {repository.oldestLine.lineNumber} —{' '}
              {formatAge(repository.oldestLine.ageDays)} old
            </Text>
          )}
        </Box>
      )}

      <Box>
        <Text bold>
          {'  # '}
          {'Warrior'.padEnd(24)}
          {'Lines'.padStart(7)}
          {'Median'.padStart(9)}
          {'Spread (p10–p90)'.padStart(20)}
          {'  New → old'}
        </Text>
      </Box>

      {shown.map((warrior, index) => (
        <Box key={warrior.authorId}>
          <Text color={index === selected ? 'green' : undefined}>
            {index === selected ? '› ' : '  '}
            {String(index + 1).padStart(2)}{' '}
            {warrior.name.slice(0, 23).padEnd(24)}
            {warrior.survivingLines.toLocaleString('en-GB').padStart(7)}
            {formatAge(warrior.medianAgeDays).padStart(9)}
            {formatSpread(warrior.p10AgeDays, warrior.p90AgeDays).padStart(20)}
            {'  '}
            {renderAgeSparkline(warrior.ageHistogram)}
          </Text>
        </Box>
      ))}

      {shown.length === 0 && (
        <Text color="gray">Nobody holds a line with a date on it.</Text>
      )}

      {/*
        L6. The numbers above are easy to read as a ranking of people, and a
        table sorted by "oldest first" invites exactly that. These are the
        things that are actually true about them.
      */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">What these numbers are, and are not</Text>
        <Text color="gray">
          {'  '}Age is when a line was last changed, not when it was written.
        </Text>
        <Text color="gray">
          {'  '}A reformatting resets it — see .git-blame-ignore-revs.
        </Text>
        <Text color="gray">
          {'  '}Old code is stable code, which is not the same as good code.
          Untouched
        </Text>
        <Text color="gray">
          {'  '}code may simply be dead code nobody dares to move.
        </Text>
        <Text color="gray">
          {'  '}New code usually means working where the work is, not working
          badly.
        </Text>
        <Text color="gray">
          {'  '}None of this measures anyone's worth. Do not use it that way.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Sorted by {SORT_LABELS[sortKey]} · m median · a mean · l lines · ↑↓
          and Enter for one warrior · q to go back
        </Text>
      </Box>
    </Box>
  )
}
