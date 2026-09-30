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

console.log(`Wrote ${join(outDir, 'index.html')} (${html.length} bytes)`)
