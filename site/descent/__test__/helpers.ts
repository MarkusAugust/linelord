import { newGame } from '../core/game'
import { spawn } from '../core/level'
import type { Background, Game, Level } from '../core/types'

/**
 * A level drawn by hand. `@` marks where the player stands and is floor;
 * every cell is at `elev` unless a digit row says otherwise.
 */
export function levelFrom(
  rows: string[],
  depth: number,
  elev = 3,
): { level: Level; at: { x: number; y: number } } {
  const w = Math.max(...rows.map((r) => r.length))
  const h = rows.length
  let at = { x: 1, y: 1 }
  const tiles = rows.map((row, y) => {
    const padded = row.padEnd(w, '#')
    const x = padded.indexOf('@')
    if (x >= 0) at = { x, y }
    return padded.replace('@', '.')
  })
  const up = { x: 0, y: 0 }
  const down: { x: number; y: number } | null = null
  tiles.forEach((row, y) => {
    const ux = row.indexOf('<')
    if (ux >= 0) Object.assign(up, { x: ux, y })
  })
  const level: Level = {
    depth,
    w,
    h,
    tiles,
    elev: Array.from({ length: w * h }, () => elev),
    seen: Array.from({ length: w * h }, () => false),
    up,
    down,
    items: [],
    monsters: [],
    grey: [],
  }
  tiles.forEach((row, y) => {
    const dx = row.indexOf('>')
    if (dx >= 0) level.down = { x: dx, y }
  })
  return { level, at }
}

/** A run on a hand-drawn level at some depth. */
export function gameOn(
  rows: string[],
  depth: number,
  opts: { bg?: Background; seed?: number; elev?: number } = {},
): Game {
  const game = newGame({
    name: 'Hild',
    bg: opts.bg ?? 'ashborn',
    seed: opts.seed ?? 7,
  })
  const { level, at } = levelFrom(rows, depth, opts.elev)
  game.depth = depth
  game.level = level
  game.player.x = at.x
  game.player.y = at.y
  return game
}

export function put(game: Game, kind: string, x: number, y: number) {
  const m = spawn(kind, x, y, game.depth, game.nextId++)
  game.level.monsters.push(m)
  return m
}
