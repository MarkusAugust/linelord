import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { REALM_MEASURES } from '../../../core/barbarian'
import { HONESTY_NOTES } from '../../../core/honestyNotes'
import { bar } from '../bars'
import type { Realm } from '../data'
import { useScreenKeys } from '../keys'
import { useList } from '../list'
import { BattleRecord, MEASURE_NAMES } from '../parts'
import { C, count, fit, MEDALS, percent, plural, steady } from '../theme'

const METRIC_WIDTH = 7
const SHARE_BAR = 10
const SHARE_WIDTH = SHARE_BAR + 8
// Columns go one at a time in this order rather than the row being cut
// through the middle; the table's title says how many are only in the panel.
const DROP_ORDER = [
  'battleScars',
  'massiveBattles',
  'weaponMastery',
  'totalCampaigns',
  'soloQuestVictories',
  'ancientCodeSurvival',
  'territoryConquered',
  'share',
]

function columnsFor(tableWidth: number) {
  const fixed = 2 + 3 + 4 + 8 + 9
  let metrics = REALM_MEASURES
  let share = true
  const need = () =>
    fixed + 16 + metrics.length * METRIC_WIDTH + (share ? SHARE_WIDTH : 0)
  for (const key of DROP_ORDER) {
    if (need() <= tableWidth) break
    if (key === 'share') share = false
    else metrics = metrics.filter((one) => one.key !== key)
  }
  const nameWidth = Math.max(
    16,
    Math.min(
      26,
      tableWidth -
        fixed -
        metrics.length * METRIC_WIDTH -
        (share ? SHARE_WIDTH : 0),
    ),
  )
  return {
    metrics,
    share,
    nameWidth,
    hidden: REALM_MEASURES.length - metrics.length + (share ? 0 : 1),
  }
}

export function Rankings({
  realm,
  onOpen,
}: {
  realm: Realm
  onOpen: (authorId: number) => void
}) {
  const { width, height } = useTerminalDimensions()
  const { rankings, totals } = realm
  const list = useList(rankings, (one) => `${one.displayName} ${one.email}`)
  const columns = columnsFor(width - 8)
  // The battle record wants nine lines and a heading; below the table when it fits.
  const panel = height >= 38
  const chosen = list.chosen

  useScreenKeys({
    hint: '↑↓ jk move · → l Enter open the warrior · / search · :42 · ? help · ← h Esc back',
    legend: [
      [
        'Score',
        'Gorvek score: conquest, endurance and intensity, weighed together',
      ],
      ['Lines', 'surviving lines this warrior holds in HEAD'],
      [
        'Share',
        'their lines as a part of every surviving line; the bar is that part',
      ],
      ...REALM_MEASURES.map((m): [string, string] => [
        MEASURE_NAMES[m.key].short,
        `${MEASURE_NAMES[m.key].label}: ${MEASURE_NAMES[m.key].explanation}`,
      ]),
      [
        'of …',
        'in the battle record: the whole the number is a part of, and the bar is that part',
      ],
      [
        '2nd of 16',
        'where that puts them among the warriors; = when they share the place',
      ],
      ...HONESTY_NOTES.rankings.lines.map((line): [string, string] => [
        '',
        line,
      ]),
    ],
    onAction: (action) => {
      if (action.type === 'open') {
        if (chosen) onOpen(chosen.authorId)
        return true
      }
      return list.act(action)
    },
  })

  if (rankings.length === 0) {
    return (
      <box style={{ padding: 2 }}>
        <text fg={C.red}>
          ⚔ No warriors found. "Even Gorvek needs warriors to rank, O Prince!"
        </text>
      </box>
    )
  }

  const header =
    `     ${'  #'} ${'Warrior'.padEnd(columns.nameWidth)}${'Score'.padStart(8)}${'Lines'.padStart(9)}` +
    (columns.share ? '  Share'.padEnd(SHARE_WIDTH) : '') +
    columns.metrics
      .map((m) => MEASURE_NAMES[m.key].short.padStart(METRIC_WIDTH))
      .join('')

  const title = [
    `🪓 ${plural(rankings.length, 'warrior')}`,
    columns.hidden > 0
      ? `${columns.hidden} column${columns.hidden === 1 ? '' : 's'} only in the battle record`
      : '',
    list.matches.length ? plural(list.matches.length, 'match', 'matches') : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, gap: 1, padding: 1 }}>
      <box
        title={` ${title} `}
        style={{
          border: true,
          borderColor: C.gray,
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: 8,
        }}
      >
        <text
          attributes={TextAttributes.BOLD}
          wrapMode="none"
          style={{ flexShrink: 0 }}
        >
          {header}
        </text>
        <scrollbox
          ref={list.scroll}
          style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
        >
          {rankings.map((warrior, index) => {
            const here = index === list.selected
            const match = list.isMatch(index)
            const share =
              totals.lines > 0
                ? warrior.metrics.survivingLines / totals.lines
                : 0
            return (
              <box
                key={warrior.authorId}
                id={list.idOf(index)}
                style={{ backgroundColor: here ? C.selected : undefined }}
              >
                <text
                  wrapMode="none"
                  attributes={here ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  <span fg={C.green}>{here ? '› ' : '  '}</span>
                  <span>{MEDALS[index] ? `${MEDALS[index]} ` : '   '}</span>
                  <span
                    fg={here ? C.green : C.gray}
                  >{`${String(warrior.rank + 1).padStart(3)} `}</span>
                  <span fg={match ? C.yellow : here ? C.green : C.text}>
                    {warrior.displayName
                      .slice(0, columns.nameWidth - 1)
                      .padEnd(columns.nameWidth)}
                  </span>
                  <span fg={here ? C.green : C.text}>
                    {fit(warrior.gorvekScore, 8) +
                      fit(warrior.metrics.survivingLines, 9)}
                  </span>
                  {columns.share && (
                    <span
                      fg={C.gray}
                    >{`${percent(warrior.metrics.survivingLines, totals.lines).padStart(7)} `}</span>
                  )}
                  {columns.share && (
                    <span fg={here ? C.green : C.cyan}>
                      {bar(share, SHARE_BAR)}
                    </span>
                  )}
                  <span fg={here ? C.green : C.text}>
                    {columns.metrics
                      .map((m) => fit(m.read(warrior.metrics), METRIC_WIDTH))
                      .join('')}
                  </span>
                </text>
              </box>
            )
          })}
        </scrollbox>
      </box>

      {panel && chosen && (
        <box
          title={` ${MEDALS[list.selected] ?? '🪓'} #${list.selected + 1} · ${chosen.displayName} — battle record `}
          style={{
            border: true,
            borderColor: C.green,
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            flexShrink: 0,
            gap: 4,
          }}
        >
          <box style={{ flexDirection: 'column', flexShrink: 0 }}>
            <BattleRecord
              warrior={chosen}
              rankings={rankings}
              totals={totals}
              barWidth={12}
            />
          </box>
          {width >= 140 && (
            <box style={{ flexDirection: 'column', flexGrow: 1 }}>
              <text
                fg={C.gray}
                wrapMode="none"
              >{`${chosen.title ? `${chosen.title} · ` : ''}${chosen.email}`}</text>
              <text
                fg={C.gray}
                wrapMode="none"
              >{`Gorvek score ${count(Math.round(chosen.gorvekScore))}`}</text>
              {chosen.specialAchievements.length > 0 && (
                <>
                  <text
                    fg={C.yellow}
                    attributes={TextAttributes.BOLD}
                    style={{ marginTop: 1 }}
                  >
                    🏆 LEGENDARY ACHIEVEMENTS
                  </text>
                  {chosen.specialAchievements.map((one) => (
                    <text key={one} fg={C.magenta} wrapMode="none">
                      {steady(one)}
                    </text>
                  ))}
                </>
              )}
            </box>
          )}
        </box>
      )}
    </box>
  )
}
