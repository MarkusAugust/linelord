import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useMemo } from 'react'
import { authorContributions, repositoryStats } from '../../../core/ownership'
import { bar } from '../bars'
import type { Realm } from '../data'
import { useScreenKeys } from '../keys'
import { useList } from '../list'
import { C, count, fit, MEDALS, plural } from '../theme'

export function Overview({
  realm,
  thresholdKB,
  onOpen,
  onMerge,
}: {
  realm: Realm
  /** The size above which a file is set aside, in KB, for the label that says so. */
  thresholdKB: number
  onOpen: (authorId: number) => void
  onMerge: (authorId: number) => void
}) {
  const { width } = useTerminalDimensions()
  const stats = useMemo(() => repositoryStats(realm.analysis), [realm])
  const warriors = useMemo(() => authorContributions(realm.analysis), [realm])
  const list = useList(warriors, (one) => `${one.displayName} ${one.email}`)
  const wide = width >= 110
  const barWidth = width >= 140 ? 24 : 14

  useScreenKeys({
    hint: '↑↓ jk move · → l Enter open the warrior · m merge · / search · ? help · ← h Esc back',
    keys: [
      [
        'm',
        'merge the warrior under the cursor with others who are the same person',
      ],
    ],
    legend: [
      [
        'Share',
        'their lines as a part of every surviving line in HEAD; the bar is that part',
      ],
      [
        'Lines',
        'surviving lines they hold in HEAD — not commits, not lines ever written',
      ],
    ],
    onAction: (action) => {
      if (action.type === 'open') {
        if (list.chosen) onOpen(list.chosen.id)
        return true
      }
      return list.act(action)
    },
    onKey: (key) => {
      if (key === 'm' && list.chosen && warriors.length >= 2) {
        onMerge(list.chosen.id)
        return true
      }
      return false
    },
  })

  const statRows: Array<[string, string, string?]> = [
    ['Developers', count(warriors.length), C.cyan],
    ['Total files', count(stats.totalFiles)],
    ['Files analysed', count(stats.totalAnalyzedFiles), C.green],
    ['Ignored files', count(stats.totalIgnoredFiles), C.gray],
    ['Binary files skipped', count(stats.totalBinaryFiles), C.gray],
    [
      `Over ${count(thresholdKB)} KB, skipped`,
      count(stats.totalLargeFiles),
      C.gray,
    ],
    ['Lines of code', count(stats.totalLines), C.green],
  ]

  return (
    <box
      style={{
        flexDirection: wide ? 'row' : 'column',
        flexGrow: 1,
        gap: 1,
        padding: 1,
      }}
    >
      <box
        title=" 🏰 The realm "
        style={{
          border: true,
          borderColor: C.gray,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          width: wide ? 36 : '100%',
          flexShrink: 0,
        }}
      >
        {wide ? (
          statRows.map(([label, value, colour]) => (
            <text key={label} wrapMode="none">
              <span fg={C.gray}>{label.padEnd(22)}</span>
              <span fg={colour ?? C.text} attributes={TextAttributes.BOLD}>
                {value.padStart(10)}
              </span>
            </text>
          ))
        ) : (
          <text fg={C.gray} wrapMode="none" style={{ flexShrink: 0 }}>
            {`${plural(warriors.length, 'warrior')} · ${plural(stats.totalAnalyzedFiles, 'file')} analysed of ${count(stats.totalFiles)} · ${plural(stats.totalLines, 'line')}`}
          </text>
        )}
      </box>

      <box
        title={` 🪓 Every warrior, by the share they hold${list.matches.length ? ` · ${plural(list.matches.length, 'match', 'matches')}` : ''} `}
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
          {`        # ${'Warrior'.padEnd(26)}${'Share'.padStart(7)}  ${''.padEnd(barWidth)}${'Lines'.padStart(9)}`}
        </text>
        {warriors.length === 0 ? (
          <text fg={C.gray}>Nobody holds a line in this repository.</text>
        ) : (
          <scrollbox
            ref={list.scroll}
            style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
          >
            {warriors.map((one, index) => {
              const here = index === list.selected
              const match = list.matches.includes(index)
              return (
                <box
                  key={one.id}
                  id={list.idOf(index)}
                  style={{
                    flexDirection: 'column',
                    backgroundColor: here ? C.selected : undefined,
                  }}
                >
                  <text
                    wrapMode="none"
                    attributes={
                      here ? TextAttributes.BOLD : TextAttributes.NONE
                    }
                  >
                    <span fg={C.green}>{here ? '› ' : '  '}</span>
                    <span>{MEDALS[index] ? `${MEDALS[index]} ` : '   '}</span>
                    <span
                      fg={C.gray}
                    >{`${String(index + 1).padStart(3)} `}</span>
                    <span fg={match ? C.yellow : here ? C.green : C.text}>
                      {one.displayName.slice(0, 25).padEnd(26)}
                    </span>
                    <span>{`${one.percentage.toFixed(1)}%`.padStart(7)} </span>
                    <span fg={here ? C.green : C.cyan}>
                      {bar(one.percentage / 100, barWidth)}
                    </span>
                    <span>{fit(one.totalLines, 9)}</span>
                  </text>
                  <text
                    fg={C.dim}
                    wrapMode="none"
                  >{`         ${one.title ?? ''}${one.title ? ' · ' : ''}${one.email}`}</text>
                </box>
              )
            })}
          </scrollbox>
        )}
      </box>
    </box>
  )
}
