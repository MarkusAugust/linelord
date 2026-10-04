import { TextAttributes } from '@opentui/core'
import { useMemo, useRef, useState } from 'react'
import type { IdentityMerge } from '../../../core/identity'
import {
  type MailmapWrite,
  proposeMerge,
  writeMerge,
} from '../../../core/mailmap'
import type { FileSystemPort } from '../../../ports/files'
import type { Realm } from '../data'
import { useScreenKeys } from '../keys'
import { useList } from '../list'
import { C, count, plural } from '../theme'

type Identity = { name: string; email: string }
type Row =
  | { kind: 'suggestion'; merge: IdentityMerge }
  | { kind: 'warrior'; id: number; identity: Identity; lines: number }

type Step =
  | { name: 'mark' }
  | { name: 'keep'; chosen: Identity[] }
  | { name: 'proposing'; chosen: Identity[]; keep: number }
  | { name: 'preview'; chosen: Identity[]; keep: number; lines: string[] }
  | { name: 'writing'; chosen: Identity[]; keep: number; lines: string[] }
  | { name: 'written'; result: MailmapWrite }
  | { name: 'failed'; message: string }

/**
 * Several identities a person knows to be one warrior, merged by hand -- or
 * taken from the guesses at the top, through the same steps.
 */
export function Merge({
  realm,
  repoPath,
  files,
  initiallyMarked,
  onMerged,
  onLeave,
}: {
  realm: Realm
  repoPath: string
  /** Where .mailmap is read from and written to. */
  files: FileSystemPort
  initiallyMarked?: number
  onMerged: () => void
  onLeave: () => void
}) {
  const warriors = realm.contributions
  const rows: Row[] = useMemo(
    () => [
      ...realm.merges.map((merge): Row => ({ kind: 'suggestion', merge })),
      ...warriors.map(
        (one): Row => ({
          kind: 'warrior',
          id: one.id,
          identity: { name: one.displayName, email: one.email },
          lines: one.totalLines,
        }),
      ),
    ],
    [realm, warriors],
  )
  const start =
    initiallyMarked === undefined
      ? 0
      : rows.findIndex(
          (row) => row.kind === 'warrior' && row.id === initiallyMarked,
        )
  const list = useList(
    rows,
    (row) =>
      row.kind === 'warrior'
        ? `${row.identity.name} ${row.identity.email}`
        : `${row.merge.canonical.name} ${row.merge.canonical.email}`,
    Math.max(0, start),
  )
  const [marked, setMarked] = useState<Set<number>>(
    () => new Set(initiallyMarked === undefined ? [] : [initiallyMarked]),
  )
  const [step, setStep] = useState<Step>({ name: 'mark' })
  // Set the moment a read or write starts, not when the screen draws again:
  // two keys that arrive before the next render must not start two writes,
  // which would both read the file and both append the same lines.
  const busy = useRef(false)
  const once = <T,>(work: Promise<T>, then: (value: T) => void) => {
    if (busy.current) return
    busy.current = true
    work
      .then(then)
      .catch(fail)
      .finally(() => {
        busy.current = false
      })
  }
  const [keepAt, setKeepAt] = useState(0)

  const marks = warriors
    .filter((one) => marked.has(one.id))
    .map((one) => ({ name: one.displayName, email: one.email }))
  const fail = (error: unknown) =>
    setStep({
      name: 'failed',
      message: error instanceof Error ? error.message : String(error),
    })
  const split = (chosen: Identity[], keep: number) => {
    const kept = chosen[keep] ?? chosen[0] ?? { name: '', email: '' }
    return {
      kept,
      absorbed: chosen.filter((one) => one !== kept).map((one) => one.email),
    }
  }

  const hints: Record<Step['name'], string> = {
    mark: 'space mark · → l Enter take a suggestion, or merge the marked · / search · ← h Esc back',
    keep: '↑↓ jk choose who is shown · → l Enter continue · ← h Esc back',
    proposing: 'reading .mailmap…',
    preview: 'w write to .mailmap · nothing is written before · ← h Esc back',
    writing: 'writing…',
    written: 'Enter count the realm again with this merge',
    failed: '← h Esc back',
  }

  useScreenKeys({
    hint: hints[step.name],
    keys: [
      ['space', 'mark or unmark a warrior'],
      ['w', 'write the merge, on the preview'],
    ],
    legend: [
      [
        'Suggested',
        'identities that look alike; a guess, and wrong often enough to matter',
      ],
      [
        '.mailmap',
        "git's own file: git applies it before LineLord counts a line, so it holds in git log too",
      ],
    ],
    onAction: (action) => {
      switch (step.name) {
        case 'mark': {
          if (action.type === 'back') {
            onLeave()
            return true
          }
          if (action.type === 'open') {
            const row = list.chosen
            if (row?.kind === 'suggestion') {
              setKeepAt(0)
              setStep({
                name: 'keep',
                chosen: [
                  row.merge.canonical,
                  ...row.merge.absorbed.map(({ name, email }) => ({
                    name,
                    email,
                  })),
                ],
              })
              return true
            }
            if (marks.length < 2)
              return { status: 'Mark two or more with space first' }
            setKeepAt(0)
            setStep({ name: 'keep', chosen: marks })
            return true
          }
          return list.act(action)
        }
        case 'keep': {
          if (action.type === 'back') {
            setStep({ name: 'mark' })
            return true
          }
          if (action.type === 'move') {
            setKeepAt((at) =>
              Math.max(0, Math.min(step.chosen.length - 1, at + action.by)),
            )
            return true
          }
          if (action.type === 'open') {
            const { kept, absorbed } = split(step.chosen, keepAt)
            setStep({ name: 'proposing', chosen: step.chosen, keep: keepAt })
            once(proposeMerge(repoPath, kept, absorbed, files), (lines) =>
              setStep({
                name: 'preview',
                chosen: step.chosen,
                keep: keepAt,
                lines,
              }),
            )
            return true
          }
          return false
        }
        case 'preview':
          if (action.type === 'back') {
            setStep({ name: 'keep', chosen: step.chosen })
            return true
          }
          return false
        case 'written':
          if (action.type === 'open' || action.type === 'back') {
            onMerged()
            return true
          }
          return false
        case 'failed':
          if (action.type === 'back') {
            onLeave()
            return true
          }
          return false
        default:
          // Reading or writing .mailmap. Leaving now would let the write land
          // with nobody left to read the realm again, so the screen waits.
          if (action.type === 'back') {
            return {
              status:
                'Writing .mailmap — a moment, then the realm is read again',
            }
          }
          return true
      }
    },
    onKey: (key) => {
      if (step.name === 'mark' && key === ' ') {
        const row = list.chosen
        if (row?.kind !== 'warrior')
          return { status: 'Space marks a warrior; Enter takes a suggestion' }
        setMarked((before) => {
          const after = new Set(before)
          if (after.has(row.id)) after.delete(row.id)
          else after.add(row.id)
          return after
        })
        return true
      }
      if (step.name === 'preview' && key === 'w') {
        const { kept, absorbed } = split(step.chosen, step.keep)
        setStep({ ...step, name: 'writing' })
        once(writeMerge(repoPath, kept, absorbed, files), (result) =>
          setStep({ name: 'written', result }),
        )
        return true
      }
      return false
    },
  })

  const firstWarrior = realm.merges.length

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 1 }}>
      <box
        title=" 🤝 Merge warriors who are one person "
        style={{
          border: true,
          borderColor: C.green,
          flexDirection: 'column',
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {step.name === 'mark' && (
          <>
            <text fg={C.gray} style={{ flexShrink: 0 }}>
              Mark every identity that is the same person — even when nothing
              about them looks alike.
            </text>
            <scrollbox
              ref={list.scroll}
              style={{
                flexGrow: 1,
                marginTop: 1,
                scrollbarOptions: { showArrows: true },
              }}
            >
              {rows.map((row, index) => {
                const here = index === list.selected
                const heading =
                  index === 0 && row.kind === 'suggestion'
                    ? 'Suggested, because they look alike — guesses, and wrong often enough to matter:'
                    : index === firstWarrior
                      ? 'Every warrior:'
                      : null
                return (
                  <box
                    key={
                      row.kind === 'warrior'
                        ? `w${row.id}`
                        : `s${row.merge.canonical.email}`
                    }
                    id={list.idOf(index)}
                    style={{ flexDirection: 'column' }}
                  >
                    {heading && (
                      <text
                        fg={C.yellow}
                        attributes={TextAttributes.BOLD}
                        style={{ marginTop: index === 0 ? 0 : 1 }}
                      >
                        {heading}
                      </text>
                    )}
                    <box
                      style={{
                        flexDirection: 'column',
                        backgroundColor: here ? C.selected : undefined,
                      }}
                    >
                      {row.kind === 'suggestion' ? (
                        <>
                          <text
                            wrapMode="none"
                            fg={here ? C.green : C.text}
                          >{`${here ? '› ' : '  '}${row.merge.canonical.name} <${row.merge.canonical.email}>`}</text>
                          {row.merge.absorbed.map((one) => (
                            <text
                              key={one.email}
                              fg={C.gray}
                              wrapMode="none"
                            >{`      ← ${one.email} — ${one.reason}`}</text>
                          ))}
                        </>
                      ) : (
                        <text
                          wrapMode="none"
                          attributes={
                            here ? TextAttributes.BOLD : TextAttributes.NONE
                          }
                        >
                          <span fg={C.green}>{here ? '› ' : '  '}</span>
                          <span fg={marked.has(row.id) ? C.green : C.gray}>
                            {marked.has(row.id) ? '[x] ' : '[ ] '}
                          </span>
                          <span fg={here ? C.green : C.text}>
                            {row.identity.name.slice(0, 25).padEnd(26)}
                          </span>
                          <span fg={C.gray}>
                            {row.identity.email.padEnd(44)}
                          </span>
                          <span fg={C.dim}>{plural(row.lines, 'line')}</span>
                        </text>
                      )}
                    </box>
                  </box>
                )
              })}
            </scrollbox>
            <text
              fg={marks.length >= 2 ? C.green : C.dim}
              style={{ flexShrink: 0 }}
            >
              {marks.length >= 2
                ? `${marks.length} marked · Enter to merge them`
                : 'Mark two or more, then Enter'}
            </text>
          </>
        )}

        {step.name === 'keep' && (
          <>
            <text>Which of them should the merged warrior be shown as?</text>
            {step.chosen.map((one, index) => (
              <text
                key={one.email}
                fg={index === keepAt ? C.green : C.text}
                attributes={
                  index === keepAt ? TextAttributes.BOLD : TextAttributes.NONE
                }
                style={{ marginTop: index === 0 ? 1 : 0 }}
              >
                {`${index === keepAt ? '› ' : '  '}${one.name} <${one.email}>`}
              </text>
            ))}
          </>
        )}

        {step.name === 'proposing' && (
          <text fg={C.gray}>Reading .mailmap…</text>
        )}

        {(step.name === 'preview' || step.name === 'writing') && (
          <>
            <text wrapMode="none">
              <span>{`${step.chosen.length} identities become one warrior, shown as `}</span>
              <span
                fg={C.green}
                attributes={TextAttributes.BOLD}
              >{`${split(step.chosen, step.keep).kept.name} <${split(step.chosen, step.keep).kept.email}>`}</span>
            </text>
            <text style={{ marginTop: 1 }}>
              These lines are added to .mailmap:
            </text>
            {step.lines.map((line) => (
              <text key={line} fg={C.cyan} wrapMode="none">{`  ${line}`}</text>
            ))}
            <text fg={C.gray} style={{ marginTop: 1 }}>
              Git applies .mailmap before LineLord counts a single line, so from
              here on they are one warrior — on these screens, in git log and in
              git shortlog. Nothing already in the file is changed.
            </text>
            <text
              fg={step.name === 'writing' ? C.gray : C.yellow}
              style={{ marginTop: 1 }}
            >
              {step.name === 'writing'
                ? 'Writing…'
                : 'Nothing is written until you press w'}
            </text>
          </>
        )}

        {step.name === 'written' && (
          <>
            {step.result.added.map((line) => (
              <text
                key={line}
                fg={C.green}
                wrapMode="none"
              >{`  + ${line}`}</text>
            ))}
            {step.result.alreadyPresent.map((line) => (
              <text
                key={line}
                fg={C.gray}
                wrapMode="none"
              >{`  = ${line}`}</text>
            ))}
            <text>
              {step.result.added.length === 0
                ? `${step.result.path} already says all of this.`
                : `Wrote ${plural(step.result.added.length, 'line')} to ${step.result.path}.`}
            </text>
            <text
              fg={C.yellow}
              attributes={TextAttributes.BOLD}
              style={{ marginTop: 1 }}
            >
              To change this later, edit that file:
            </text>
            <text fg={C.gray}>
              {' '}
              · each line reads: the name and address shown, then the address it
              replaces
            </text>
            <text fg={C.gray}>
              {' '}
              · to be shown differently, change the first name and address on
              those lines
            </text>
            <text fg={C.gray}>
              {' '}
              · to count them apart again, delete the lines added here
            </text>
            <text fg={C.gray}>
              {' '}
              · it is a file in your repository: commit it, and everyone who
              clones it counts them as one
            </text>
            <text fg={C.gray}>
              LineLord reads .mailmap again on every run, and notices when it
              has changed.
            </text>
          </>
        )}

        {step.name === 'failed' && (
          <>
            <text fg={C.red}>{`Could not merge them: ${step.message}`}</text>
            <text fg={C.gray}>Nothing was merged.</text>
          </>
        )}
      </box>
      <text
        fg={C.dim}
        style={{ flexShrink: 0 }}
      >{`${count(warriors.length)} warriors · ${plural(realm.merges.length, 'suggestion')}`}</text>
    </box>
  )
}
