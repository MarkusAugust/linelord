/**
 * The tide. A cycle is a hundred and forty turns: eighty at low water, ten
 * while the flood turns, thirty of flood rising slowly over the lowest ground
 * first and standing at its highest only a short while, and twenty going out
 * again. The grey does the opposite of the sea. In the Brinevaults
 * and the hall it rises at low water and sinks under the flood, so there is no
 * safe half of the cycle, only a different danger in each.
 */
import { tierOf } from './content'
import { at, elevation } from './level'
import type { Level } from './types'

export const CYCLE = 140

export type Phase = 'low' | 'turning' | 'flood' | 'ebb'

const within = (tide: number) => ((tide % CYCLE) + CYCLE) % CYCLE

export function phase(tide: number): Phase {
  const t = within(tide)
  if (t < 80) return 'low'
  if (t < 90) return 'turning'
  if (t < 120) return 'flood'
  return 'ebb'
}

/** How high the water stands: ground lower than this is under it. 0 to 3. */
export function floodLevel(tide: number): number {
  const t = within(tide)
  if (t < 90) return 0
  if (t < 120) return Math.min(3, 1 + Math.floor((t - 90) / 12))
  return t < 130 ? 2 : 1
}

/** What the tide is doing, in words, with how long until the flood when it is near. */
export function tideSays(tide: number): string {
  const t = within(tide)
  if (t < 60) return 'Low water'
  if (t < 80) return `Low water. The flood turns in ${80 - t}.`
  if (t < 90) return `The flood is turning. It rises in ${90 - t}.`
  if (t < 114) return 'Flood, rising'
  if (t < 120) return 'High water'
  return 'Going out'
}

/** How far the grey reaches from where it stands. */
export function greyReach(tide: number, depth: number): number {
  if (depth < 1 || tierOf(depth) < 3) return 0
  const t = within(tide)
  const extra = depth >= 10 ? 2 : 0
  if (t < 80) return Math.min(6, Math.floor(t / 12)) + extra
  if (t < 90) return 6 + extra
  if (t < 120) {
    const left = Math.max(0, 6 - Math.floor((t - 90) / 4))
    return left === 0 ? 0 : left + (t < 100 ? extra : 0)
  }
  return 0
}

/** How deep the water is over a cell: 0 is dry, 2 or more is over your head. */
export function waterAt(
  level: Level,
  tide: number,
  x: number,
  y: number,
): number {
  if (level.depth === 0) return 0
  const tile = at(level, x, y)
  if (tile === '#' || tile === '+') return 0
  return Math.max(0, floodLevel(tide) - elevation(level, x, y))
}

export function greyAt(
  level: Level,
  tide: number,
  x: number,
  y: number,
): boolean {
  const reach = greyReach(tide, level.depth)
  if (reach === 0) return false
  if (at(level, x, y) === '#') return false
  return level.grey.some(
    (g) => (g.x - x) ** 2 + (g.y - y) ** 2 <= reach * reach,
  )
}
