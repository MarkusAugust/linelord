import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { createScreen } from '../terminal'

/** Run the scenario with Ink behaving as it does in a real terminal. */
async function scenario(mode: 'through-ink' | 'console-only') {
  const run = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'screenScenario.tsx'), mode],
    // Ink draws nothing under CI, and CI is where this has to hold too.
    { env: { ...process.env, CI: '0' }, stdout: 'pipe', stderr: 'pipe' },
  )
  const [verdict] = await Promise.all([
    new Response(run.stdout).text(),
    run.exited,
  ])
  return verdict
}

describe('createScreen', () => {
  it('draws the next screen after a screen taller than the terminal', async () => {
    // The menu fits; the overview does not, and Ink draws a frame that tall
    // by clearing the terminal itself, without telling its own record of what
    // is on screen. Going back to the menu then looked like no change at all
    // to Ink, so it wrote nothing -- and the screen stayed blank until a key
    // changed the menu.
    expect(await scenario('through-ink')).toBe('drawn')
  })

  it('stages the case it guards against', async () => {
    // Clearing through the console alone, as before, leaves it blank. If
    // this ever draws, the scenario no longer shows anything.
    expect(await scenario('console-only')).toBe('blank')
  })

  it('makes Ink forget its frame before the terminal is wiped', () => {
    const order: string[] = []
    const stdout = {
      write: (chunk: string) => {
        order.push(`write ${JSON.stringify(chunk)}`)
        return true
      },
    } as unknown as NodeJS.WriteStream
    const screen = createScreen(stdout)

    screen.clear()
    screen.attach({ clear: () => order.push('ink') })
    screen.clear()

    expect(order).toEqual([
      'write "\\u001b[2J\\u001b[3J\\u001b[H"',
      'ink',
      'write "\\u001b[2J\\u001b[3J\\u001b[H"',
    ])
  })
})
