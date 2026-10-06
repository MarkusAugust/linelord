/**
 * Where the Gallowmark canon comes from, for the scripts that copy pieces of it
 * into this repository: a file named on the command line, the sibling checkout
 * if there is one, or the GitHub CLI.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIBLING = join(ROOT, '../../gallowmark/dist/lore.json')

export interface Quote {
  id: string
  text: string
  speaker: string | null
  pool: string
  usedIn: string[]
  status: 'canon' | 'draft' | 'retired'
  tags: string[]
}

export interface Entity {
  id: string
  type: string
  name: string
  /** Characters: what follows the name, as in Hollin the First Down. */
  epithet?: string
  summary: string
  status: 'canon' | 'draft' | 'retired'
  body: string
}

export interface Lore {
  generatedAt: string
  entities: Record<string, Entity>
  quotes: Quote[]
}

export function loadLore(arg: string | undefined): Lore {
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'))
  if (existsSync(SIBLING)) return JSON.parse(readFileSync(SIBLING, 'utf8'))
  const gh = Bun.spawnSync(
    [
      'gh',
      'api',
      'repos/MarkusAugust/gallowmark/contents/dist/lore.json',
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  if (gh.exitCode !== 0) {
    throw new Error(
      `no lore.json given, none at ${SIBLING}, and gh failed:\n${gh.stderr?.toString() ?? ''}`,
    )
  }
  return JSON.parse(gh.stdout.toString())
}
