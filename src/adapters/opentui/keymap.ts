/**
 * One keymap for every screen: the arrows, and vim's keys beside them.
 *
 * Pure: a mode and a key in, the next mode and what to do out. The screen
 * decides what "a page" or "the next match" means; this only decides which
 * key asks for it, so every screen answers the same keys the same way.
 */

/** A key as the renderer reports it. */
export type Key = {
  name: string
  ctrl?: boolean
  shift?: boolean
  /** What the key typed, which is how a capital or a symbol is told apart. */
  sequence?: string
}

export type Mode =
  | { kind: 'normal'; pending: '' | 'g' }
  | { kind: 'search'; text: string }
  | { kind: 'command'; text: string }

export const NORMAL: Mode = { kind: 'normal', pending: '' }

export type Action =
  | { type: 'move'; by: 1 | -1 }
  | { type: 'page'; by: 1 | -1 }
  | { type: 'halfPage'; by: 1 | -1 }
  | { type: 'top' }
  | { type: 'bottom' }
  | { type: 'open' }
  | { type: 'back' }
  | { type: 'quit' }
  | { type: 'help' }
  | { type: 'searchPreview'; text: string }
  | { type: 'search'; text: string }
  | { type: 'cancelSearch' }
  | { type: 'nextMatch' }
  | { type: 'previousMatch' }
  | { type: 'jump'; to: number }
  | { type: 'unknownCommand'; text: string }

type Result = { mode: Mode; action: Action | null }

/** The character a key typed, if it typed one. */
function typed(key: Key): string | null {
  if (key.ctrl) return null
  const sequence = key.sequence ?? ''
  return sequence.length === 1 && sequence >= ' ' && sequence !== '\x7f'
    ? sequence
    : null
}

const QUIT = new Set(['q', 'q!', 'x', 'wq', 'quit'])

function command(text: string): Action | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (QUIT.has(trimmed)) return { type: 'quit' }
  if (/^\d+$/.test(trimmed)) return { type: 'jump', to: Number(trimmed) }
  return { type: 'unknownCommand', text: trimmed }
}

/** Typing into the search or the command line. */
function line(
  mode: { kind: 'search' | 'command'; text: string },
  key: Key,
): Result {
  const search = mode.kind === 'search'
  if (key.name === 'escape') {
    return { mode: NORMAL, action: search ? { type: 'cancelSearch' } : null }
  }
  if (key.name === 'return') {
    return {
      mode: NORMAL,
      action: search ? { type: 'search', text: mode.text } : command(mode.text),
    }
  }
  if (key.name === 'backspace') {
    // Like vim: rubbing out the last letter leaves the line.
    if (mode.text === '') {
      return { mode: NORMAL, action: search ? { type: 'cancelSearch' } : null }
    }
    const text = mode.text.slice(0, -1)
    return {
      mode: { kind: mode.kind, text },
      action: search ? { type: 'searchPreview', text } : null,
    }
  }
  const letter = typed(key)
  if (letter === null) return { mode, action: null }
  const text = mode.text + letter
  return {
    mode: { kind: mode.kind, text },
    action: search ? { type: 'searchPreview', text } : null,
  }
}

export function interpret(mode: Mode, key: Key): Result {
  if (mode.kind !== 'normal') return line(mode, key)

  const letter = typed(key)

  // gg: the first g only waits for the second.
  if (mode.pending === 'g') {
    if (letter === 'g') return { mode: NORMAL, action: { type: 'top' } }
    return interpret(NORMAL, key)
  }

  if (key.ctrl) {
    switch (key.name) {
      case 'd':
        return { mode, action: { type: 'halfPage', by: 1 } }
      case 'u':
        return { mode, action: { type: 'halfPage', by: -1 } }
      case 'f':
        return { mode, action: { type: 'page', by: 1 } }
      case 'b':
        return { mode, action: { type: 'page', by: -1 } }
      default:
        return { mode, action: null }
    }
  }

  switch (key.name) {
    case 'down':
      return { mode, action: { type: 'move', by: 1 } }
    case 'up':
      return { mode, action: { type: 'move', by: -1 } }
    case 'pagedown':
      return { mode, action: { type: 'page', by: 1 } }
    case 'pageup':
      return { mode, action: { type: 'page', by: -1 } }
    case 'home':
      return { mode, action: { type: 'top' } }
    case 'end':
      return { mode, action: { type: 'bottom' } }
    case 'return':
    case 'right':
      return { mode, action: { type: 'open' } }
    case 'escape':
    case 'left':
      return { mode, action: { type: 'back' } }
  }

  switch (letter) {
    case 'j':
      return { mode, action: { type: 'move', by: 1 } }
    case 'k':
      return { mode, action: { type: 'move', by: -1 } }
    case 'l':
      return { mode, action: { type: 'open' } }
    case 'h':
      return { mode, action: { type: 'back' } }
    case 'g':
      return { mode: { kind: 'normal', pending: 'g' }, action: null }
    case 'G':
      return { mode, action: { type: 'bottom' } }
    case 'n':
      return { mode, action: { type: 'nextMatch' } }
    case 'N':
      return { mode, action: { type: 'previousMatch' } }
    case 'q':
      return { mode, action: { type: 'quit' } }
    case '?':
      return { mode, action: { type: 'help' } }
    case '/':
      return {
        mode: { kind: 'search', text: '' },
        action: { type: 'searchPreview', text: '' },
      }
    case ':':
      return { mode: { kind: 'command', text: '' }, action: null }
    default:
      return { mode, action: null }
  }
}
