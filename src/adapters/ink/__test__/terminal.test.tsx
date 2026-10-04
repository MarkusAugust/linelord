import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { render, Text } from 'ink'
import { createScreen } from '../terminal'

/** A terminal of a given height that remembers what was written to it. */
function fakeTerminal(rows: number) {
  const written: string[] = []
  const stdout = Object.assign(new EventEmitter(), {
    columns: 80,
    rows,
    isTTY: true,
    write: (chunk: string) => {
      written.push(chunk)
      return true
    },
  })
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode: () => {},
    setEncoding: () => {},
    read: () => null,
    ref: () => {},
    unref: () => {},
    resume: () => {},
    pause: () => {},
  })
  return { stdout, stdin, written }
}

const settle = () => new Promise((done) => setTimeout(done, 60))

function frame(lines: number, label: string) {
  const texts = Array.from({ length: lines }, (_, at) => `${label} ${at}`)
  return (
    <>
      {texts.map((text) => (
        <Text key={text}>{text}</Text>
      ))}
    </>
  )
}

describe('createScreen', () => {
  it('draws the next screen after a screen taller than the terminal', async () => {
    // The menu fits; the overview does not, and Ink draws a frame that tall
    // by clearing the terminal itself, without telling its own record of what
    // is on screen. Going back to the menu then looked like no change at all
    // to Ink, so it wrote nothing -- and the screen stayed blank until a key
    // changed the menu.
    const terminal = fakeTerminal(10)
    const screen = createScreen(
      terminal.stdout as unknown as NodeJS.WriteStream,
    )
    const options = {
      stdout: terminal.stdout as unknown as NodeJS.WriteStream,
      stdin: terminal.stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
      exitOnCtrlC: false,
    }

    const app = render(frame(3, 'menu'), options)
    screen.attach(app)
    await settle()

    screen.clear()
    app.rerender(frame(20, 'overview'))
    await settle()

    screen.clear()
    terminal.written.length = 0
    app.rerender(frame(3, 'menu'))
    await settle()

    expect(terminal.written.join('')).toContain('menu 0')
    app.unmount()
  })
})
