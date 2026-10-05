import { testRender } from '@opentui/react/test-utils'
import { act, type ReactNode } from 'react'
import { analysis, author, file, lines } from '../../../core/__test__/fixtures'
import type { IdentityMerge } from '../../../core/identity'
import type { HistoryReading } from '../../../core/longevity'
import type { FileSystemPort } from '../../../ports/files'
import { Shell, type ShellProps } from '../App'
import { type Realm, type RealmParts, realmOf } from '../data'

/**
 * A realm built by hand, and the shell driven through it with real keys.
 *
 * The screens are tested against an analysis whose numbers are known rather
 * than a repository: what is under test is what they show and how the keys
 * move through them. The arithmetic has its own tests in the core.
 */

export const NOW = new Date('2025-09-01T00:00:00Z')
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
export const ANCIENT = seconds('2020-01-15T10:00:00.000Z')
export const RECENT = seconds('2025-06-01T10:00:00.000Z')

export const GORVEK = {
  id: 1,
  name: 'Gorvek of Bonereach',
  email: 'gorvek@bonereach.realm',
}
export const SARN = {
  id: 2,
  name: 'Sarn the Faceless',
  email: 'sarn@kell.realm',
}
export const DRUSK = {
  id: 3,
  name: 'Captain Drusk',
  email: 'drusk@greycloaks.realm',
}
export const RUUN = { id: 4, name: 'Brother Ruun', email: 'ruun@thurn.realm' }

/**
 *   src/hall.ts        6 ancient Gorvek lines
 *   src/legacy/old.ts  3 ancient Gorvek lines + 1 recent Sarn line
 *   src/kell.ts        4 recent Sarn lines
 *   src/greycloak.js   2 recent Drusk lines
 *   README.md          1 recent Ruun line
 *
 * 17 lines: Gorvek 9, Sarn 5, Drusk 2, Ruun 1.
 */
export const REALM_ANALYSIS = analysis({
  authors: [
    author(GORVEK.id, {
      name: GORVEK.name,
      email: GORVEK.email,
      title: 'legend',
      rank: 1,
      percentage: 52.94,
    }),
    author(SARN.id, {
      name: SARN.name,
      email: SARN.email,
      title: 'warlord',
      rank: 2,
      percentage: 29.41,
    }),
    author(DRUSK.id, {
      name: DRUSK.name,
      email: DRUSK.email,
      title: 'squire',
      rank: 3,
      percentage: 11.76,
    }),
    author(RUUN.id, {
      name: RUUN.name,
      email: RUUN.email,
      title: 'peasant',
      rank: 4,
      percentage: 5.88,
    }),
  ],
  files: [
    file(1, 'src/hall.ts', { totalLines: 6 }),
    file(2, 'src/legacy/old.ts', { totalLines: 4 }),
    file(3, 'src/kell.ts', { totalLines: 4 }),
    file(4, 'src/greycloak.js', { totalLines: 2 }),
    file(5, 'README.md', { totalLines: 1 }),
    file(6, 'logo.png', { isBinary: true }),
  ],
  lines: lines(
    { fileId: 1, authorId: GORVEK.id, timestamps: Array(6).fill(ANCIENT) },
    { fileId: 2, authorId: GORVEK.id, timestamps: Array(3).fill(ANCIENT) },
    { fileId: 2, authorId: SARN.id, timestamps: [RECENT] },
    { fileId: 3, authorId: SARN.id, timestamps: Array(4).fill(RECENT) },
    { fileId: 4, authorId: DRUSK.id, timestamps: [RECENT, RECENT] },
    { fileId: 5, authorId: RUUN.id, timestamps: [RECENT] },
  ),
})

export const NO_HISTORY: HistoryReading = {
  history: { snapshots: [], cohortLines: [] },
  describes: null,
}

export const SUGGESTION: IdentityMerge = {
  canonical: { name: GORVEK.name, email: GORVEK.email },
  absorbed: [
    {
      name: 'Gorvek',
      email: 'gorvek@privat.realm',
      reason: 'the names "gorvek of bonereach" and "gorvek" are alike',
    },
  ],
}

export function fixtureRealm(overrides: Partial<RealmParts> = {}): Realm {
  return realmOf({
    analysis: REALM_ANALYSIS,
    context: {
      headSha: 'abc1234def5678',
      uncommittedFileCount: 0,
      ignoredRevisionCount: 0,
      ignoreRevSources: { file: false, flag: false },
      unresolvedIgnoreRevs: [],
    },
    failures: [],
    historyFailures: [],
    cache: { mode: 'reused', filesBlamed: 0, filesReused: 5 },
    merges: [],
    history: NO_HISTORY,
    measuredAt: NOW,
    ...overrides,
  })
}

/** A file system that remembers what was written, for the merge. */
export function memoryFiles(
  initial: Record<string, string> = {},
): FileSystemPort & { files: Record<string, string> } {
  const files = { ...initial }
  return {
    files,
    readText: async (path) => files[path] ?? null,
    appendText: async (path, text) => {
      files[path] = (files[path] ?? '') + text
    },
  }
}

/** Named keys, and any single character as itself. */
const NAMED: Record<
  string,
  Parameters<Awaited<ReturnType<typeof testRender>>['mockInput']['pressKey']>[0]
> = {
  down: 'ARROW_DOWN',
  up: 'ARROW_UP',
  left: 'ARROW_LEFT',
  right: 'ARROW_RIGHT',
  enter: 'RETURN',
  esc: 'ESCAPE',
  home: 'HOME',
  end: 'END',
  backspace: 'BACKSPACE',
  pgdn: '\x1b[6~',
  pgup: '\x1b[5~',
}

export type Driven = {
  frame: () => string
  /** Press keys one at a time: a name from the list above, `ctrl-d`, or a character. */
  press: (...keys: string[]) => Promise<void>
  type: (text: string) => Promise<void>
  /** Paste, as a terminal does with bracketed paste. */
  paste: (text: string) => Promise<void>
  resize: (width: number, height: number) => Promise<void>
  done: () => void
}

/** Something drawn in a test terminal, with keys to press. */
export async function drive(
  node: ReactNode,
  size: { width?: number; height?: number } = {},
): Promise<Driven> {
  const setup = await testRender(node, {
    width: size.width ?? 120,
    height: size.height ?? 40,
  })
  // React commits inside act; the frame is drawn after it, from what was committed.
  const settle = async (wait = 5) => {
    for (let pass = 0; pass < 3; pass++) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, wait))
      })
      await setup.renderOnce()
    }
  }
  await settle()
  return {
    frame: () => setup.captureCharFrame(),
    press: async (...keys) => {
      for (const key of keys) {
        if (key.startsWith('ctrl-'))
          setup.mockInput.pressKey(key.slice(5), { ctrl: true })
        else setup.mockInput.pressKey(NAMED[key] ?? key)
        // A lone Escape is held for 20 ms in case it starts a longer sequence.
        await settle(key === 'esc' ? 25 : 5)
      }
    },
    type: async (text) => {
      for (const char of text) {
        setup.mockInput.pressKey(char)
        await settle()
      }
    },
    paste: async (text) => {
      await setup.mockInput.pasteBracketedText(text)
      await settle()
    },
    resize: async (width, height) => {
      setup.resize(width, height)
      await settle()
    },
    done: () => setup.renderer.destroy(),
  }
}

/** The shell over the fixture realm, starting wherever the test says. */
export async function shell(
  props: Partial<ShellProps> = {},
  size: { width?: number; height?: number } = {},
): Promise<
  Driven & { quits: () => number; reread: () => number; chosen: () => string[] }
> {
  let quits = 0
  let reread = 0
  const chosen: string[] = []
  const driven = await drive(
    <Shell
      realm={{ status: 'ready', realm: fixtureRealm() }}
      repoPath="/realm/bonereach"
      files={memoryFiles()}
      thresholdKB={50}
      onRepoChosen={(path) => chosen.push(path)}
      onReanalyse={() => {
        reread += 1
      }}
      onQuit={() => {
        quits += 1
      }}
      quotes={{
        loading: 'Forging the blade of analysis...',
        footer: 'The quest for knowledge reaches its end!',
      }}
      {...props}
    />,
    size,
  )
  return {
    ...driven,
    quits: () => quits,
    reread: () => reread,
    chosen: () => chosen,
  }
}
