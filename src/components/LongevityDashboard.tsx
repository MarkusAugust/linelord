import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useEffect, useState } from 'react'
import type { LineLordService } from '../services/LineLordService'
import {
  type AuthorLongevity,
  type AuthorSurvivalWithIdentity,
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

type SortKey = 'median' | 'mean' | 'lines' | 'halflife' | 'survival'

const SORT_LABELS: Record<SortKey, string> = {
  median: 'median age',
  mean: 'mean age',
  lines: 'surviving lines',
  halflife: 'half-life',
  survival: 'survival rate',
}

const WARRIORS_SHOWN = 10

/** What the screen knows about the stored history, if anything. */
type HistoryState =
  | { kind: 'absent' }
  | { kind: 'current' }
  | { kind: 'stale'; describes: string }

function sortWarriors(
  warriors: AuthorLongevity[],
  key: SortKey,
  survival: Map<number, AuthorSurvivalWithIdentity>,
): AuthorLongevity[] {
  const sorted = [...warriors]
  if (key === 'lines') {
    return sorted.sort((a, b) => b.survivingLines - a.survivingLines)
  }
  if (key === 'mean') {
    return sorted.sort((a, b) => b.meanAgeDays - a.meanAgeDays)
  }
  if (key === 'halflife') {
    // Three cases, not two. A measured half-life is a number. Code watched
    // for months that never halved outlasted the window, and sorts as the
    // longest-lived, which is what it is. Code the history only ever saw once
    // has no half-life known either way, and sorting it to either end would
    // be a claim -- it goes last, after everything that was measured.
    const life = (one: AuthorLongevity): number | null => {
      const found = survival.get(one.authorId)
      if (!found) return null
      if (found.halfLifeDays !== null) return found.halfLifeDays
      const watched = found.survivalCurve.at(-1)?.ageDays ?? 0
      return watched > 0 ? Number.POSITIVE_INFINITY : null
    }
    return sorted.sort((a, b) => {
      const left = life(a)
      const right = life(b)
      if (left === null) return right === null ? 0 : 1
      if (right === null) return -1
      return right - left
    })
  }
  if (key === 'survival') {
    const rate = (one: AuthorLongevity) =>
      survival.get(one.authorId)?.survivalRate ?? -1
    return sorted.sort((a, b) => rate(b) - rate(a))
  }
  return sorted.sort((a, b) => b.medianAgeDays - a.medianAgeDays)
}

/**
 * Put back the people the present has forgotten.
 *
 * The table is built from the analysis of HEAD, so somebody whose every line
 * has since been rewritten has no row in it -- and they are precisely the
 * case the history exists to show. They are given a row with nothing in the
 * columns that describe surviving code, because they have none.
 */
function withForgottenContributors(
  warriors: AuthorLongevity[],
  survival: Map<number, AuthorSurvivalWithIdentity>,
): AuthorLongevity[] {
  const present = new Set(warriors.map((one) => one.authorId))
  const forgotten: AuthorLongevity[] = []

  for (const [authorId, one] of survival) {
    if (present.has(authorId) || one.linesEverWritten === 0) continue
    forgotten.push({
      authorId,
      name: one.name,
      email: one.email,
      survivingLines: 0,
      medianAgeDays: Number.NaN,
      meanAgeDays: Number.NaN,
      p10AgeDays: Number.NaN,
      p90AgeDays: Number.NaN,
      oldestLine: null,
      newestLine: null,
      ageHistogram: {
        underAWeek: 0,
        weekToMonth: 0,
        oneToThreeMonths: 0,
        threeToTwelveMonths: 0,
        oneToTwoYears: 0,
        overTwoYears: 0,
      },
      activeSpanDays: 0,
    })
  }

  return [...warriors, ...forgotten]
}

/**
 * The half-life column, or a reason there is not one.
 *
 * A dash on its own reads as "this person has no half-life", which is a
 * claim. The line under the table says which of the two it is: no history
 * gathered, or a history about a different revision.
 */
function halfLifeColumn(
  history: HistoryState,
  survival: AuthorSurvivalWithIdentity | undefined,
): string {
  if (history.kind !== 'current' || !survival) return '—'.padStart(11)
  if (survival.halfLifeDays === null) {
    // Two different things wear the same null. A cohort watched for months
    // that never halved has outlasted the window, and "> 3m" says so. One
    // seen at a single snapshot was never watched across any span at all, so
    // nothing is known -- and "> <1d" would be a measurement where there is
    // none.
    const watched = survival.survivalCurve.at(-1)?.ageDays ?? 0
    if (watched <= 0) return '—'.padStart(11)
    return `> ${formatAge(watched)}`.padStart(11)
  }
  return formatAge(survival.halfLifeDays).padStart(11)
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
  const [survival, setSurvival] = useState<
    Map<number, AuthorSurvivalWithIdentity>
  >(new Map())
  const [historyState, setHistoryState] = useState<HistoryState>({
    kind: 'absent',
  })
  const [repository, setRepository] = useState<RepositoryLongevity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('median')
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!lineLordService?.isInitialized()) {
        // Returning here without saying so leaves the loading message on
        // screen for good: there is no second attempt, and nothing else will
        // ever clear it. The one state this screen must not reach is one it
        // cannot explain.
        if (cancelled) return
        setError('LineLord service is unavailable or not initialized')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const service = new LongevityService(lineLordService.getDatabase())
        const [byAuthor, wholeRepository, bySurvival] = await Promise.all([
          service.forAuthors(),
          service.forRepository(),
          service.survivalByAuthor(),
        ])
        if (cancelled) return
        setWarriors(byAuthor)
        setRepository(wholeRepository)
        setSurvival(new Map(bySurvival.map((one) => [one.authorId, one])))

        // A history outlives the analysis that produced it. Saying which
        // revision it describes is the difference between a curve about this
        // repository and a curve about the one it used to be.
        const describes = service.historyDescribes()
        const analysed = lineLordService.getAnalysisContext().headSha
        setHistoryState(
          describes === null
            ? { kind: 'absent' }
            : describes === analysed
              ? { kind: 'current' }
              : { kind: 'stale', describes },
        )
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

  const current = historyState.kind === 'current'
  const shown = sortWarriors(
    current ? withForgottenContributors(warriors, survival) : warriors,
    sortKey,
    survival,
  ).slice(0, WARRIORS_SHOWN)
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
    // Only when there is a history to sort by: a key that silently does
    // nothing is worse than one that is not offered.
    // Only a history about the revision in front of us. A stale one is
    // explicitly not drawn, and ranking by data the screen says it will not
    // show is the same claim by another route.
    if (input === 'h' && historyState.kind === 'current') setSortKey('halflife')
    if (input === 's' && historyState.kind === 'current') setSortKey('survival')
  })

  if (inDetail && chosen && lineLordService) {
    return (
      <LongevityDetail
        lineLordService={lineLordService}
        warrior={chosen}
        survival={
          historyState.kind === 'current'
            ? survival.get(chosen.authorId)
            : undefined
        }
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
          {'Warrior'.padEnd(20)}
          {'Lines'.padStart(7)}
          {'Median'.padStart(9)}
          {'Spread'.padStart(16)}
          {'Half-life'.padStart(11)}
          {'  New → old'}
        </Text>
      </Box>

      {shown.map((warrior, index) => (
        <Box key={warrior.authorId}>
          <Text color={index === selected ? 'green' : undefined}>
            {index === selected ? '› ' : '  '}
            {String(index + 1).padStart(2)}{' '}
            {warrior.name.slice(0, 19).padEnd(20)}
            {warrior.survivingLines.toLocaleString('en-GB').padStart(7)}
            {formatAge(warrior.medianAgeDays).padStart(9)}
            {(warrior.survivingLines === 0
              ? '—'
              : formatSpread(warrior.p10AgeDays, warrior.p90AgeDays)
            ).padStart(16)}
            {halfLifeColumn(historyState, survival.get(warrior.authorId))}
            {'  '}
            {renderAgeSparkline(warrior.ageHistogram)}
          </Text>
        </Box>
      ))}

      {shown.length === 0 && (
        <Text color="gray">Nobody holds a line with a date on it.</Text>
      )}

      {current && shown.some((one) => one.survivingLines === 0) && (
        <Box marginTop={1}>
          <Text color="gray">
            A row with no surviving lines is somebody whose work has since been
            rewritten in full. They hold nothing now, which is why the age
            columns are empty — what they wrote is in the history.
          </Text>
        </Box>
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

      {historyState.kind === 'absent' && shown.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray">
            Half-life needs the history walked: run with --history. It reads the
            repository as it stood at points in the past, which takes a pass
            over it for each one.
          </Text>
        </Box>
      )}

      {historyState.kind === 'stale' && (
        <Box marginTop={1}>
          <Text color="yellow">
            ⚠ The stored history describes {historyState.describes.slice(0, 7)},
            which is not what is being analysed. Half-life and survival are left
            out rather than drawn from it — run with --history again.
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Sorted by {SORT_LABELS[sortKey]} · m median · a mean · l lines
          {historyState.kind === 'current' ? ' · h half-life · s survival' : ''}{' '}
          · ↑↓ and Enter for one warrior · q to go back
        </Text>
      </Box>
    </Box>
  )
}
