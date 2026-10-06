/**
 * What the lamp shows. A ray to every cell within reach, stopped by wall,
 * closed door and the sea; the cell that stops it is seen, as a wall is.
 */
import { at, index, opaque } from './level'
import type { Level, Pos } from './types'

export function visible(level: Level, from: Pos, radius: number): Set<number> {
  const seen = new Set<number>([index(level, from.x, from.y)])
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + radius) continue
      const tx = from.x + dx
      const ty = from.y + dy
      if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) continue
      for (const p of line(from, { x: tx, y: ty })) {
        seen.add(index(level, p.x, p.y))
        if (opaque(at(level, p.x, p.y))) break
      }
    }
  }
  return seen
}

/** Bresenham, from the cell after `a` up to and including `b`. */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = []
  let { x, y } = a
  const dx = Math.abs(b.x - a.x)
  const dy = -Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1
  const sy = a.y < b.y ? 1 : -1
  let err = dx + dy
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
    out.push({ x, y })
  }
  return out
}

/** Whether `b` can be seen from `a` at all, lamp or none. */
export function inSight(level: Level, a: Pos, b: Pos): boolean {
  const path = line(a, b)
  return path.every((p, i) => i === path.length - 1 || !opaque(at(level, p.x, p.y)))
}
