import { basename } from 'node:path'
import { TextAttributes } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useCallback, useRef, useState } from 'react'
import { HONESTY_NOTES } from '../../core/honestyNotes'
import type { LineLordPorts } from '../../core/lineLord'
import type { FileSystemPort } from '../../ports/files'
import {
  type Realm,
  type RealmOptions,
  type RealmState,
  useRealm,
} from './data'
import { interpret, type Mode, NORMAL } from './keymap'
import { ActiveContext, KeysContext, type ScreenKeys } from './keys'
import { pickQuote } from './quotes'
import { About } from './screens/About'
import { Guide } from './screens/Guide'
import { Failed, Loading } from './screens/Loading'
import { Longevity } from './screens/Longevity'
import { Menu, type MenuChoice } from './screens/Menu'
import { Merge } from './screens/Merge'
import { Overview } from './screens/Overview'
import { PathInput } from './screens/PathInput'
import { Rankings } from './screens/Rankings'
import { Warrior } from './screens/Warrior'
import { C } from './theme'

export type Screen =
  | { kind: 'menu' }
  | { kind: 'overview' }
  | { kind: 'rankings' }
  | { kind: 'longevity' }
  | { kind: 'merge'; initiallyMarked?: number }
  | { kind: 'warrior'; authorId: number }
  | { kind: 'about' }
  | { kind: 'guide' }
  | { kind: 'path' }

const TITLES: Record<Screen['kind'], string> = {
  menu: 'THE MAIN HALL',
  overview: 'REPOSITORY OVERVIEW',
  rankings: "GORVEK'S BRUTAL BARBARIAN RANKINGS",
  longevity: 'CODE LONGEVITY',
  merge: 'MERGE WARRIORS',
  warrior: 'ONE WARRIOR',
  about: 'ABOUT',
  guide: "THE WARRIOR'S GUIDE",
  path: 'CHOOSE A REALM',
}

const GLOBAL_KEYS: Array<[string, string]> = [
  ['↑ ↓   k j', 'move one'],
  ['PgUp PgDn   Ctrl-b Ctrl-f', 'a page'],
  ['Ctrl-u Ctrl-d', 'half a page'],
  ['Home End   gg G', 'the first, the last'],
  ['→ l Enter', 'open'],
  ['← h Esc', 'back'],
  ['/ text   n N', 'search, next and previous match'],
  [':42', 'go to the 42nd'],
  [':q  :x  :q!  q', 'leave the realm'],
  ['?', 'this help, and again to close it'],
]

/**
 * LineLord: the repository being read, and the shell that shows it.
 *
 * Reading is here and drawing is in Shell, so the screens can be driven in a
 * test from an analysis built by hand, through the same keys and routing.
 */
export function App({
  ports,
  initialPath,
  options,
  onQuit,
}: {
  /** How the outside world is reached: git, the file system, the store. */
  ports: LineLordPorts
  initialPath: string | null
  options: RealmOptions
  onQuit: () => void
}) {
  const [repoPath, setRepoPath] = useState(initialPath)
  const [generation, setGeneration] = useState(0)
  const realm = useRealm(ports, repoPath, options, generation)
  return (
    <Shell
      realm={realm}
      repoPath={repoPath}
      files={ports.files}
      thresholdKB={options.thresholdBytes / 1024}
      onRepoChosen={setRepoPath}
      onReanalyse={() => setGeneration((at) => at + 1)}
      onQuit={onQuit}
    />
  )
}

export type ShellProps = {
  realm: RealmState
  /** The repository being shown, or null before one is chosen. */
  repoPath: string | null
  /** Where a merge reads and writes .mailmap. */
  files: FileSystemPort
  thresholdKB: number
  /** A different repository was chosen: read it. */
  onRepoChosen: (path: string) => void
  /** .mailmap was written: read the same repository again. */
  onReanalyse: () => void
  onQuit: () => void
  /** Where to start, for a test that wants to begin on a particular screen. */
  initialScreens?: Screen[]
  quotes?: { loading: string; footer: string }
}

/** The frame, the screens, and the keyboard routed between them. */
export function Shell({
  realm,
  repoPath,
  files,
  thresholdKB,
  onRepoChosen,
  onReanalyse,
  onQuit,
  initialScreens,
  quotes: givenQuotes,
}: ShellProps) {
  const { width } = useTerminalDimensions()
  const [stack, setStack] = useState<Screen[]>(
    initialScreens ?? (repoPath ? [{ kind: 'menu' }] : [{ kind: 'path' }]),
  )
  const [mode, setMode] = useState<Mode>(NORMAL)
  const [status, setStatus] = useState('')
  const [help, setHelp] = useState(false)
  const [quotes] = useState(
    () =>
      givenQuotes ?? {
        loading: pickQuote('initializing'),
        footer: pickQuote('complete'),
      },
  )

  // The screen on top says how it answers the keyboard, on every render.
  const keys = useRef<ScreenKeys>({ hint: '' })
  // The frame draws before the screen inside it registers, so the hint the
  // footer shows is kept as state and set once the screen has said it.
  const [hint, setHint] = useState('')
  const register = useCallback((screen: ScreenKeys) => {
    keys.current = screen
    queueMicrotask(() => setHint(screen.hint))
  }, [])
  const modeRef = useRef(mode)
  modeRef.current = mode

  const top = stack.at(-1) ?? { kind: 'menu' }
  const push = (screen: Screen) => setStack((at) => [...at, screen])
  const pop = () => setStack((at) => (at.length > 1 ? at.slice(0, -1) : at))

  // The path screen and the loading screens are in front of whatever is on the stack.
  const front: 'path' | 'loading' | 'failed' | 'screen' =
    top.kind === 'path' || !repoPath
      ? 'path'
      : realm.status === 'loading'
        ? 'loading'
        : realm.status === 'failed'
          ? 'failed'
          : 'screen'

  useKeyboard((key) => {
    setStatus('')
    const screen = keys.current
    if (screen.raw && !help) {
      screen.raw({
        name: key.name,
        ctrl: key.ctrl,
        sequence: key.sequence ?? '',
      })
      return
    }
    const before = modeRef.current
    const result = interpret(before, {
      name: key.name,
      ctrl: key.ctrl,
      shift: key.shift,
      sequence: key.sequence,
    })
    modeRef.current = result.mode
    setMode(result.mode)
    const action = result.action

    if (!action) {
      // A character the keymap leaves alone goes to the screen: space, digits, w, o, m.
      const typed = key.name === 'space' ? ' ' : (key.sequence ?? '')
      if (
        before.kind === 'normal' &&
        result.mode.kind === 'normal' &&
        typed.length === 1 &&
        !key.ctrl &&
        !help
      ) {
        const handled = screen.onKey?.(typed)
        if (handled && typeof handled === 'object') setStatus(handled.status)
      }
      return
    }
    if (action.type === 'quit') return onQuit()
    if (action.type === 'help') return setHelp((on) => !on)
    if (help) {
      if (action.type === 'back' || action.type === 'open') setHelp(false)
      return
    }
    if (
      front === 'failed' &&
      (action.type === 'open' || action.type === 'back')
    ) {
      setStack((at) => [...at, { kind: 'path' }])
      return
    }
    if (action.type === 'unknownCommand') {
      setStatus(
        `Not a command: ${action.text} — :q leaves, :42 goes to the 42nd`,
      )
      return
    }
    const handled = screen.onAction?.(action) ?? false
    if (handled && typeof handled === 'object') setStatus(handled.status)
    else if (!handled && action.type === 'back') {
      if (stack.length > 1) pop()
      else setStatus('This is the main hall — q or :q leaves the realm')
    }
  })

  const choose = (choice: MenuChoice) => {
    if (choice === 'exit') return onQuit()
    push({ kind: choice === 'path' ? 'path' : choice } as Screen)
  }

  const body = () => {
    if (front === 'path') {
      return (
        <PathInput
          canCancel={repoPath !== null}
          onSubmit={(path) => {
            onRepoChosen(path)
            setStack([{ kind: 'menu' }])
          }}
          onCancel={() => (repoPath ? pop() : onQuit())}
        />
      )
    }
    if (realm.status === 'loading')
      return (
        <Loading
          fraction={realm.fraction}
          message={realm.message}
          quote={quotes.loading}
          walkingHistory={realm.walkingHistory}
        />
      )
    if (realm.status === 'failed') return <Failed error={realm.error} />
    const r = realm.realm
    // Every screen on the stack stays mounted; only the top one shows and listens.
    return stack.map((screen, index) => {
      const onTop = index === stack.length - 1
      return (
        <box
          key={`${index}:${screen.kind}:${screen.kind === 'warrior' ? screen.authorId : ''}`}
          style={{ flexDirection: 'column', flexGrow: 1 }}
          visible={onTop}
        >
          <ActiveContext.Provider value={onTop && !help}>
            {screenFor(screen, r)}
          </ActiveContext.Provider>
        </box>
      )
    })
  }

  const screenFor = (screen: Screen, r: Realm) => {
    switch (screen.kind) {
      case 'overview':
        return (
          <Overview
            realm={r}
            thresholdKB={thresholdKB}
            onOpen={(authorId) => push({ kind: 'warrior', authorId })}
            onMerge={(authorId) =>
              push({ kind: 'merge', initiallyMarked: authorId })
            }
          />
        )
      case 'rankings':
        return (
          <Rankings
            realm={r}
            onOpen={(authorId) => push({ kind: 'warrior', authorId })}
          />
        )
      case 'longevity':
        return (
          <Longevity
            realm={r}
            onOpen={(authorId) => push({ kind: 'warrior', authorId })}
          />
        )
      case 'warrior':
        return <Warrior realm={r} authorId={screen.authorId} />
      case 'merge':
        return (
          <Merge
            realm={r}
            repoPath={repoPath ?? ''}
            files={files}
            initiallyMarked={screen.initiallyMarked}
            onLeave={pop}
            onMerged={() => {
              // .mailmap changed under every number: read the realm again, and show the table it changed.
              setStack([{ kind: 'menu' }, { kind: 'overview' }])
              onReanalyse()
            }}
          />
        )
      case 'about':
        return <About />
      case 'guide':
        return <Guide />
      default:
        return <Menu realm={r} onChoose={choose} />
    }
  }

  const screenKeys = keys.current
  const head =
    realm.status === 'ready' ? realm.realm.context.headSha?.slice(0, 7) : null

  return (
    <KeysContext.Provider value={register}>
      <box style={{ flexDirection: 'column', width: '100%', height: '100%' }}>
        {/* The banner strip. */}
        <box
          style={{
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: C.strip,
            height: 1,
            flexShrink: 0,
          }}
        >
          <text
            fg={C.green}
            attributes={TextAttributes.BOLD}
            wrapMode="none"
            style={{ flexShrink: 0 }}
          >
            🪓 LINELORD
          </text>
          <text fg={C.gray} wrapMode="none" style={{ flexShrink: 0 }}>
            {'  ·  '}
          </text>
          <text
            fg={C.cyan}
            attributes={TextAttributes.BOLD}
            wrapMode="none"
            style={{ flexShrink: 0 }}
          >
            {help
              ? 'HELP'
              : front === 'screen'
                ? TITLES[top.kind]
                : front === 'path'
                  ? TITLES.path
                  : front === 'loading'
                    ? 'READING THE REALM'
                    : 'NO REALM'}
          </text>
          <box style={{ flexGrow: 1, minWidth: 2 }} />
          <text fg={C.gray} wrapMode="none">
            {repoPath
              ? `🏰 ${basename(repoPath)}${head ? ` @ ${head}` : ''}`
              : ''}
          </text>
        </box>

        <box style={{ flexDirection: 'column', flexGrow: 1 }} visible={!help}>
          {body()}
        </box>

        {help && (
          <box
            style={{
              flexDirection: width >= 130 ? 'row' : 'column',
              flexGrow: 1,
              gap: 1,
              padding: 1,
            }}
          >
            <box
              title=" 📖 Keys, on every screen "
              style={{
                border: true,
                borderColor: C.cyan,
                flexDirection: 'column',
                paddingLeft: 1,
                paddingRight: 1,
                width: width >= 130 ? 64 : '100%',
                flexShrink: 0,
              }}
            >
              {[...GLOBAL_KEYS, ...(screenKeys.keys ?? [])].map(
                ([which, what]) => (
                  <text key={which + what} wrapMode="none">
                    <span fg={C.cyan}>{which.padEnd(28)}</span>
                    <span fg={C.gray}>{what}</span>
                  </text>
                ),
              )}
            </box>
            <box
              title=" 📜 What this screen's numbers mean "
              style={{
                border: true,
                borderColor: C.gray,
                flexDirection: 'column',
                paddingLeft: 1,
                paddingRight: 1,
                flexGrow: 1,
              }}
            >
              <scrollbox style={{ flexGrow: 1 }}>
                {(
                  screenKeys.legend ?? [
                    [
                      '',
                      'Every number counts lines still alive in HEAD — not commits, and not hours worked.',
                    ],
                  ]
                ).map(([term, meaning], index) => (
                  // Two columns, so a long meaning wraps under itself rather than under the term.
                  <box
                    key={`${index}${term}`}
                    style={{
                      flexDirection: 'row',
                      flexShrink: 0,
                      paddingRight: 3,
                    }}
                  >
                    <text fg={C.text} style={{ width: 13, flexShrink: 0 }}>
                      {term}
                    </text>
                    <text fg={C.gray} style={{ flexGrow: 1, flexShrink: 1 }}>
                      {meaning}
                    </text>
                  </box>
                ))}
                <text fg={C.yellow} style={{ marginTop: 1 }}>
                  {HONESTY_NOTES.rankings.heading}
                </text>
                <text fg={C.gray}>
                  {' '}
                  This is a joke about conquest. It does not measure anyone's
                  productivity.
                </text>
              </scrollbox>
            </box>
          </box>
        )}

        {/* The command line, as vim's: the keys, a prompt, or what went wrong -- and a quote. */}
        <box
          style={{
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: C.strip,
            height: 1,
            flexShrink: 0,
          }}
        >
          {mode.kind === 'search' ? (
            <text fg={C.yellow} wrapMode="none">{`/${mode.text}█`}</text>
          ) : mode.kind === 'command' ? (
            <text fg={C.cyan} wrapMode="none">{`:${mode.text}█`}</text>
          ) : status ? (
            <text fg={C.red} wrapMode="none">
              {status}
            </text>
          ) : (
            <text fg={C.gray} wrapMode="none">
              {help ? '? or Esc closes the help' : hint}
            </text>
          )}
          <box style={{ flexGrow: 1, minWidth: 2 }} />
          <text fg={C.dim} attributes={TextAttributes.ITALIC} wrapMode="none">
            {width >= 160 ? `“${quotes.footer}”` : ''}
          </text>
        </box>
      </box>
    </KeysContext.Provider>
  )
}
