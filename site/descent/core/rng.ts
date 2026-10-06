/**
 * A seeded random source, so that a run can be saved and the tests can be
 * exact. The state is one number, and it lives in the game: the functions here
 * take it, advance it, and hand it back.
 */

export interface Rng {
  /** A whole number from 0 up to, not including, `n`. */
  int: (n: number) => number
  /** One die of `sides` faces: 1 to `sides`. */
  roll: (sides: number) => number
  /** `count` dice of `sides` faces, added. */
  dice: (count: number, sides: number) => number
  chance: (p: number) => boolean
  pick: <T>(items: readonly T[]) => T
  /** The state to carry forward. */
  seed: () => number
}

/** Mulberry32: small, fast, and good enough for dice. */
export function makeRng(start: number): Rng {
  let state = start >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const roll = (sides: number) => (sides <= 0 ? 0 : 1 + int(sides))
  return {
    int,
    roll,
    dice: (count, sides) => {
      let total = 0
      for (let i = 0; i < count; i++) total += roll(sides)
      return total
    },
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      const item = items[int(items.length)]
      if (item === undefined) throw new Error('pick from an empty list')
      return item
    },
    seed: () => state,
  }
}
