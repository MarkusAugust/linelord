/**
 * The blank-screen case, run in a process of its own by terminal.test.tsx.
 *
 * Ink writes no frames at all when it believes it runs under CI, so the case
 * cannot be staged inside a test run that CI starts. The test starts this
 * with CI switched off and reads the verdict from standard output, which is
 * not the terminal Ink draws to here.
 */
import { EventEmitter } from 'node:events'
import { render, Text } from 'ink'
import { createScreen } from '../terminal'

const written: string[] = []
const stdout = Object.assign(new EventEmitter(), {
  columns: 80,
  rows: 10,
  isTTY: true,
  write: (chunk: string) => {
    written.push(chunk)
    return true
  },
}) as unknown as NodeJS.WriteStream
const stdin = Object.assign(new EventEmitter(), {
  isTTY: true,
  setRawMode: () => {},
  setEncoding: () => {},
  read: () => null,
  ref: () => {},
  unref: () => {},
  resume: () => {},
  pause: () => {},
}) as unknown as NodeJS.ReadStream

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

// Which clearing to stage: the one LineLord uses, or the console's alone,
// which is what it did before -- so the test can show this case catches it.
const throughInk = process.argv[2] !== 'console-only'
const screen = createScreen(stdout)
const clear = throughInk
  ? screen.clear
  : () => stdout.write('\u001B[2J\u001B[3J\u001B[H')

const app = render(frame(3, 'menu'), {
  stdout,
  stdin,
  patchConsole: false,
  exitOnCtrlC: false,
})
screen.attach(app)
await settle()

// Into a screen taller than the terminal, and back to one that fits.
clear()
app.rerender(frame(20, 'overview'))
await settle()

clear()
written.length = 0
app.rerender(frame(3, 'menu'))
await settle()

app.unmount()
process.stdout.write(written.join('').includes('menu 0') ? 'drawn' : 'blank')
process.exit(0)
