#!/usr/bin/env bun
/**
 * Writes the demo page from the report `demo:data` produced. The rendering is
 * in `render.ts`, which the tests cover; this file only moves files about.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renderSite } from './render'

const here = dirname(Bun.fileURLToPath(import.meta.url))
const reportPath = join(here, 'data', 'report.json')
const outDir = join(here, 'dist')

let raw: string
try {
  raw = await readFile(reportPath, 'utf8')
} catch {
  console.error(`No report at ${reportPath}.`)
  console.error('Run: bun run demo:repo && bun run demo:data')
  process.exit(1)
}

const html = renderSite(JSON.parse(raw))

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'index.html'), html)
await copyFile(join(here, 'style.css'), join(outDir, 'style.css'))
await copyFile(join(here, 'blade.jpg'), join(outDir, 'blade.jpg'))
await copyFile(join(here, 'og.png'), join(outDir, 'og.png'))

// The game is a module of its own, fetched only when someone goes down. Its
// Datastar is the page's: it imports the address the page loaded, at run time.
const game = await Bun.build({
  entrypoints: [join(here, 'descent', 'ui', 'descent.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
})
if (!game.success) {
  for (const log of game.logs) console.error(log)
  process.exit(1)
}
const [bundle] = game.outputs
if (!bundle) throw new Error('the descent built to nothing')
await writeFile(join(outDir, 'descent.js'), await bundle.text())
await copyFile(
  join(here, 'descent', 'descent.css'),
  join(outDir, 'descent.css'),
)

// The water in the O, its own small module, fetched when the O is first found.
const water = await Bun.build({
  entrypoints: [join(here, 'drain', 'drain.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
})
const [drain] = water.outputs
if (!water.success || !drain) {
  for (const log of water.logs) console.error(log)
  process.exit(1)
}
await writeFile(join(outDir, 'drain.js'), await drain.text())

console.log(`Wrote ${join(outDir, 'index.html')} (${html.length} bytes)`)
