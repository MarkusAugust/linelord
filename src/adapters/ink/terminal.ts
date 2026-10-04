/** Erase the screen and the scrollback, and put the cursor at the top. */
const CLEAR_TERMINAL = '\u001B[2J\u001B[3J\u001B[H'

/** The part of a mounted Ink instance this needs. */
type InkInstance = { clear: () => void }

/**
 * Wiping the terminal between screens, without Ink losing track of it.
 *
 * Ink remembers the last frame it wrote and writes nothing when the next one
 * is the same. A frame taller than the terminal, though, it draws by clearing
 * the terminal itself, and that record is left as it was. Coming back from
 * the overview to the menu -- which fits -- then looked to Ink like no change
 * at all: the screen was wiped, nothing was drawn, and it stayed blank until a
 * key changed the menu. Clearing through Ink first makes it forget the frame,
 * so whatever comes next is drawn.
 *
 * The instance exists only once the app is rendered, so it is attached
 * afterwards rather than passed in.
 */
export function createScreen(stdout: NodeJS.WriteStream) {
  let ink: InkInstance | null = null
  return {
    attach: (instance: InkInstance) => {
      ink = instance
    },
    clear: () => {
      ink?.clear()
      stdout.write(CLEAR_TERMINAL)
    },
  }
}

export type Screen = ReturnType<typeof createScreen>
