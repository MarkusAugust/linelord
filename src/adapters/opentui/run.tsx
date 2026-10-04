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
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
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
