import { describe, expect, it } from 'bun:test'
import {
  FLOORS,
  firstWorld,
  HOLD_TITLES,
  holdFloor,
  isWorld,
  linelord,
  ranking,
  SHINGLE,
  settle,
  standing,
  tribute,
  WRACK_SIZE,
  type Wrack,
  washUp,
  withTaken,
  wrackSaid,
} from '../core/holds'
import { makeRng } from '../core/rng'

describe('the holds of Kell', () => {
  it('are the four depths, each with its old holder and its title', () => {
    const world = firstWorld()
    expect(world.lowWater).toBe(0)
    expect(world.holds[1].holder).toBe('hollin')
    expect(world.holds[2].holder).toBe('grue')
    expect(world.holds[3].holder).toBe('sethra')
    expect(world.holds[4].holder).toBe('corve')
    expect(HOLD_TITLES).toEqual({
      1: 'Holder of the Quaysteps',
      2: 'Lord of the Lowstreets',
      3: 'Keeper of the Brinevaults',
      4: 'Sitter in the Iron Hall',
    })
    expect(FLOORS[1] + FLOORS[2] + FLOORS[3] + FLOORS[4]).toBe(10)
  })

  it('are held at the last floor of each depth', () => {
    expect([1, 2, 3, 4].map((t) => holdFloor(t as 1 | 2 | 3 | 4))).toEqual([
      2, 5, 8, 10,
    ])
  })
})

describe('the ranking', () => {
  it('puts Jarn first while nobody holds more than his shingle, the oldest first among equals', () => {
    const rows = ranking(firstWorld())
    expect(rows[0]?.who).toBe('jarn')
    expect(rows[0]?.ground).toBe(SHINGLE)
    expect(rows.map((r) => r.who)).toEqual([
      'jarn',
      'grue',
      'sethra',
      'hollin',
      'corve',
    ])
    expect(linelord(firstWorld()).who).toBe('jarn')
  })

  it('names you Linelord once you hold more ground than anyone, however new the holding', () => {
    const one = withTaken(firstWorld(), [1], 'Hild')
    expect(linelord(one).who).toBe('jarn')
    const two = withTaken(firstWorld(), [1, 4], 'Hild')
    expect(linelord(two).who).toBe('you')
    const you = ranking(two).find((r) => r.who === 'you')
    expect(you?.name).toBe('Hild')
    expect(you?.titles).toEqual([HOLD_TITLES[1], HOLD_TITLES[4]])
    expect(you?.ground).toBe(4)
  })

  it('loses a tie to whoever has held longer: old is stable, not good', () => {
    const lowstreets = withTaken(firstWorld(), [2], 'Hild')
    const rows = ranking(lowstreets)
    expect(rows.findIndex((r) => r.who === 'you')).toBeGreaterThan(
      rows.findIndex((r) => r.who === 'jarn'),
    )
  })
})

describe('the low water between runs', () => {
  it('writes what a run took into the world, and the sea goes out once more', () => {
    const { world, news } = settle(firstWorld(), [2], 'Hild', makeRng(1))
    expect(world.lowWater).toBe(1)
    expect(world.holds[2]).toEqual({
      holder: 'you',
      name: 'Hild',
      since: 0,
      from: 'grue',
    })
    expect(news).toEqual([])
  })

  it('gives a fresh hold back to its old holder often, and an old one seldom', () => {
    const lost = (age: number) => {
      let count = 0
      for (let seed = 1; seed <= 400; seed++) {
        const world = withTaken(firstWorld(), [1], 'Hild')
        world.lowWater = age
        const after = settle(world, [], 'Hild', makeRng(seed))
        if (after.world.holds[1].holder === 'hollin') count++
      }
      return count / 400
    }
    expect(lost(0)).toBeGreaterThan(0.4)
    expect(lost(8)).toBeLessThan(0.15)
    expect(lost(500)).toBeGreaterThan(0.02)
  })

  it('says who took a hold back, and what the ledger makes of it', () => {
    const world = withTaken(firstWorld(), [1], 'Hild')
    const seed = Array.from({ length: 50 }, (_, i) => i + 1).find(
      (s) =>
        settle(world, [], 'Hild', makeRng(s)).world.holds[1].holder !== 'you',
    )
    const { world: after, news } = settle(world, [], 'Hild', makeRng(seed ?? 1))
    expect(after.holds[1]).toMatchObject({ holder: 'hollin', since: 1 })
    expect(news[0]).toBe('Hollin has the Quaysteps back.')
    expect(news).toHaveLength(2)
  })

  it('never contests a hold in the run that took it', () => {
    for (let seed = 1; seed <= 50; seed++)
      expect(
        settle(firstWorld(), [3], 'Hild', makeRng(seed)).world.holds[3].holder,
      ).toBe('you')
  })
})

describe('what the holds pay', () => {
  it('pays well for fresh ground and little for old, and nothing for none', () => {
    expect(tribute(firstWorld())).toBe(0)
    const fresh = withTaken(firstWorld(), [1, 2], 'Hild')
    const old = { ...fresh, lowWater: 10 }
    expect(tribute(fresh)).toBe(FLOORS[1] * 10 + FLOORS[2] * 10)
    expect(tribute(old)).toBe(FLOORS[1] + FLOORS[2])
  })
})

describe('the world, read back', () => {
  it('knows a world from anything else', () => {
    expect(isWorld(firstWorld())).toBe(true)
    expect(isWorld({ lowWater: 1 })).toBe(false)
    expect(isWorld(null)).toBe(false)
  })
})

describe('the ledger, read as a ranking', () => {
  it('says who holds Kell, in order, the Linelord first', () => {
    const lines = standing(firstWorld())
    expect(lines[0]).toBe(
      '1. Jarn, the Linelord: the shingle under Wrackhead, held 170 low waters.',
    )
    expect(lines[1]).toBe(
      '2. Grue the Toll, Lord of the Lowstreets: 3 floors, held 100 low waters.',
    )
    expect(lines).toHaveLength(5)
  })

  it('puts you in it once you hold anything, and says when someone holds nothing', () => {
    const world = withTaken(firstWorld(), [1, 4], 'Hild')
    world.lowWater = 1
    const lines = standing(world)
    expect(lines[0]).toBe(
      `1. Hild, ${HOLD_TITLES[1]}, ${HOLD_TITLES[4]}, the Linelord: 4 floors, held 1 low water.`,
    )
    expect(lines).toContain('5. Hollin the First Down: nothing held.')
    expect(lines).toContain('6. Corve the Rust-Sitter: nothing held.')
  })
})

describe('your wrack', () => {
  const fell = (id: number, depth = 4): Wrack => ({
    id,
    name: 'Hild',
    depth,
    weapon: 'axe',
    armour: 'leather',
    marks: 20,
    level: 3,
  })

  it('is washed up newest first, taken back when cleared, and the sea keeps only so many', () => {
    let world = firstWorld()
    expect(world.wrack ?? []).toEqual([])
    world = washUp(world, fell(0), [])
    world = washUp(world, fell(1, 6), [])
    expect((world.wrack ?? []).map((w) => w.id)).toEqual([1, 0])
    world = washUp(world, null, [0])
    expect((world.wrack ?? []).map((w) => w.id)).toEqual([1])
    for (let i = 2; i < 2 + WRACK_SIZE + 3; i++)
      world = washUp(world, fell(i), [])
    expect(world.wrack).toHaveLength(WRACK_SIZE)
  })

  it('reads a world from before there was any wrack', () => {
    const { wrack: _, ...old } = washUp(firstWorld(), fell(0), [])
    expect(isWorld(old)).toBe(true)
    expect(isWorld({ ...firstWorld(), wrack: [{ id: 'x' }] })).toBe(false)
  })

  it('says where each one stands, and what it holds', () => {
    const world = washUp(washUp(firstWorld(), fell(0), []), fell(1, 6), [])
    world.wrack = [
      { ...(world.wrack?.[0] as Wrack), weapon: null, armour: null, marks: 0 },
      ...(world.wrack ?? []).slice(1),
    ]
    expect(wrackSaid(world)).toEqual([
      'Hild, on depth 6, holding nothing.',
      'Hild, on depth 4, holding an axe, a salt-hard jerkin and 20 marks.',
    ])
  })
})
