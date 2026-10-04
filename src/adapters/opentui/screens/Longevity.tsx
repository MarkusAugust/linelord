import { TextAttributes } from '@opentui/core'
import { useMemo, useState } from 'react'
import { HONESTY_NOTES } from '../../../core/honestyNotes'
import {
  type AuthorLongevity,
  type AuthorSurvivalWithIdentity,
  ageOfAuthors,
  ageOfRepository,
  halfLifeOf,
  survivalByAuthor,
  withForgottenContributors,
} from '../../../core/longevity'
import type { Realm } from '../data'
import {
  formatAge,
  formatSpread,
  renderAgeSparkline,
} from '../format/ageFormatting'
import { useScreenKeys } from '../keys'
import { useList } from '../list'
import { C, fit, percent, plural } from '../theme'

type SortKey = 'median' | 'mean' | 'lines' | 'halflife' | 'survival'
const SORT_LABELS: Record<SortKey, string> = {
  median: 'median age',
  mean: 'mean age',
  lines: 'surviving lines',
  halflife: 'half-life',
  survival: 'survival rate',
}

/** Sorted as the Ink screen sorts: a half-life nobody measured goes last, not to either end. */
function sortWarriors(
  warriors: AuthorLongevity[],
  key: SortKey,
  survival: Map<number, AuthorSurvivalWithIdentity>,
) {
  const sorted = [...warriors]
  if (key === 'lines')
    return sorted.sort((a, b) => b.survivingLines - a.survivingLines)
  if (key === 'mean')
    return sorted.sort((a, b) => b.meanAgeDays - a.meanAgeDays)
  if (key === 'halflife') {
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

export function Longevity({
  realm,
  onOpen,
}: {
  realm: Realm
  onOpen: (authorId: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('median')
  const warriors = useMemo(
    () => ageOfAuthors(realm.analysis, realm.measuredAt),
    [realm],
  )
  const repository = useMemo(
    () => ageOfRepository(realm.analysis, realm.measuredAt),
    [realm],
  )
  const survival = useMemo(
    () =>
      new Map(
        survivalByAuthor(realm.history.history, realm.analysis.authors).map(
          (one) => [one.authorId, one],
        ),
      ),
    [realm],
  )

  // A history about another revision is refused rather than drawn.
  const describes = realm.history.describes
  const historyState =
    describes === null
      ? 'absent'
      : describes === realm.context.headSha
        ? 'current'
        : 'stale'
  const current = historyState === 'current'
  const order: SortKey[] = current
    ? ['median', 'mean', 'lines', 'halflife', 'survival']
    : ['median', 'mean', 'lines']

  const shown = useMemo(
    () =>
      sortWarriors(
        current ? withForgottenContributors(warriors, survival) : warriors,
        sortKey,
        survival,
      ),
    [warriors, survival, sortKey, current],
  )
  const list = useList(shown, (one) => `${one.name} ${one.email}`)

  useScreenKeys({
    hint: `sorted by ${SORT_LABELS[sortKey]} · o change order · ↑↓ jk · → l Enter open · / search · ? help · ← h Esc back`,
    keys: [
      ['o', `change the order: ${order.map((k) => SORT_LABELS[k]).join(', ')}`],
    ],
    legend: [
      ['Lines', 'surviving lines they hold in HEAD'],
      ['Median', 'half their lines are older than this, half younger'],
      [
        'Spread',
        'a tenth of their lines are younger than the first, a tenth older than the second',
      ],
      [
        'Half-life',
        "how long until half of a month's work is gone; > when it outlasted the history",
      ],
      ['New → old', 'where their lines sit in time, newest on the left'],
      ...HONESTY_NOTES.age.lines.map((line): [string, string] => ['', line]),
    ],
    onAction: (action) => {
      if (action.type === 'open') {
        if (list.chosen) onOpen(list.chosen.authorId)
        return true
      }
      return list.act(action)
    },
    onKey: (key) => {
      if (key !== 'o') return false
      const next =
        order[(order.indexOf(sortKey) + 1) % order.length] ?? 'median'
      setSortKey(next)
      list.setSelected(0)
      return { status: `Sorted by ${SORT_LABELS[next]}` }
    },
  })

  const halfLife = (one: AuthorLongevity) => {
    if (!current) return '—'
    const life = halfLifeOf(survival.get(one.authorId))
    if (life.kind === 'unknown') return '—'
    return life.kind === 'outlasted'
      ? `> ${formatAge(life.days)}`
      : formatAge(life.days)
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, gap: 1, padding: 1 }}>
      {repository.survivingLines > 0 && (
        <box
          title=" ⏳ The realm's age "
          style={{
            border: true,
            borderColor: C.gray,
            flexDirection: 'column',
            paddingLeft: 1,
            flexShrink: 0,
          }}
        >
          <text wrapMode="none">
            <span>The codebase is </span>
            <span fg={C.green} attributes={TextAttributes.BOLD}>
              {formatAge(repository.medianAgeDays ?? 0)}
            </span>
            <span>{` old at the middle, ${percent(repository.writtenInLast90Days, 1)} of it last touched within ninety days.`}</span>
          </text>
          {repository.oldestLine && (
            <text fg={C.gray} wrapMode="none">
              {`Oldest line still standing: ${repository.oldestLine.path}:${repository.oldestLine.lineNumber} — ${formatAge(repository.oldestLine.ageDays)} old`}
            </text>
          )}
          {historyState === 'absent' && (
            <text fg={C.dim}>
              Half-life and survival need the history walked: run with
              --history.
            </text>
          )}
          {historyState === 'stale' && (
            <text
              fg={C.yellow}
            >{`⚠ The stored history describes ${describes?.slice(0, 7)}, not what is analysed; half-life is left out.`}</text>
          )}
        </box>
      )}

      <box
        title={` ⏳ ${plural(shown.length, 'warrior')} · sorted by ${SORT_LABELS[sortKey]}${list.matches.length ? ` · ${plural(list.matches.length, 'match', 'matches')}` : ''} `}
        style={{
          border: true,
          borderColor: C.gray,
          flexDirection: 'column',
          flexGrow: 1,
        }}
      >
        <text
          attributes={TextAttributes.BOLD}
          wrapMode="none"
          style={{ flexShrink: 0 }}
        >
          {`    # ${'Warrior'.padEnd(26)}${'Lines'.padStart(9)}${'Median'.padStart(9)}${'Spread'.padStart(17)}${'Half-life'.padStart(11)}  New → old`}
        </text>
        <scrollbox
          ref={list.scroll}
          style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
        >
          {shown.map((one, index) => {
            const here = index === list.selected
            const gone = one.survivingLines === 0
            return (
              <box
                key={one.authorId}
                id={list.idOf(index)}
                style={{ backgroundColor: here ? C.selected : undefined }}
              >
                <text
                  wrapMode="none"
                  attributes={here ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  <span fg={C.green}>{here ? '› ' : '  '}</span>
                  <span fg={C.gray}>{`${String(index + 1).padStart(3)} `}</span>
                  <span
                    fg={
                      list.isMatch(index)
                        ? C.yellow
                        : here
                          ? C.green
                          : gone
                            ? C.dim
                            : C.text
                    }
                  >
                    {one.name.slice(0, 25).padEnd(26)}
                  </span>
                  <span>{fit(one.survivingLines, 9)}</span>
                  <span>
                    {(gone ? '—' : formatAge(one.medianAgeDays)).padStart(9)}
                  </span>
                  <span fg={C.gray}>
                    {(gone
                      ? '—'
                      : formatSpread(one.p10AgeDays, one.p90AgeDays)
                    ).padStart(17)}
                  </span>
                  <span>{halfLife(one).padStart(11)}</span>
                  <span
                    fg={C.blue}
                  >{`  ${renderAgeSparkline(one.ageHistogram)}`}</span>
                </text>
              </box>
            )
          })}
        </scrollbox>
      </box>
    </box>
  )
}
