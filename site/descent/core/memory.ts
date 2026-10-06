/**
 * What the descent remembers between runs, written against a port so that the
 * rules never touch the browser: the names learned, the ledger of every run,
 * the warrior who became one of the Unasked, who holds what in Kell, and the
 * run in progress.
 *
 * A store may refuse (a private window, storage switched off). Every read
 * then comes back empty and every write is dropped, and the game plays the
 * same, without a memory.
 */
import { firstWorld, HOLD_TITLES, isWorld, settle, type World } from './holds'
import { makeRng } from './rng'
import type { Bones, Ending, Game } from './types'

export interface Store {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  remove: (key: string) => void
}

const KEYS = {
  known: 'descent.known',
  ledger: 'descent.ledger',
  bones: 'descent.bones',
  world: 'descent.world',
  run: 'descent.run',
} as const

export const LEDGER_SIZE = 20

/** One line in the ledger: who held what depth, and for how long. */
export interface LedgerLine {
  name: string
  bg: string
  /** The holds the run took, as the ledger titles them; empty if none. */
  title: string
  depth: number
  turns: number
  ending: Ending
  cause: string
  /** ISO date. */
  date: string
}

function read<T>(
  store: Store,
  key: string,
  fallback: T,
  valid: (v: unknown) => v is T,
): T {
  try {
    const raw = store.get(key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return valid(value) ? value : fallback
  } catch {
    // Unreadable or refused: there is nothing to remember, and nothing is
    // counted from it, so an empty memory is the honest answer.
    return fallback
  }
}

function write(store: Store, key: string, value: unknown): void {
  try {
    store.set(key, JSON.stringify(value))
  } catch {
    // A store that refuses a write leaves the game without a memory; the run
    // itself is unaffected.
  }
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string')

const isLedger = (v: unknown): v is LedgerLine[] =>
  Array.isArray(v) &&
  v.every(
    (l) =>
      typeof l === 'object' &&
      l !== null &&
      typeof (l as LedgerLine).name === 'string' &&
      typeof (l as LedgerLine).depth === 'number',
  )

const isBones = (v: unknown): v is Bones =>
  typeof v === 'object' && v !== null && typeof (v as Bones).name === 'string'

const isGame = (v: unknown): v is Game =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Game).seed === 'number' &&
  typeof (v as Game).player === 'object' &&
  typeof (v as Game).level === 'object'

export const loadKnown = (store: Store): string[] =>
  read(store, KEYS.known, [], isStrings)
export const loadLedger = (store: Store): LedgerLine[] =>
  read(store, KEYS.ledger, [], isLedger)
export const loadBones = (store: Store): Bones | null =>
  read<Bones | null>(
    store,
    KEYS.bones,
    null,
    (v): v is Bones | null => v === null || isBones(v),
  )
/** Who holds what in Kell: the old holders, until anyone has gone down. */
export const loadWorld = (store: Store): World =>
  read(store, KEYS.world, firstWorld(), isWorld)
export const loadRun = (store: Store): Game | null =>
  read<Game | null>(
    store,
    KEYS.run,
    null,
    (v): v is Game | null => v === null || isGame(v),
  )

/** Keep the run, and what has been learned in it. */
export function saveRun(store: Store, game: Game): void {
  write(store, KEYS.run, game)
  write(store, KEYS.known, game.known)
}

/** Once a warrior has been met, they are not met again. */
export function takeBones(store: Store): Bones | null {
  const bones = loadBones(store)
  if (bones) {
    try {
      store.remove(KEYS.bones)
    } catch {
      // The same warrior may come back next run as well; no harm in that.
    }
  }
  return bones
}

export function ledgerLine(game: Game, date: Date): LedgerLine {
  const p = game.player
  return {
    name: p.name,
    bg: p.bg,
    title: (game.taken ?? []).map((t) => HOLD_TITLES[t]).join(' and '),
    depth: p.deepest,
    turns: game.turn,
    ending: game.over?.ending ?? 'dead',
    cause: game.over?.cause ?? '',
    date: date.toISOString().slice(0, 10),
  }
}

/**
 * Write a finished run into the ledger, newest first, and put away what it
 * leaves behind: the run itself is gone, the names stay, a warrior who became
 * one of the Unasked waits in the Lowstreets for the next, and the holds the
 * run took are written into the world at the low water after it, which may
 * give others back to the ones they were taken from. `news` says who did.
 */
export function endRun(
  store: Store,
  game: Game,
  date: Date,
): { ledger: LedgerLine[]; news: string[] } {
  const line = ledgerLine(game, date)
  const ledger = [line, ...loadLedger(store)].slice(0, LEDGER_SIZE)
  write(store, KEYS.ledger, ledger)
  write(store, KEYS.known, game.known)
  const { world, news } = settle(
    loadWorld(store),
    game.taken ?? [],
    game.player.name,
    makeRng(game.seed),
  )
  write(store, KEYS.world, world)
  if (game.over?.ending === 'unasked')
    write(store, KEYS.bones, {
      name: game.player.name,
      weapon: game.player.weapon,
    })
  try {
    store.remove(KEYS.run)
  } catch {
    // A run that cannot be cleared is offered again as "continue"; it is
    // already over, so continuing it shows the ending and nothing else.
  }
  return { ledger, news }
}

/** A ledger line as the ledger itself would write it. */
export function describe(line: LedgerLine): string {
  const how =
    line.ending === 'escaped'
      ? 'came up through the roof with the ledger'
      : line.ending === 'unasked'
        ? 'became one of the Unasked'
        : line.cause
            .replace(/ at depth \d+$/, '')
            .replace(/^(killed|hanged)/, 'was $1')
  const title = line.title ? `, ${line.title}` : ''
  return `${line.name}${title}, held depth ${line.depth} for ${line.turns} turns, and ${how}.`
}
