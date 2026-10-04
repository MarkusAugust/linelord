import { createContext, useContext } from 'react'
import type { Action } from './keymap'

/** What a screen did with a key: nothing, something, or something worth saying. */
export type Handled = boolean | { status: string }

/** A key the renderer reports, for a screen that takes text as typed. */
export type RawKey = { name: string; ctrl: boolean; sequence: string }

/** How a screen answers the keyboard, and what the frame says about it. */
export type ScreenKeys = {
  /** The shared keymap's verdict on a key. Unhandled `back` returns to the screen before. */
  onAction?: (action: Action) => Handled
  /** A character the keymap leaves alone: space, digits, and screen keys like w or o. */
  onKey?: (key: string) => Handled
  /** Every key as typed, keymap bypassed. For text entry. */
  raw?: (key: RawKey) => void
  /** The keys line in the footer. */
  hint: string
  /** This screen's own keys, for the help. */
  keys?: Array<[string, string]>
  /** What this screen's terms mean, for the help. */
  legend?: Array<[string, string]>
}

export const KeysContext = createContext<(keys: ScreenKeys) => void>(() => {})

/**
 * Whether this screen is the one on top. The screens under it stay mounted,
 * hidden, so coming back finds the selection, the search and the scroll as
 * they were -- but only the one on top may answer the keyboard, or a hidden
 * screen that happens to draw again would take it.
 */
export const ActiveContext = createContext(true)

/** Tell the frame how this screen answers the keyboard. Called on every render. */
export function useScreenKeys(keys: ScreenKeys): void {
  const register = useContext(KeysContext)
  const active = useContext(ActiveContext)
  if (active) register(keys)
}
