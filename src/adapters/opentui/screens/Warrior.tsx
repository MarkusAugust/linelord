import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useEffect, useState } from 'react'
import type {
  AuthorFileLongevity,
  AuthorLongevity,
  AuthorSurvivalWithIdentity,
} from '../../../core/longevity'
import type {
  AuthorContribution,
  FileContribution,
} from '../../../core/ownership'
import { bar } from '../bars'
import type { Realm } from '../data'
import { formatAge, HISTOGRAM_BUCKETS } from '../format/ageFormatting'
import { curveSpanDays, renderSurvivalCurve } from '../format/survivalCurve'
import { useScreenKeys } from '../keys'
import { useScrollPage } from '../list'
import { BattleRecord, Heading } from '../parts'
import {
  C,
  count,
  fit,
  MEDALS,
  ordinal,
  percent,
  plural,
  steady,
} from '../theme'

type Deeds = {
  share: AuthorContribution | null
  files: FileContribution[]
  age: AuthorLongevity | null
  oldestFiles: AuthorFileLongevity[]
  survival: AuthorSurvivalWithIdentity | null
}

function halfLifeSentence(survival: AuthorSurvivalWithIdentity): string {
  if (survival.halfLifeDays !== null)
    return `Half of a month's work is gone after ${formatAge(survival.halfLifeDays)}`
  const watched = survival.survivalCurve.at(-1)?.ageDays ?? 0
  if (watched <= 0)
    return 'The history saw this work only once, so it says nothing about how long it lasts'
  return `Half of it is still there after ${formatAge(watched)}, as far as this history reaches`
}

/** One warrior, in full: the same screen from the overview, the rankings and the longevity table. */
export function Warrior({
  realm,
  authorId,
}: {
  realm: Realm
  authorId: number
}) {
  const { width } = useTerminalDimensions()
  const [deeds, setDeeds] = useState<Deeds | 'loading' | { error: string }>(
    'loading',
  )
  const page = useScrollPage()
  const ranking = realm.rankings.find((one) => one.authorId === authorId)
  const author = realm.analysis.authors.find((one) => one.id === authorId)
  const place = realm.rankings.findIndex((one) => one.authorId === authorId)
  const barWidth = width >= 150 ? 30 : width >= 110 ? 20 : 12

  useEffect(() => {
    const source = realm.warriorSource
    Promise.all([
      source.share(authorId),
      source.files(authorId),
      source.age(authorId),
      source.oldestFiles(authorId),
      source.survival(authorId),
    ])
      .then(([share, files, age, oldestFiles, survival]) =>
        setDeeds({ share, files, age, oldestFiles, survival }),
      )
      .catch((error: unknown) =>
        setDeeds({
          error: error instanceof Error ? error.message : String(error),
        }),
      )
  }, [realm, authorId])

  useScreenKeys({
    hint: '↑↓ jk scroll · PgUp PgDn · gg G · ? help · ← h Esc back',
    legend: [
      ['of …', 'the whole each number is a part of; the bar is that part'],
      [
        '2nd of 16',
        'where that puts them among the warriors; = when they share the place',
      ],
      ['of their lines', 'in How old it is: a part of what this warrior holds'],
      ['Age', 'when a line was last changed, not when it was written'],
    ],
    onAction: page.act,
  })

  const name = ranking?.displayName ?? author?.displayName ?? 'Unknown warrior'
  const email = ranking?.email ?? author?.email ?? ''

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 1 }}>
      <box
        title={` ${place >= 0 ? (MEDALS[place] ?? '🪓') : '🪓'} ${name} `}
        style={{
          border: true,
          borderColor: C.green,
          flexDirection: 'column',
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <scrollbox
          ref={page.scroll}
          style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
        >
          <text fg={C.gray} wrapMode="none">
            {`${author?.title ? `${author.title} · ` : ''}${email}${place >= 0 ? ` · ${ordinal(place + 1)} of ${realm.rankings.length} in the rankings` : ''}`}
          </text>

          {deeds === 'loading' ? (
            <text fg={C.gray}>Reading the warrior's deeds…</text>
          ) : 'error' in deeds ? (
            <text
              fg={C.red}
            >{`Could not read their deeds: ${deeds.error}`}</text>
          ) : (
            <>
              <Heading>⚔ WHAT THEY HOLD</Heading>
              {deeds.share ? (
                <>
                  <text wrapMode="none">
                    <span attributes={TextAttributes.BOLD}>
                      {count(deeds.share.totalLines)}
                    </span>
                    <span
                      fg={C.gray}
                    >{` of ${count(realm.totals.lines)} lines, in ${plural(deeds.share.totalFiles, 'file')}  `}</span>
                    <span attributes={TextAttributes.BOLD}>
                      {percent(deeds.share.totalLines, realm.totals.lines)}
                    </span>
                    <span fg={C.gray}> of the realm</span>
                  </text>
                  <text fg={C.cyan} wrapMode="none">
                    {bar(
                      realm.totals.lines > 0
                        ? deeds.share.totalLines / realm.totals.lines
                        : 0,
                      Math.min(60, width - 10),
                    )}
                  </text>
                </>
              ) : (
                <text fg={C.gray}>
                  Holds no line in the analysed revision. Whatever they wrote
                  has since been rewritten.
                </text>
              )}

              {ranking && (
                <>
                  <Heading>🪓 BATTLE RECORD</Heading>
                  <BattleRecord
                    warrior={ranking}
                    rankings={realm.rankings}
                    totals={realm.totals}
                    barWidth={barWidth}
                  />
                  <text
                    fg={C.gray}
                    wrapMode="none"
                  >{`Gorvek score ${count(Math.round(ranking.gorvekScore))}`}</text>
                  {ranking.specialAchievements.length > 0 && (
                    <>
                      <Heading>🏆 LEGENDARY ACHIEVEMENTS</Heading>
                      {ranking.specialAchievements.map((one) => (
                        <text key={one} fg={C.magenta} wrapMode="none">
                          {steady(one)}
                        </text>
                      ))}
                    </>
                  )}
                </>
              )}

              {deeds.age && (
                <>
                  <Heading>⏳ HOW OLD IT IS</Heading>
                  <text fg={C.gray} wrapMode="none">
                    {`middle age ${formatAge(deeds.age.medianAgeDays)} · mean ${formatAge(deeds.age.meanAgeDays)} · a tenth younger than ${formatAge(deeds.age.p10AgeDays)}, a tenth older than ${formatAge(deeds.age.p90AgeDays)}`}
                  </text>
                  {HISTOGRAM_BUCKETS.map(({ key, label }) => {
                    const lines = deeds.age?.ageHistogram[key] ?? 0
                    const theirs = deeds.age?.survivingLines ?? 0
                    return (
                      <text key={key} wrapMode="none">
                        <span fg={C.gray}>{label.padEnd(24)}</span>
                        <span>{fit(lines, 8)}</span>
                        <span fg={C.dim}>{' of their lines'}</span>
                        <span fg={C.gray}>
                          {percent(lines, theirs).padStart(7)}{' '}
                        </span>
                        <span fg={C.blue}>
                          {bar(theirs > 0 ? lines / theirs : 0, barWidth)}
                        </span>
                      </text>
                    )
                  })}
                  <text fg={C.gray} wrapMode="none">
                    {`oldest  ${deeds.age.oldestLine ? `${deeds.age.oldestLine.path}:${deeds.age.oldestLine.lineNumber} — ${formatAge(deeds.age.oldestLine.ageDays)}` : '—'}`}
                  </text>
                  <text fg={C.gray} wrapMode="none">
                    {`newest  ${deeds.age.newestLine ? `${deeds.age.newestLine.path}:${deeds.age.newestLine.lineNumber} — ${formatAge(deeds.age.newestLine.ageDays)}` : '—'}`}
                  </text>
                </>
              )}

              <Heading>💀 WHAT BECAME OF IT</Heading>
              {deeds.survival ? (
                <>
                  <text fg={C.gray} wrapMode="none">
                    {`${count(deeds.survival.linesEverWritten)} lines written in all, ${count(deeds.survival.survivingLines)} still standing — ${percent(deeds.survival.survivingLines, deeds.survival.linesEverWritten)}`}
                  </text>
                  <text fg={C.gray} wrapMode="none">
                    {halfLifeSentence(deeds.survival)}
                  </text>
                  <text fg={C.orange} wrapMode="none">
                    {renderSurvivalCurve(deeds.survival.survivalCurve, 48)}
                  </text>
                  <text
                    fg={C.dim}
                    wrapMode="none"
                  >{`new${' '.repeat(39)}older → ${formatAge(curveSpanDays(deeds.survival.survivalCurve))}`}</text>
                </>
              ) : (
                <text fg={C.dim}>
                  Needs the history walked: run with --history.
                </text>
              )}

              {deeds.files.length > 0 && (
                <>
                  <Heading>🏰 FILES THEY HOLD THE MOST OF</Heading>
                  {deeds.files.slice(0, 15).map((file, index) => (
                    <text key={file.path} wrapMode="none">
                      <span
                        fg={C.dim}
                      >{`${String(index + 1).padStart(2)}. `}</span>
                      <span>{fit(file.authorLines, 6)}</span>
                      <span fg={C.dim}>
                        {` of ${count(file.totalLines)}`.padEnd(10)}
                      </span>
                      <span fg={C.gray}>
                        {`${file.percentage}%`.padStart(5)}{' '}
                      </span>
                      <span fg={C.green}>{bar(file.percentage / 100, 12)}</span>
                      <span fg={C.text}>{`  ${file.path}`}</span>
                    </text>
                  ))}
                  {deeds.files.length > 15 && (
                    <text
                      fg={C.dim}
                    >{`    … and ${plural(deeds.files.length - 15, 'more file')}`}</text>
                  )}
                </>
              )}

              {deeds.oldestFiles.length > 0 && (
                <>
                  <Heading>🏺 WHERE THE OLDEST OF IT SITS</Heading>
                  {deeds.oldestFiles.map((file) => (
                    <text key={file.path} fg={C.gray} wrapMode="none">
                      {`${formatAge(file.medianAgeDays).padStart(8)}  ${fit(file.lines, 6)} lines  ${file.path}`}
                    </text>
                  ))}
                </>
              )}
              <text> </text>
            </>
          )}
        </scrollbox>
      </box>
    </box>
  )
}
