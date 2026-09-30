#!/usr/bin/env bun
/**
 * Builds the demo repository the site is analysed from. The work is in
 * `demo/buildDemoRepo.ts`, which the tests cover; this file only reads the
 * arguments and says where the repository landed.
 */

import { buildDemoRepo } from './demo/buildDemoRepo'

const outIndex = process.argv.indexOf('--out')
const out =
  outIndex === -1 ? 'demo-repo' : (process.argv[outIndex + 1] ?? 'demo-repo')

const demo = await buildDemoRepo({ root: out })

console.log(`Demo repository built at ${demo.path}`)
if (demo.ignoredRevs.length > 0) {
  console.log(`.git-blame-ignore-revs names ${demo.ignoredRevs.join(', ')}`)
}
