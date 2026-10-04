import { describe, expect, it } from 'bun:test'
import { type Action, interpret, type Key, type Mode, NORMAL } from '../keymap'

const key = (name: string, extra: Partial<Key> = {}): Key => ({
  name,
  sequence: name.length === 1 ? name : '',
  ...extra,
})
const char = (c: string): Key => ({
  name: c.toLowerCase(),
  sequence: c,
  shift: c !== c.toLowerCase(),
})

/** Press several keys from normal mode; every action, and the mode left. */
function press(...keys: Key[]): { actions: Action[]; mode: Mode } {
  let mode: Mode = NORMAL
  const actions: Action[] = []
  for (const one of keys) {
    const result = interpret(mode, one)
    mode = result.mode
    if (result.action) actions.push(result.action)
  }
  return { actions, mode }
}

describe('moving', () => {
  it('moves with the arrows and with j and k alike', () => {
    expect(press(key('down'), char('j')).actions).toEqual([
      { type: 'move', by: 1 },
      { type: 'move', by: 1 },
    ])
    expect(press(key('up'), char('k')).actions).toEqual([
      { type: 'move', by: -1 },
      { type: 'move', by: -1 },
    ])
  })

  it('pages with PgUp and PgDn, Ctrl-b and Ctrl-f, and half pages with Ctrl-u and Ctrl-d', () => {
    expect(
      press(
        key('pagedown'),
        key('pageup'),
        key('f', { ctrl: true, sequence: '\x06' }),
        key('b', { ctrl: true, sequence: '\x02' }),
        key('d', { ctrl: true, sequence: '\x04' }),
        key('u', { ctrl: true, sequence: '\x15' }),
      ).actions,
    ).toEqual([
      { type: 'page', by: 1 },
      { type: 'page', by: -1 },
      { type: 'page', by: 1 },
      { type: 'page', by: -1 },
      { type: 'halfPage', by: 1 },
      { type: 'halfPage', by: -1 },
    ])
  })

  it('goes to the top with Home or gg, and to the bottom with End or G', () => {
    expect(
      press(key('home'), char('g'), char('g'), key('end'), char('G')).actions,
    ).toEqual([
      { type: 'top' },
      { type: 'top' },
      { type: 'bottom' },
      { type: 'bottom' },
    ])
  })

  it('does nothing with a single g, and lets the next key do its own thing', () => {
    const { actions, mode } = press(char('g'), char('j'))
    expect(actions).toEqual([{ type: 'move', by: 1 }])
    expect(mode).toEqual(NORMAL)
  })

  it('opens with Enter, l or right, and goes back with Esc, h or left', () => {
    expect(press(key('return'), char('l'), key('right')).actions).toEqual([
      { type: 'open' },
      { type: 'open' },
      { type: 'open' },
    ])
    expect(press(key('escape'), char('h'), key('left')).actions).toEqual([
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
    ])
  })

  it('quits with q, and opens the help with ?', () => {
    expect(press(char('q'), char('?')).actions).toEqual([
      { type: 'quit' },
      { type: 'help' },
    ])
  })
})

describe('searching', () => {
  it('searches as it is typed, and settles on Enter', () => {
    const { actions, mode } = press(
      char('/'),
      char('O'),
      char('l'),
      key('return'),
    )
    expect(actions).toEqual([
      { type: 'searchPreview', text: '' },
      { type: 'searchPreview', text: 'O' },
      { type: 'searchPreview', text: 'Ol' },
      { type: 'search', text: 'Ol' },
    ])
    expect(mode).toEqual(NORMAL)
  })

  it('takes j and q as letters while searching, not as commands', () => {
    const { actions } = press(char('/'), char('j'), char('q'))
    expect(actions.at(-1)).toEqual({ type: 'searchPreview', text: 'jq' })
  })

  it('takes back a letter with backspace, and leaves on the last one', () => {
    const { actions, mode } = press(
      char('/'),
      char('a'),
      key('backspace'),
      key('backspace'),
    )
    expect(actions.at(-2)).toEqual({ type: 'searchPreview', text: '' })
    expect(actions.at(-1)).toEqual({ type: 'cancelSearch' })
    expect(mode).toEqual(NORMAL)
  })

  it('gives up with Esc', () => {
    const { actions, mode } = press(char('/'), char('a'), key('escape'))
    expect(actions.at(-1)).toEqual({ type: 'cancelSearch' })
    expect(mode).toEqual(NORMAL)
  })

  it('goes to the next and previous match with n and N', () => {
    expect(press(char('n'), char('N')).actions).toEqual([
      { type: 'nextMatch' },
      { type: 'previousMatch' },
    ])
  })
})

describe('the command line', () => {
  const command = (text: string) =>
    press(char(':'), ...[...text].map(char), key('return')).actions.at(-1)

  it('quits on :q, :q!, :x, :wq and :quit', () => {
    for (const text of ['q', 'q!', 'x', 'wq', 'quit']) {
      expect(command(text)).toEqual({ type: 'quit' })
    }
  })

  it('jumps to a rank with :42', () => {
    expect(command('42')).toEqual({ type: 'jump', to: 42 })
  })

  it('says so when it does not know the command', () => {
    expect(command('conquer')).toEqual({
      type: 'unknownCommand',
      text: 'conquer',
    })
  })

  it('shows what is being typed, and leaves on Esc without doing it', () => {
    const typed = press(char(':'), char('q'))
    expect(typed.mode).toEqual({ kind: 'command', text: 'q' })
    expect(typed.actions).toEqual([])

    const { actions, mode } = press(char(':'), char('q'), key('escape'))
    expect(actions).toEqual([])
    expect(mode).toEqual(NORMAL)
  })
})
