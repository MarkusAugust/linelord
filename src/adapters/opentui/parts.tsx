import { TextAttributes } from '@opentui/core'
import {
  type BarbarianRanking,
  placeAmong,
  REALM_MEASURES,
  type RealmTotals,
} from '../../core/barbarian'
import { bar } from './bars'
import { C, count, fit, ordinal, percent } from './theme'

/** The long names of the rankings' metrics, keyed as REALM_MEASURES is. */
export const MEASURE_NAMES: Record<
  (typeof REALM_MEASURES)[number]['key'],
  { short: string; label: string; explanation: string }
> = {
  survivingLines: {
    short: 'Lines',
    label: 'Lines in HEAD',
    explanation: 'surviving lines this warrior holds',
  },
  battleScars: {
    short: 'Scars',
    label: 'Battle Scars',
    explanation: 'surviving lines in large or legacy-looking files',
  },
  territoryConquered: {
    short: 'Terr',
    label: 'Territory Conquered',
    explanation: 'files where this warrior owns more than half the lines',
  },
  soloQuestVictories: {
    short: 'Solo',
    label: 'Solo Quests',
    explanation: 'files where every surviving line is theirs',
  },
  weaponMastery: {
    short: 'Types',
    label: 'Weapon Mastery',
    explanation: 'distinct file types they hold lines in',
  },
  ancientCodeSurvival: {
    short: 'Anc',
    label: 'Ancient Code',
    explanation: 'surviving lines last touched more than a year ago',
  },
  massiveBattles: {
    short: 'Mass',
    label: 'Massive Battles',
    explanation:
      'days when over 100 of their surviving lines were last touched',
  },
  totalCampaigns: {
    short: 'Camp',
    label: 'Campaigns',
    explanation: 'distinct days their surviving lines were last touched',
  },
}

/**
 * One measure of one warrior: how much, out of how much there is, as a bar
 * of that whole, and where that puts them among the warriors.
 *
 *   Ancient Code     11,481 of 31,400 lines  36.6%  ████▍        2nd of 16
 */
export function MeasureRow({
  label,
  value,
  whole,
  unit,
  place,
  barWidth,
}: {
  label: string
  value: number
  whole: number
  unit: string
  place: { place: number; of: number; shared: boolean } | null
  barWidth: number
}) {
  return (
    <text wrapMode="none">
      <span fg={C.gray}>{label.padEnd(20)}</span>
      <span attributes={TextAttributes.BOLD}>{fit(value, 8)}</span>
      <span fg={C.dim}>{` of ${count(whole)} ${unit}`.padEnd(22)}</span>
      <span fg={C.gray}>{percent(value, whole).padStart(6)} </span>
      <span fg={C.magenta}>{bar(whole > 0 ? value / whole : 0, barWidth)}</span>
      <span fg={place?.place === 1 ? C.yellow : C.gray}>
        {place && value > 0
          ? `  ${place.shared ? '=' : ' '}${ordinal(place.place)} of ${place.of}`
          : ''}
      </span>
    </text>
  )
}

/** Every barbarian measure of one warrior, as MeasureRows. */
export function BattleRecord({
  warrior,
  rankings,
  totals,
  barWidth,
}: {
  warrior: BarbarianRanking
  rankings: BarbarianRanking[]
  totals: RealmTotals
  barWidth: number
}) {
  return (
    <box style={{ flexDirection: 'column' }}>
      <MeasureRow
        label="Lines in HEAD"
        value={warrior.metrics.survivingLines}
        whole={totals.lines}
        unit="lines"
        place={placeAmong(rankings, (m) => m.survivingLines, warrior.authorId)}
        barWidth={barWidth}
      />
      {REALM_MEASURES.map((measure) => (
        <MeasureRow
          key={measure.key}
          label={MEASURE_NAMES[measure.key].label}
          value={measure.read(warrior.metrics)}
          whole={totals[measure.of]}
          unit={measure.unit}
          place={placeAmong(rankings, measure.read, warrior.authorId)}
          barWidth={barWidth}
        />
      ))}
    </box>
  )
}

/** A heading inside a panel. */
export function Heading({ children }: { children: string }) {
  return (
    <text
      fg={C.yellow}
      attributes={TextAttributes.BOLD}
      style={{ marginTop: 1 }}
    >
      {children}
    </text>
  )
}
