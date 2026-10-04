import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import type { LineLordPorts } from '../../core/lineLord'
import { App } from './App'
import type { RealmOptions } from './data'
import { pickQuote } from './quotes'
import { bannerAsciiSmall } from './resources/asciiArt'

/**
 * The interface, full screen, until the person leaves.
 *
 * It owns the terminal while it runs -- the alternate screen, the keyboard,
 * the cursor -- and gives it back exactly as it was. The farewell is printed
 * after that, on the main screen, where it stays.
 */
export async function runInterface(
  ports: LineLordPorts,
  repoPath: string,
  options: RealmOptions,
): Promise<never> {
  // Leaving is ours to do, not the renderer's. Its own Ctrl-C and signal
  // handling destroys the renderer and stops there, with the process -- and
  // any git blame it is waiting on -- still running.
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    screenMode: 'alternate-screen',
  })

  const quit = (): never => {
    renderer.destroy()
    const banner = bannerAsciiSmall
      .map((line) => `  \x1b[32m${line}\x1b[0m`)
      .join('\n')
    process.stdout.write(`\n${banner}\n\n  🪓 ${pickQuote('farewell')}\n\n`)
    process.exit(0)
  }

  // Ctrl-C reaches the keymap as a key; a signal from elsewhere comes here.
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  process.on('SIGHUP', quit)

  createRoot(renderer).render(
    <App
      ports={ports}
      initialPath={repoPath}
      options={options}
      onQuit={quit}
    />,
  )
  // The renderer keeps the process alive; quit() is the only way out.
  return new Promise<never>(() => {})
}
