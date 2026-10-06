import { describe, expect, it } from 'bun:test'
import { ITEMS, LEVELS, MONSTERS, needsNaming, tierOf } from '../core/content'
import { inSight, line, visible } from '../core/fov'
import { at, generate, H, index, set, town, W, walkable } from '../core/level'
import { makeRng } from '../core/rng'
import {
  CYCLE,
  floodLevel,
  greyAt,
  greyReach,
  phase,
  waterAt,
} from '../core/tide'
import { creatures, holders, opening, pools } from '../lore'
import { levelFrom } from './helpers'

const ids = () => {
  let n = 1
  return () => n++
}

describe('the random source', () => {
  it('gives the same rolls from the same seed, and carries its state', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const rolls = Array.from({ length: 20 }, () => a.roll(20))
    expect(Array.from({ length: 20 }, () => b.roll(20))).toEqual(rolls)
    expect(rolls.every((r) => r >= 1 && r <= 20)).toBe(true)
    const resumed = makeRng(a.seed())
    expect(resumed.int(1000)).toBe(a.int(1000))
  })

  it('rolls dice, takes chances and picks', () => {
    const rng = makeRng(3)
    expect(rng.roll(0)).toBe(0)
    const total = rng.dice(3, 6)
    expect(total).toBeGreaterThanOrEqual(3)
    expect(total).toBeLessThanOrEqual(18)
    expect(rng.chance(1)).toBe(true)
    expect(rng.chance(0)).toBe(false)
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']))
    expect(() => rng.pick([])).toThrow('empty')
  })
})

describe('the canon the game draws on', () => {
  it('has every pool it speaks from, Sarn opening in five lines, and its creatures', () => {
    for (const pool of Object.values(pools))
      expect(pool.length).toBeGreaterThan(0)
    expect(opening).toHaveLength(5)
    expect(opening[0]).toContain('The sea is going out')
    for (const m of Object.values(MONSTERS))
      expect(
        m.creature
          ? creatures[m.creature].name
          : m.holder && holders[m.holder].name,
      ).toBeTruthy()
  })
})

describe('the tiers and the titles', () => {
  it('puts ten floors in four tiers', () => {
    expect([1, 2, 3, 5, 6, 8, 9, 10].map(tierOf)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ])
  })

  it('asks more blood for every level', () => {
    expect(LEVELS[0]).toBe(0)
    expect(LEVELS).toHaveLength(10)
    for (let i = 1; i < LEVELS.length; i++)
      expect(LEVELS[i] ?? 0).toBeGreaterThan(LEVELS[i - 1] ?? 0)
  })

  it('knows which things need naming before they are known', () => {
    expect(needsNaming('vial-grey')).toBe(true)
    expect(needsNaming('knife')).toBe(false)
    expect(needsNaming('nothing')).toBe(false)
  })
})

describe('the tide', () => {
  it('runs low, turning, flood and ebb, a hundred turns to the cycle', () => {
    expect(phase(0)).toBe('low')
    expect(phase(55)).toBe('turning')
    expect(phase(70)).toBe('flood')
    expect(phase(95)).toBe('ebb')
    expect(phase(CYCLE)).toBe('low')
  })

  it('raises the water over the lowest ground first, and lets it down again', () => {
    expect(floodLevel(10)).toBe(0)
    expect(floodLevel(60)).toBe(1)
    expect(floodLevel(80)).toBe(3)
    expect(floodLevel(92)).toBe(2)
    expect(floodLevel(97)).toBe(1)
  })

  it('lets the grey rise at low water in the deep, and nowhere above it', () => {
    expect(greyReach(40, 2)).toBe(0)
    expect(greyReach(0, 0)).toBe(0)
    expect(greyReach(0, 7)).toBe(0)
    expect(greyReach(49, 7)).toBe(6)
    expect(greyReach(55, 7)).toBe(6)
    expect(greyReach(55, 10)).toBe(8)
    expect(greyReach(65, 10)).toBe(7)
    expect(greyReach(80, 7)).toBe(0)
    expect(greyReach(95, 7)).toBe(0)
  })

  it('says how deep the water is over a cell, and where the grey stands', () => {
    const { level } = levelFrom(['#####', '#...#', '#####'], 7)
    level.elev[index(level, 1, 1)] = 0
    expect(waterAt(level, 80, 1, 1)).toBe(3)
    expect(waterAt(level, 80, 2, 1)).toBe(0)
    expect(waterAt(level, 80, 0, 0)).toBe(0)
    expect(waterAt(town(), 80, 5, 5)).toBe(0)
    level.grey.push({ x: 1, y: 1 })
    expect(greyAt(level, 30, 3, 1)).toBe(true)
    expect(greyAt(level, 30, 0, 0)).toBe(false)
    expect(greyAt(level, 80, 1, 1)).toBe(false)
  })
})

describe('what the lamp shows', () => {
  const { level } = levelFrom(
    ['#########', '#...#...#', '#.......#', '#########'],
    1,
  )

  it('draws straight lines', () => {
    expect(line({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
    expect(line({ x: 0, y: 0 }, { x: 2, y: 2 })).toHaveLength(2)
  })

  it('stops at walls, and sees the wall that stops it', () => {
    const seen = visible(level, { x: 1, y: 1 }, 6)
    expect(seen.has(index(level, 3, 1))).toBe(true)
    expect(seen.has(index(level, 4, 1))).toBe(true)
    expect(seen.has(index(level, 5, 1))).toBe(false)
    expect(inSight(level, { x: 1, y: 1 }, { x: 5, y: 1 })).toBe(false)
    expect(inSight(level, { x: 1, y: 2 }, { x: 7, y: 2 })).toBe(true)
  })
})

describe('the ground', () => {
  it('lays out Wrackhead with seven doors and the top of the steps', () => {
    const t = town()
    for (const d of '1234567') expect(t.tiles.join('')).toContain(d)
    expect(t.down && at(t, t.down.x, t.down.y)).toBe('>')
    expect(walkable(at(t, t.up.x, t.up.y))).toBe(true)
    expect(t.seen.every(Boolean)).toBe(true)
  })

  it('reads off the edge as wall, and writes nothing there', () => {
    const t = town()
    expect(at(t, -1, 0)).toBe('#')
    set(t, -1, 0, '.')
    set(t, 0, 99, '.')
    expect(at(t, 0, 0)).toBe('#')
  })

  it('makes floors with a stair each way, the top dry and the stair down lowest', () => {
    for (let depth = 1; depth <= 9; depth++) {
      const level = generate(depth, makeRng(depth * 31), ids())
      expect(level.w).toBe(W)
      expect(level.h).toBe(H)
      expect(at(level, level.up.x, level.up.y)).toBe('<')
      const down = level.down
      if (!down) throw new Error('no stair down')
      expect(at(level, down.x, down.y)).toBe('>')
      expect(level.elev[index(level, level.up.x, level.up.y)]).toBe(3)
      expect(level.elev[index(level, down.x, down.y)]).toBe(0)
      expect(level.monsters.length).toBeGreaterThan(0)
      expect(level.items.length).toBeGreaterThan(0)
      for (const m of level.monsters)
        expect(walkable(at(level, m.x, m.y))).toBe(true)
    }
  })

  it('bars doors in the Lowstreets, salts the vaults with grey, and seats Sarn on the third floors', () => {
    const streets = [3, 4, 5].map((d) => generate(d, makeRng(d), ids()))
    expect(streets.some((l) => l.tiles.join('').includes('+'))).toBe(true)
    const vaults = generate(7, makeRng(7), ids())
    expect(vaults.grey.length).toBeGreaterThan(0)
    expect(vaults.items.some((i) => i.item.kind === 'page')).toBe(true)
    expect(generate(3, makeRng(1), ids()).tiles.join('')).toContain('S')
    expect(generate(6, makeRng(1), ids()).tiles.join('')).toContain('S')
    expect(generate(4, makeRng(1), ids()).tiles.join('')).not.toContain('S')
  })

  it('makes the hall at the bottom: the king, the ledger, the drain and the roof', () => {
    const hall = generate(10, makeRng(10), ids())
    const all = hall.tiles.join('')
    for (const t of ['K', '_', 'O', '&', '^', '<']) expect(all).toContain(t)
    expect(hall.down).toBeNull()
    expect(hall.items.some((i) => i.item.kind === 'ledger')).toBe(true)
    expect(hall.grey.length).toBeGreaterThan(4)
  })

  it('only lays things down that exist', () => {
    const level = generate(5, makeRng(5), ids())
    for (const { item } of level.items) {
      if (item.kind === 'marks') expect(item.amount ?? 0).toBeGreaterThan(0)
      else expect(ITEMS[item.kind]).toBeDefined()
    }
  })
})

describe('Wrackhead, drawn', () => {
  it('is square, with every door in the south wall where walking past does not open it', () => {
    const t = town()
    expect(new Set(t.tiles.map((r) => r.length)).size).toBe(1)
    const south = t.tiles[t.h - 1] ?? ''
    for (const d of '1234567') expect(south).toContain(d)
  })
})
