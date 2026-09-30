import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useMemo, useState } from 'react'
import {
  type AuthorLongevity,
  type AuthorSurvivalWithIdentity,
  ageOfAuthors,
  ageOfRepository,
  type HistoryReading,
  halfLifeOf,
  survivalByAuthor,
  withForgottenContributors,
} from '../../../core/longevity'
import type { AnalysisData } from '../../../core/model'
import type { WarriorSource } from '../../../core/warrior'
import {
  formatAge,
  formatSpread,
  renderAgeSparkline,
} from '../format/ageFormatting'
import { HonestyNote } from './HonestyNote'
import { WarriorDetail } from './WarriorDetail'

type LongevityDashboardProps = {
  analysis: AnalysisData
  history: HistoryReading
  /** The revision the analysis describes, which a history must match to be drawn. */
  analysedRevision: string | null
  warriorSource: WarriorSource
  onBack: () => void
  /** The instant ages are measured against. Injected so a test can fix it. */
  now?: Date
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
      const found = halfLifeOf(survival.get(one.authorId))
      if (found.kind === 'unknown') return null
      return found.kind === 'outlasted' ? Number.POSITIVE_INFINITY : found.days
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
 * The half-life column, or a reason there is not one.
 *
 * A dash on its own reads as "this person has no half-life", which is a
 * claim. The line under the table says which of the two it is: no history
 * gathered, or a history about a different revision. Which of the three
 * things the figure itself can say is `halfLifeOf`'s to decide, so that the
 * screen and anything else reading the same numbers agree.
 */
function halfLifeColumn(
  history: HistoryState,
  survival: AuthorSurvivalWithIdentity | undefined,
): string {
  if (history.kind !== 'current') return '—'.padStart(11)
  const life = halfLifeOf(survival)
  if (life.kind === 'unknown') return '—'.padStart(11)
  if (life.kind === 'outlasted') {
    return `> ${formatAge(life.days)}`.padStart(11)
  }
  return formatAge(life.days).padStart(11)
}

/**
 * How old the code each warrior still holds is.
 *
 * Sorted by median rather than mean, because a mean is decided by whichever
 * single ancient file somebody happens to still own. The caveats below the
 * table are not decoration: the numbers are easy to read as a judgement of
 * people, and they are not one.
 *
 * Drawn from the analysis and the history as values: nothing here waits.
 */
export default function LongevityDashboard({
  analysis,
  history,
  analysedRevision,
  warriorSource,
  onBack,
  now,
}: LongevityDashboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('median')
  const [selected, setSelected] = useState(0)
  const [inDetail, setInDetail] = useState(false)

  const measuredAt = useMemo(() => now ?? new Date(), [now])
  const warriors = useMemo(
    () => ageOfAuthors(analysis, measuredAt),
    [analysis, measuredAt],
  )
  const repository = useMemo(
    () => ageOfRepository(analysis, measuredAt),
    [analysis, measuredAt],
  )
  const survival = useMemo(
    () =>
      new Map(
        survivalByAuthor(history.history, analysis.authors).map((one) => [
          one.authorId,
          one,
        ]),
      ),
    [history, analysis],
  )

  // A history outlives the analysis that produced it. Saying which revision
  // it describes is the difference between a curve about this repository
  // and a curve about the one it used to be.
  const historyState: HistoryState =
    history.describes === null
      ? { kind: 'absent' }
      : history.describes === analysedRevision
        ? { kind: 'current' }
        : { kind: 'stale', describes: history.describes }

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
    // Only a history about the revision in front of us. A stale one is
    // explicitly not drawn, and ranking by data the screen says it will not
    // show is the same claim by another route.
    if (input === 'h' && current) setSortKey('halflife')
    if (input === 's' && current) setSortKey('survival')
  })

  if (inDetail && chosen) {
    return (
      <WarriorDetail
        source={warriorSource}
        warrior={{
          authorId: chosen.authorId,
          name: chosen.name,
          email: chosen.email,
        }}
        onBack={() => setInDetail(false)}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('⏳ Code Longevity'))}</Text>

      {repository.survivingLines > 0 && (
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
        table sorted by "oldest first" invites exactly that.
      */}
      <Box marginTop={1}>
        <HonestyNote topic="age" />
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
          {current ? ' · h half-life · s survival' : ''} · ↑↓ and Enter for one
          warrior · q to go back
        </Text>
      </Box>
    </Box>
  )
}
