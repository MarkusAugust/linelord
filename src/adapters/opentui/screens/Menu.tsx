import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import type { Realm } from '../data'
import { useScreenKeys } from '../keys'
import { useList } from '../list'
import { bannerAsciiLarge, bannerAsciiSmall } from '../resources/asciiArt'
import { C, plural } from '../theme'

export type MenuChoice =
  | 'overview'
  | 'rankings'
  | 'longevity'
  | 'merge'
  | 'guide'
  | 'path'
  | 'about'
  | 'exit'

const CHOICES: Array<{
  value: MenuChoice
  icon: string
  label: string
  about: string
}> = [
  {
    value: 'overview',
    icon: '🏰',
    label: 'Repository Overview',
    about: 'who holds how much of the realm',
  },
  {
    value: 'rankings',
    icon: '🪓',
    label: 'Brutal Barbarian Rankings',
    about: "Gorvek's measure of every warrior",
  },
  {
    value: 'longevity',
    icon: '⏳',
    label: 'Code Longevity',
    about: 'how old the code still standing is',
  },
  {
    value: 'merge',
    icon: '🤝',
    label: 'Merge warriors who are one person',
    about: 'write it to .mailmap',
  },
  {
    value: 'guide',
    icon: '📖',
    label: "The Warrior's Guide",
    about: 'how to use it, and what .mailmap does',
  },
  {
    value: 'path',
    icon: '🧭',
    label: 'Change Repository',
    about: 'march on another realm',
  },
  {
    value: 'about',
    icon: '📜',
    label: 'About',
    about: 'Gorvek explains himself',
  },
  { value: 'exit', icon: '🚪', label: 'Exit', about: 'leave the realm' },
]

/** The first three, and how many more there are, so a long list says it is long. */
function firstThree<T>(items: T[], line: (item: T) => string): string[] {
  return [
    ...items.slice(0, 3).map(line),
    ...(items.length > 3 ? [`  … and ${items.length - 3} more`] : []),
  ]
}

/** Where the commits being looked past were named; both at once is ordinary. */
function namedBy(sources: { file: boolean; flag: boolean }): string {
  if (sources.file && sources.flag) {
    return 'named in .git-blame-ignore-revs and with --ignore-rev'
  }
  return sources.file
    ? 'named in .git-blame-ignore-revs'
    : 'named with --ignore-rev'
}

/** Where the numbers came from, and what is missing from them. */
function tidings(
  realm: Realm,
): Array<{ tone: 'note' | 'warn'; lines: string[] }> {
  const out: Array<{ tone: 'note' | 'warn'; lines: string[] }> = []
  const { context, cache, merges, failures, historyFailures } = realm

  if (context.headSha) {
    out.push({
      tone: 'note',
      lines: [
        `Analysing HEAD ${context.headSha.slice(0, 7)}`,
        ...(context.uncommittedFileCount > 0
          ? [
              `${plural(context.uncommittedFileCount, 'file')} with uncommitted changes, not counted`,
            ]
          : []),
      ],
    })
  }
  if (cache.mode !== 'disabled') {
    out.push({
      tone: 'note',
      lines: [
        cache.mode === 'reused'
          ? `Reused the stored analysis of ${plural(cache.filesReused, 'file')}`
          : cache.mode === 'incremental'
            ? `Re-read ${plural(cache.filesBlamed, 'changed file')}, reused ${cache.filesReused}`
            : cache.reason
              ? `Analysed everything again: ${cache.reason}`
              : `Analysed ${plural(cache.filesBlamed, 'file')}`,
      ],
    })
  }
  if (context.ignoredRevisionCount > 0) {
    out.push({
      tone: 'note',
      lines: [
        `Looking past ${plural(context.ignoredRevisionCount, 'commit')} ${namedBy(context.ignoreRevSources)}; their lines go to whoever wrote them`,
      ],
    })
  }
  if (context.unresolvedIgnoreRevs.length > 0) {
    out.push({
      tone: 'warn',
      lines: [
        context.unresolvedIgnoreRevs.length === 1
          ? '⚠ 1 ignore entry names no commit here and was left out'
          : `⚠ ${plural(context.unresolvedIgnoreRevs.length, 'ignore entry', 'ignore entries')} name no commit here and were left out`,
        // Each entry says where it was named: the file to fix, or the flag.
        ...firstThree(
          context.unresolvedIgnoreRevs,
          (one) =>
            `  ${one.entry} — ${one.source === 'file' ? 'in .git-blame-ignore-revs' : 'given with --ignore-rev'}`,
        ),
      ],
    })
  }
  if (merges.length > 0) {
    out.push({
      tone: 'warn',
      lines: [
        `⚠ ${plural(merges.length, 'warrior')} may have committed under more than one address:`,
        ...merges
          .slice(0, 3)
          .flatMap((merge) => [
            `  ${merge.canonical.name} <${merge.canonical.email}>`,
            ...merge.absorbed.map(
              (one) => `    ← ${one.email} — ${one.reason}`,
            ),
          ]),
        ...(merges.length > 3 ? [`  … and ${merges.length - 3} more`] : []),
        'Nothing was merged. Pick 🤝 Merge to take the ones that are right.',
      ],
    })
  }
  if (historyFailures.length > 0) {
    out.push({
      tone: 'warn',
      lines: [
        `⚠ The history could not read ${plural(historyFailures.length, 'file')}; those snapshots count fewer lines:`,
        ...firstThree(
          historyFailures,
          (one) =>
            `  ${one.path} at ${one.revision.slice(0, 7)} — ${one.error.split('\n')[0]}`,
        ),
      ],
    })
  }
  if (failures.length > 0) {
    out.push({
      tone: 'warn',
      lines: [
        `⚠ ${plural(failures.length, 'file')} could not be analysed and ${failures.length === 1 ? 'is' : 'are'} missing from every number:`,
        ...firstThree(
          failures,
          (one) => `  ${one.path} — ${one.error.split('\n')[0]}`,
        ),
      ],
    })
  }
  return out
}

export function Menu({
  realm,
  onChoose,
}: {
  realm: Realm
  onChoose: (choice: MenuChoice) => void
}) {
  const { width, height } = useTerminalDimensions()
  const list = useList(CHOICES, (one) => one.label)
  const banner =
    height >= 34 && width >= 70 ? bannerAsciiLarge : bannerAsciiSmall
  const news = tidings(realm)
  const wide = width >= 120

  useScreenKeys({
    hint: '↑↓ jk choose · → l Enter open · 1–8 open directly · ? help · :q quit',
    keys: [['1–8', 'open that entry directly']],
    onAction: (action) => {
      if (action.type === 'open') {
        if (list.chosen) onChoose(list.chosen.value)
        return true
      }
      if (action.type === 'back')
        return { status: 'This is the main menu — q or :q leaves the realm' }
      return list.act(action)
    },
    onKey: (key) => {
      const at = Number(key)
      const choice = CHOICES[at - 1]
      if (Number.isInteger(at) && choice) {
        list.setSelected(at - 1)
        onChoose(choice.value)
        return true
      }
      return false
    },
  })

  return (
    <box
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
      }}
    >
      <box
        style={{ flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}
      >
        {banner.map((line) => (
          <text key={line} fg={C.green} wrapMode="none">
            {line}
          </text>
        ))}
        <text fg={C.yellow} attributes={TextAttributes.ITALIC}>
          Your code, your glory!
        </text>
      </box>

      <box
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: wide ? 2 : 0,
          marginTop: 1,
          flexGrow: 1,
        }}
      >
        <box
          title=" Choose your battle "
          style={{
            border: true,
            borderColor: C.green,
            flexDirection: 'column',
            paddingLeft: 1,
            paddingRight: 1,
            width: wide ? 64 : '100%',
            flexShrink: 0,
          }}
        >
          {CHOICES.map((choice, index) => {
            const here = index === list.selected
            return (
              <box
                key={choice.value}
                id={list.idOf(index)}
                style={{ backgroundColor: here ? C.selected : undefined }}
              >
                <text
                  wrapMode="none"
                  attributes={here ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  <span fg={C.green}>{here ? '› ' : '  '}</span>
                  <span fg={C.gray}>{`${index + 1}  `}</span>
                  <span>{`${choice.icon} `}</span>
                  <span fg={here ? C.green : C.text}>
                    {choice.label.padEnd(36)}
                  </span>
                </text>
              </box>
            )
          })}
          <text
            fg={C.dim}
            wrapMode="none"
          >{`        ${CHOICES[list.selected]?.about ?? ''}`}</text>
        </box>

        {news.length > 0 && (
          <box
            title=" Tidings from the realm "
            style={{
              border: true,
              borderColor: C.gray,
              flexDirection: 'column',
              paddingLeft: 1,
              paddingRight: 1,
              flexGrow: 1,
              minHeight: 4,
            }}
          >
            <scrollbox style={{ flexGrow: 1 }}>
              {news.map((one, index) => (
                <box
                  key={one.lines[0] ?? index}
                  style={{ flexDirection: 'column', marginBottom: 1 }}
                >
                  {one.lines.map((line, at) => (
                    <text
                      key={`${at}${line}`}
                      fg={
                        one.tone === 'warn'
                          ? at === 0
                            ? C.yellow
                            : C.gray
                          : C.gray
                      }
                    >
                      {line}
                    </text>
                  ))}
                </box>
              ))}
            </scrollbox>
          </box>
        )}
      </box>
    </box>
  )
}
