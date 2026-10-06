import { describe, expect, it } from 'bun:test'
import { ITEMS } from '../core/content'
import {
  act,
  armourClass,
  itemName,
  lightRadius,
  monsterName,
  newGame,
  offerFor,
  offers,
  rollDie,
  sellPrice,
  tideReport,
  verbOf,
} from '../core/game'
import { firstWorld, HOLD_TITLES, withTaken } from '../core/holds'
import { at, generate, index, spawn } from '../core/level'
import { makeRng } from '../core/rng'
import type { Command, Game } from '../core/types'
import { holders, pools } from '../lore'
import { gameOn, put } from './helpers'

/** Run commands in order, gathering what was said. */
function run(game: Game, ...cmds: Command[]): { game: Game; lines: string[] } {
  let g = game
  const lines: string[] = []
  for (const cmd of cmds) {
    const out = act(g, cmd)
    g = out.game
    lines.push(...out.lines)
  }
  return { game: g, lines }
}

const wait: Command = { type: 'wait' }
const east: Command = { type: 'move', dir: 'e' }
const west: Command = { type: 'move', dir: 'w' }

/** Hit until it goes down, or give up. */
function fight(
  game: Game,
  cmd: Command,
  until: (g: Game) => boolean,
  limit = 60,
) {
  let g = game
  const lines: string[] = []
  for (let i = 0; i < limit && !until(g) && !g.over; i++) {
    if (g.prompt) {
      const a = act(g, { type: 'answer', yes: false })
      g = a.game
      lines.push(...a.lines)
    }
    const out = act(g, cmd)
    g = out.game
    lines.push(...out.lines)
  }
  return { game: g, lines }
}

const ROOM = ['#########', '#<..@..>#', '#.......#', '#########']

describe('a new run', () => {
  it('starts on the shingle at Wrackhead with a knife, a jerkin and thirty marks', () => {
    const g = newGame({
      name: '  Hild ',
      bg: 'wrecker',
      seed: 1,
      known: ['picker'],
    })
    expect(g.depth).toBe(0)
    expect(g.player.name).toBe('Hild')
    expect(g.player.weapon).toBe('knife')
    expect(g.player.armour).toBe('leather')
    expect(g.player.marks).toBe(30)
    expect(g.player.rope).toBe(8)
    expect(g.known).toEqual(['picker'])
    expect(newGame({ name: ' ', bg: 'novice', seed: 1 }).player.name).toBe(
      'Nameless',
    )
    expect(
      newGame({
        name: 'A',
        bg: 'novice',
        seed: 1,
        bones: { name: 'Ulf', weapon: 'axe' },
      }).bones?.name,
    ).toBe('Ulf')
  })

  it('never changes the game it was given', () => {
    const g = gameOn(ROOM, 1)
    const before = JSON.stringify(g)
    act(g, east)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('does nothing once the run is over', () => {
    const g = gameOn(ROOM, 1)
    g.over = { ending: 'dead', cause: 'x' }
    const out = act(g, east)
    expect(out.game.player.x).toBe(g.player.x)
    expect(out.lines).toEqual([])
  })
})

describe('moving', () => {
  it('walks on floor, and not into walls, which costs no time', () => {
    const g = gameOn(ROOM, 1)
    const moved = run(g, east).game
    expect(moved.player.x).toBe(g.player.x + 1)
    expect(moved.turn).toBe(1)
    const bumped = run(gameOn(['###', '#@#', '###'], 1), east).game
    expect(bumped.turn).toBe(0)
  })

  it('picks up marks underfoot and says what else lies there', () => {
    const g = gameOn(ROOM, 1)
    g.level.items.push(
      { x: 5, y: 1, item: { kind: 'marks', amount: 12 } },
      { x: 5, y: 1, item: { kind: 'knife' } },
    )
    const out = run(g, east)
    expect(out.game.player.marks).toBe(42)
    expect(out.game.player.gained).toBe(12)
    expect(out.lines.join(' ')).toContain('a knife here')
    const two = gameOn(ROOM, 1)
    two.level.items.push(
      { x: 5, y: 1, item: { kind: 'knife' } },
      { x: 5, y: 1, item: { kind: 'salt' } },
    )
    expect(run(two, east).lines.join(' ')).toContain('2 things here')
  })

  it('opens a barred door with a shoulder, and sometimes something comes through', () => {
    const lines: string[] = []
    let doorsOpened = 0
    for (let seed = 1; seed < 40; seed++) {
      const g = gameOn(['#######', '#.@+..#', '#######'], 4, { seed })
      const out = run(g, east)
      expect(at(out.game.level, 3, 1)).toBe("'")
      doorsOpened++
      lines.push(...out.lines)
    }
    expect(doorsOpened).toBe(39)
    expect(lines.some((l) => l.includes('comes through'))).toBe(true)
    expect(lines.some((l) => l.includes('Grey comes out'))).toBe(true)
  })

  it('speaks to the king, the drain and the man standing in it, without moving', () => {
    const g = gameOn(['#####', '#K@&#', '##O##', '#####'], 10)
    const k = run(g, west)
    expect(k.lines[0]).toContain('three empty sockets')
    const gorvek = run(g, east)
    expect(pools.drain.some((l) => gorvek.lines[0]?.includes(l))).toBe(true)
    expect(run(g, { type: 'move', dir: 's' }).lines[0]).toContain('The drain')
    expect(k.game.turn).toBe(0)
  })
})

describe('the stairs and the rope', () => {
  it('goes down from Wrackhead to the Quaysteps, and up again past the fort', () => {
    let g = newGame({ name: 'Hild', bg: 'ashborn', seed: 9 })
    g.player.x = g.level.down?.x ?? 0
    g.player.y = g.level.down?.y ?? 0
    const down = run(g, { type: 'stairs' })
    expect(down.game.depth).toBe(1)
    expect(down.lines[0]).toBe('The Quaysteps.')
    expect(pools['arrive-quays']).toContain(down.lines[1] ?? '')
    g = down.game
    expect(at(g.level, g.player.x, g.player.y)).toBe('<')
    g.player.gained = 100
    const up = run(g, { type: 'stairs' })
    expect(up.game.depth).toBe(0)
    expect(up.game.player.marks).toBe(20)
    expect(up.lines.join(' ')).toContain('The fort takes 10 marks')
  })

  it('says so when there is no stair, and the rope holds a held man', () => {
    const g = gameOn(ROOM, 1)
    expect(run(g, { type: 'stairs' }).lines).toEqual([
      'There is no stair here.',
    ])
    g.player.held = 99
    g.player.x = 1
    expect(run(g, { type: 'stairs' }).lines).toEqual(['The rope holds you.'])
    expect(run(g, { type: 'rope' }).lines[0]).toContain('wrong end of a rope')
  })

  it('climbs a rope to the floor above, and runs out of rope', () => {
    const g = gameOn(ROOM, 3)
    const up = run(g, { type: 'rope' })
    expect(up.game.depth).toBe(2)
    const down = up.game.level.down
    expect(
      down && up.game.player.x === down.x && up.game.player.y === down.y,
    ).toBe(true)
    g.player.rope = 0
    expect(run(g, { type: 'rope' }).lines).toEqual(['You have no rope left.'])
    const town = newGame({ name: 'H', bg: 'ashborn', seed: 1 })
    expect(run(town, { type: 'rope' }).game.depth).toBe(0)
  })

  it('brings back a warrior of an earlier run, in the Lowstreets, carrying their blade', () => {
    const g = gameOn(ROOM, 2)
    g.bones = { name: 'Ulf', weapon: 'axe' }
    g.player.x = 7
    const out = run(g, { type: 'stairs' })
    const ulf = out.game.level.monsters.find((m) => m.bones)
    expect(ulf?.bones?.name).toBe('Ulf')
    expect(out.game.bones).toBeUndefined()
    out.game.known.push('unasked')
    expect(ulf && monsterName(out.game, ulf)).toBe('Ulf, one of the Unasked')
  })
})

describe('the pack', () => {
  it('gets and drops, and keeps to twelve things', () => {
    const g = gameOn(ROOM, 1)
    expect(run(g, { type: 'get' }).lines).toEqual(['There is nothing here.'])
    g.level.items.push({ x: 4, y: 1, item: { kind: 'axe' } })
    const got = run(g, { type: 'get' })
    expect(got.game.player.pack.map((i) => i.kind)).toContain('axe')
    const dropped = run(got.game, { type: 'drop', index: 0 })
    expect(dropped.game.level.items).toHaveLength(1)
    g.player.pack = Array.from({ length: 12 }, () => ({ kind: 'salt' }))
    expect(run(g, { type: 'get' }).lines).toEqual(['Your pack is full.'])
    expect(run(g, { type: 'drop', index: 99 }).game.turn).toBe(0)
  })

  it('takes up weapons and armour, and puts the old ones in the pack', () => {
    const g = gameOn(ROOM, 1)
    g.player.pack = [{ kind: 'axe' }, { kind: 'mail' }]
    const out = run(g, { type: 'use', index: 0 }, { type: 'use', index: 0 })
    expect(out.game.player.weapon).toBe('axe')
    expect(out.game.player.armour).toBe('mail')
    expect(out.game.player.pack.map((i) => i.kind).sort()).toEqual([
      'knife',
      'leather',
    ])
  })

  it('fills the lamp, the water and the rope, and washes with salt', () => {
    const g = gameOn(ROOM, 1)
    Object.assign(g.player, { lamp: 4, water: 0, rope: 0, hp: 2 })
    g.player.pack = [
      { kind: 'oil' },
      { kind: 'skin' },
      { kind: 'coil' },
      { kind: 'salt' },
    ]
    const out = run(
      g,
      ...[0, 0, 0, 0].map((index): Command => ({ type: 'use', index })),
    )
    expect(out.game.player.lamp).toBe(8)
    expect(out.game.player.water).toBe(8)
    expect(out.game.player.rope).toBe(8)
    expect(out.game.player.hp).toBeGreaterThan(2)
    expect(out.game.player.pack).toHaveLength(0)
  })

  it('names a vial by drinking it, and each one does what it is', () => {
    const drink = (kind: string, setup?: (g: Game) => void) => {
      const g = gameOn(ROOM, 1)
      g.player.pack = [{ kind }]
      setup?.(g)
      return run(g, { type: 'use', index: 0 })
    }
    const breath = drink('vial-grey', (g) => {
      g.player.hp = 1
    })
    expect(breath.game.player.hp).toBeGreaterThan(5)
    expect(breath.game.known).toContain('vial-grey')
    expect(breath.lines[0]).toBe('It was a grey vial of breath.')
    expect(drink('vial-salt').game.level.seen.every(Boolean)).toBe(true)
    expect(drink('vial-cloud').game.player.will).toBe(3)
    expect(drink('vial-black').game.player.grey).toBe(1)
    expect(drink('vial-warm').game.player.maxHp).toBe(18)
    const sea = drink('vial-bitter', (g) => {
      g.player.held = 3
    })
    expect(sea.game.player.held).toBeNull()
    expect(sea.game.player.x).toBe(sea.game.level.up.x)
  })

  it('reads a page, and says what a trinket and the ledger are', () => {
    const g = gameOn(ROOM, 7)
    g.player.pack = [
      { kind: 'page' },
      { kind: 'ring' },
      { kind: 'ledger' },
      { kind: 'sarn-lamp' },
    ]
    const page = run(g, { type: 'use', index: 0 })
    expect(page.game.level.seen.every(Boolean)).toBe(true)
    expect(run(g, { type: 'use', index: 1 }).lines[0]).toContain('A warm ring')
    expect(run(g, { type: 'use', index: 2 }).lines[0]).toContain(
      'not a measure of worth',
    )
    expect(run(g, { type: 'use', index: 3 }).lines[0]).toContain('already lit')
    expect(run(g, { type: 'use', index: 9 }).game.turn).toBe(0)
  })

  it('calls things by what they are once they are known', () => {
    const g = gameOn(ROOM, 1)
    expect(itemName(g, { kind: 'vial-grey' })).toBe('a grey vial')
    g.known.push('vial-grey')
    expect(itemName(g, { kind: 'vial-grey' })).toBe('a grey vial of breath')
    expect(itemName(g, { kind: 'marks', amount: 5 })).toBe('5 marks')
    expect(itemName(g, { kind: 'marks' })).toBe('0 marks')
    expect(itemName(g, { kind: 'unheard-of' })).toBe('unheard-of')
    const m = put(g, 'picker', 1, 2)
    expect(monsterName(g, m)).toBe('a crouched figure')
    g.known.push('picker')
    expect(monsterName(g, m)).toBe('a Picker')
    m.kind = 'nothing'
    expect(monsterName(g, m)).toBe('something')
  })
})

describe('fighting', () => {
  it('kills what it hits often enough, and learns from it', () => {
    const g = gameOn(ROOM, 1)
    put(g, 'picker', 5, 1)
    const out = fight(g, east, (x) => x.level.monsters.every((m) => m.hp <= 0))
    expect(out.lines.some((l) => l.includes('goes down'))).toBe(true)
    expect(out.game.player.xp).toBeGreaterThan(0)
    expect(out.game.player.slain).toContain('picker')
    expect(out.game.level.items.some((i) => i.item.kind === 'marks')).toBe(true)
  })

  it('rises a level with enough blood', () => {
    const g = gameOn(ROOM, 9)
    g.player.xp = 9
    put(g, 'picker', 5, 1)
    const out = fight(g, east, (x) => x.player.level > 1)
    expect(out.game.player.level).toBeGreaterThan(1)
    expect(out.lines.some((l) => l.startsWith('You are level '))).toBe(true)
  })

  it('pays in grey for a blow that is meant', () => {
    const g = gameOn(ROOM, 1)
    put(g, 'picker', 5, 1)
    const mean = run(g, { type: 'mean' })
    expect(mean.game.player.meaning).toBe(true)
    expect(mean.game.turn).toBe(0)
    const out = run(mean.game, east)
    expect(out.game.player.grey).toBe(1)
    expect(out.game.player.will).toBe(1)
    expect(out.game.player.meaning).toBe(false)
    expect(run(mean.game, { type: 'mean' }).game.player.meaning).toBe(false)
  })

  it('is hit back, robbed by Pickers, and killed in the end', () => {
    const g = gameOn(ROOM, 1)
    g.player.marks = 50
    g.player.hp = 400
    g.player.maxHp = 400
    put(g, 'picker', 5, 1)
    const out = fight(g, wait, (x) => x.player.marks < 50)
    expect(out.lines.some((l) => l.includes('hits you'))).toBe(true)
    expect(out.lines.some((l) => l.includes('misses'))).toBe(true)
    expect(out.game.player.marks).toBeLessThan(50)
    const dying = gameOn(ROOM, 1)
    dying.player.hp = 1
    put(dying, 'firstcloak', 5, 1).refused = true
    const dead = fight(dying, wait, (x) => x.over !== null)
    expect(dead.game.over?.ending).toBe('dead')
    expect(dead.game.over?.cause).toContain(
      'killed by a grey-cloaked shape at depth 1',
    )
  })

  it('is given back once by the sea, if the salt-pile was paid', () => {
    const g = gameOn(ROOM, 1)
    g.player.hp = 1
    g.player.owed = true
    put(g, 'firstcloak', 5, 1).refused = true
    const out = fight(g, wait, (x) => x.player.owed === false)
    expect(out.game.over).toBeNull()
    expect(out.game.player.hp).toBeGreaterThan(1)
    expect(out.lines).toContain(pools['salt-pile'][1] ?? '')
  })
})

describe('the order', () => {
  it('asks a tenth before it fights, and stands aside when paid', () => {
    const g = gameOn(ROOM, 1)
    g.player.marks = 100
    put(g, 'firstcloak', 5, 1)
    const asked = run(g, east)
    expect(asked.game.prompt?.kind).toBe('tithe')
    expect(run(asked.game, east).lines).toEqual(['Answer first: y or n.'])
    const paid = run(asked.game, { type: 'answer', yes: true })
    expect(paid.game.player.marks).toBe(90)
    expect(paid.game.level.monsters[0]?.peaceful).toBe(true)
    const by = run(paid.game, east)
    expect(by.lines[0]).toContain('lets you by')
    expect(by.game.player.x).toBe(5)
    expect(by.game.level.monsters[0]?.x).toBe(4)
  })

  it('brings out the hook when refused', () => {
    const g = gameOn(ROOM, 1)
    put(g, 'firstcloak', 5, 1)
    const asked = run(g, east)
    const refused = run(asked.game, { type: 'answer', yes: false })
    expect(refused.lines[0]).toContain('The hook comes out')
    expect(refused.game.level.monsters[0]?.refused).toBe(true)
  })

  it('comes to you and asks, if you do not come to it', () => {
    const g = gameOn(['#########', '#<.@...>#', '#########'], 1)
    put(g, 'firstcloak', 6, 1).awake = true
    const out = fight(g, wait, (x) => x.prompt !== null, 10)
    expect(out.game.prompt?.kind).toBe('tithe')
    expect(out.lines.some((l) => l.includes('Pardon. A tenth'))).toBe(true)
  })

  it('ignores an answer nobody asked for', () => {
    const g = gameOn(ROOM, 1)
    expect(run(g, { type: 'answer', yes: true }).game.prompt).toBeNull()
  })
})

describe('the holders', () => {
  /** A run standing on the stair down to `depth`, in a world. */
  const above = (depth: number, world = firstWorld()) => {
    const g = gameOn(['#####', '#<@>#', '#####'], depth - 1)
    g.player.x = 3
    g.world = world
    return g
  }
  const holderOf = (g: Game, kind: string) =>
    g.level.monsters.find((m) => m.kind === kind)
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1

  it('wait at the last floor of each depth, by the stair down, and the ledger in the hall', () => {
    for (const [depth, kind] of [
      [2, 'hollin'],
      [5, 'grue'],
      [8, 'sethra'],
    ] as const) {
      const g = run(above(depth), { type: 'stairs' }).game
      const m = holderOf(g, kind)
      expect(m).toBeDefined()
      expect(g.level.down && m && near(m, g.level.down)).toBe(true)
    }
    const hall = run(above(10), { type: 'stairs' }).game
    const corve = holderOf(hall, 'corve')
    const ledger = hall.level.items.find((i) => i.item.kind === 'ledger')
    expect(corve && ledger && near(corve, ledger)).toBe(true)
    expect(
      run(above(3), { type: 'stairs' }).game.level.monsters.some(
        (m) => m.kind === 'grue',
      ),
    ).toBe(false)
  })

  it('wait wherever they hold now, and give up that hold', () => {
    const world = firstWorld()
    world.holds[2] = {
      holder: 'hollin',
      name: 'Hollin',
      since: 0,
      from: 'hollin',
    }
    const g = run(above(5, world), { type: 'stairs' }).game
    const her = holderOf(g, 'hollin')
    expect(her?.holds).toBe(2)
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.might = 40
    g.player.x = (her?.x ?? 0) - 1
    g.player.y = her?.y ?? 0
    g.level.tiles[g.player.y] =
      g.level.tiles[g.player.y]?.replace(/./g, (c, i) =>
        i === g.player.x ? '.' : c,
      ) ?? ''
    const out = fight(g, east, (x) => (x.taken ?? []).length > 0)
    expect(out.game.taken).toEqual([2])
    expect(out.lines.some((l) => l.includes(HOLD_TITLES[2]))).toBe(true)
  })

  it('fight as hard as the depth they hold, and no harder: Corve on the Quaysteps is no Corve of the hall', () => {
    const world = firstWorld()
    world.holds[1] = { holder: 'corve', name: 'Corve', since: 0, from: 'corve' }
    const g = run(above(2, world), { type: 'stairs' }).game
    const corve = holderOf(g, 'corve')
    expect(corve?.as).toBe('hollin')
    expect(corve?.maxHp).toBe(spawn('hollin', 0, 0, 2, 99).maxHp)
    const home = run(above(10), { type: 'stairs' }).game
    expect(holderOf(home, 'corve')?.as).toBe('corve')
  })

  it('are known by name from the first, as the canon names them', () => {
    const g = gameOn(ROOM, 2)
    const m = put(g, 'hollin', 6, 1)
    expect(monsterName(g, m)).toBe(
      `${holders.hollin.name} ${holders.hollin.epithet}`,
    )
  })

  it('do not wait at a hold that is yours, or one taken this run', () => {
    const yours = run(above(2, withTaken(firstWorld(), [1], 'Hild')), {
      type: 'stairs',
    }).game
    expect(holderOf(yours, 'hollin')).toBeUndefined()
    const taken = above(2)
    taken.taken = [1]
    expect(
      holderOf(run(taken, { type: 'stairs' }).game, 'hollin'),
    ).toBeUndefined()
    const noWorld = above(2)
    delete noWorld.world
    expect(
      holderOf(run(noWorld, { type: 'stairs' }).game, 'hollin'),
    ).toBeUndefined()
  })

  it('say who they are the first time they see you, and only then', () => {
    const g = gameOn(ROOM, 2)
    put(g, 'hollin', 6, 1)
    const out = run(g, wait, wait, wait)
    const said = out.lines.filter((l) => l.startsWith('Hollin: '))
    expect(said).toHaveLength(1)
    expect(pools.hollin.some((q) => said[0]?.includes(q))).toBe(true)
  })

  it('give way when beaten to a third, and the hold is yours', () => {
    const g = gameOn(ROOM, 2)
    g.world = firstWorld()
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.might = 6
    const m = put(g, 'hollin', 5, 1)
    m.hp = Math.floor(m.maxHp / 3) + 2
    const out = fight(g, east, (x) => (x.taken ?? []).length > 0)
    expect(out.game.taken).toEqual([1])
    const her = holderOf(out.game, 'hollin')
    expect(her?.hp).toBeGreaterThan(0)
    expect(her?.peaceful).toBe(true)
    expect(
      out.lines.some((l) => l.includes(pools['hollin-yields'][0] ?? '?')),
    ).toBe(true)
    expect(out.lines.some((l) => l.includes(HOLD_TITLES[1]))).toBe(true)
    expect(
      out.lines.some((l) => pools['title-won'].some((q) => l.includes(q))),
    ).toBe(true)
    const by = run(out.game, east)
    expect(by.lines[0]).toContain('stands aside')
    expect(by.game.taken).toEqual([1])
  })

  it('take the hold as well when one is killed outright', () => {
    const g = gameOn(ROOM, 2)
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.might = 40
    put(g, 'hollin', 5, 1)
    expect(
      fight(g, east, (x) => (x.taken ?? []).length > 0).game.taken,
    ).toEqual([1])
  })

  it('make you the Linelord once you hold more than Jarn, and he says so', () => {
    const g = gameOn(ROOM, 2)
    g.world = withTaken(firstWorld(), [4], 'Hild')
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.might = 40
    put(g, 'hollin', 5, 1)
    const out = fight(g, east, (x) => (x.taken ?? []).length > 0)
    expect(out.lines).toContain(`Jarn: "${pools['linelord-won'][0]}"`)
  })

  it('Grue names his price: paid, he lets you by and keeps the Lowstreets', () => {
    const g = gameOn(ROOM, 5)
    g.world = firstWorld()
    g.player.marks = 100
    put(g, 'grue', 5, 1)
    const asked = run(g, east)
    expect(asked.game.prompt?.kind).toBe('tithe')
    const paid = run(asked.game, { type: 'answer', yes: true })
    expect(paid.game.player.marks).toBe(90)
    expect(holderOf(paid.game, 'grue')?.peaceful).toBe(true)
    const by = run(paid.game, east)
    expect(by.game.player.x).toBe(5)
    expect(by.game.taken ?? []).toEqual([])
  })

  it('Sethra lets you pass, until you raise a hand to her', () => {
    const g = gameOn(ROOM, 8)
    g.player.hp = 500
    g.player.maxHp = 500
    put(g, 'sethra', 5, 1)
    const waited = run(g, wait, wait, wait, wait)
    expect(waited.lines.some((l) => l.includes('hits you'))).toBe(false)
    const struck = run(waited.game, east)
    expect(struck.lines.some((l) => /^You (hit|miss)/.test(l))).toBe(true)
    expect(holderOf(struck.game, 'sethra')?.peaceful).toBe(false)
  })

  it('pay you at the start of a run for what you hold', () => {
    const g = newGame({
      name: 'Hild',
      bg: 'ashborn',
      seed: 1,
      world: withTaken(firstWorld(), [1], 'Hild'),
    })
    expect(g.player.marks).toBe(50)
    expect(g.world?.holds[1].holder).toBe('you')
    expect(g.taken).toEqual([])
  })
})

describe('your wrack', () => {
  const wracked = (depth: number) => {
    const g = gameOn(['#####', '#<@>#', '#####'], depth - 1)
    g.player.x = 3
    g.world = {
      ...firstWorld(),
      wrack: [
        {
          id: 4,
          name: 'Ulf',
          depth,
          weapon: 'axe',
          armour: 'mail',
          marks: 30,
          level: 3,
        },
      ],
    }
    return g
  }

  it('stands on the floor where it fell, with your old name on it', () => {
    const g = run(wracked(3), { type: 'stairs' }).game
    const m = g.level.monsters.find((x) => x.kind === 'wrack')
    expect(m?.wrack?.id).toBe(4)
    expect(m && monsterName(g, m)).toBe('the wrack of Ulf')
    expect(
      run(wracked(4), { type: 'stairs' }).game.level.monsters.some(
        (x) => x.kind === 'wrack' && x.wrack?.depth !== 4,
      ),
    ).toBe(false)
  })

  it('is not there once this run has taken it back', () => {
    const g = wracked(3)
    g.cleared = [4]
    expect(
      run(g, { type: 'stairs' }).game.level.monsters.some(
        (x) => x.kind === 'wrack',
      ),
    ).toBe(false)
  })

  it('is met with a word from Sarn, and gives back what it carried when it goes down', () => {
    const g = gameOn(ROOM, 3)
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.might = 40
    const m = put(g, 'wrack', 6, 1)
    m.wrack = {
      id: 4,
      name: 'Ulf',
      depth: 3,
      weapon: 'axe',
      armour: 'mail',
      marks: 30,
      level: 3,
    }
    const seen = run(g, wait)
    expect(seen.lines.some((l) => pools.wrack.some((q) => l.includes(q)))).toBe(
      true,
    )
    const out = fight(seen.game, east, (x) => (x.cleared ?? []).length > 0)
    expect(out.game.cleared).toEqual([4])
    const kinds = out.game.level.items.map((i) => i.item.kind)
    expect(kinds).toContain('axe')
    expect(kinds).toContain('mail')
    expect(
      out.game.level.items.find((i) => i.item.kind === 'marks')?.item.amount,
    ).toBe(30)
  })
})

describe('old iron and new', () => {
  it('lies on the floors of Kell as old iron, and nothing else does', () => {
    let n = 1
    for (let seed = 1; seed <= 30; seed++) {
      const level = generate(1 + (seed % 9), makeRng(seed), () => n++)
      for (const { item } of level.items) {
        const use = ITEMS[item.kind]?.use
        expect(item.old === true).toBe(use === 'weapon' || use === 'armour')
      }
    }
  })

  it('is called what it is: Kell iron, worn, or blunt', () => {
    const g = gameOn(ROOM, 1)
    expect(itemName(g, { kind: 'axe', old: true })).toBe('an axe (Kell iron)')
    expect(itemName(g, { kind: 'axe', wear: 6 })).toBe('an axe (worn)')
    expect(itemName(g, { kind: 'axe', wear: 0 })).toBe('an axe (blunt)')
    expect(itemName(g, { kind: 'mail', wear: 0 })).toBe(
      'mail with the dye scrubbed out (split)',
    )
    expect(itemName(g, { kind: 'axe' })).toBe('an axe')
  })

  it('keeps out a little less when it is old, and nothing once new iron has split', () => {
    const g = gameOn(ROOM, 1)
    expect(armourClass(g)).toBe(12)
    g.player.oldArmour = true
    expect(armourClass(g)).toBe(11)
    g.player.oldArmour = false
    g.player.fit = 0
    expect(armourClass(g)).toBe(10)
  })

  it('carries its age and its wear from the pack to the hand and back', () => {
    const g = gameOn(ROOM, 1)
    g.player.edge = 4
    g.player.pack = [{ kind: 'axe', old: true }]
    const out = run(g, { type: 'use', index: 0 }).game
    expect(out.player.weapon).toBe('axe')
    expect(out.player.oldWeapon).toBe(true)
    expect(out.player.edge).toBe(8)
    expect(out.player.pack).toEqual([{ kind: 'knife', wear: 4 }])
    const back = run(out, { type: 'use', index: 0 }).game
    expect(back.player.edge).toBe(4)
    expect(back.player.oldWeapon).toBe(false)
    expect(back.player.pack).toEqual([{ kind: 'axe', old: true }])
  })

  it('dulls new iron with use until it is blunt, and leaves old iron as it was', () => {
    const blunted = (old: boolean) => {
      let g = gameOn(ROOM, 1)
      g.player.hp = 9999
      g.player.maxHp = 9999
      g.player.might = 30
      g.player.oldWeapon = old
      const lines: string[] = []
      for (let i = 0; i < 80 && (g.player.edge ?? 8) > 0; i++) {
        g.level.monsters = []
        put(g, 'picker', 5, 1)
        const out = fight(g, east, (x) =>
          x.level.monsters.every((m) => m.hp <= 0),
        )
        g = out.game
        g.player.x = 4
        lines.push(...out.lines)
      }
      return { edge: g.player.edge ?? 8, lines }
    }
    const fresh = blunted(false)
    expect(fresh.edge).toBe(0)
    expect(fresh.lines.some((l) => l.includes('is blunt'))).toBe(true)
    expect(blunted(true).edge).toBe(8)
  })

  it('wears new armour thin under blows', () => {
    let g = gameOn(ROOM, 1)
    g.player.hp = 9999
    g.player.maxHp = 9999
    put(g, 'picker', 5, 1).awake = true
    for (let i = 0; i < 400 && (g.player.fit ?? 8) > 0; i++)
      g = act(g, wait).game
    expect(g.player.fit).toBe(0)
  })

  it('has Barr put an edge back on, and mend what has split, for marks', () => {
    const g = gameOn(ROOM, 0)
    g.shop = 'barr'
    g.player.marks = 100
    g.player.edge = 0
    g.player.fit = 4
    const sharpen = offers(g).find((o) => o.key === 'mend:weapon')
    const mend = offers(g).find((o) => o.key === 'mend:armour')
    expect(sharpen?.price).toBe(18)
    expect(mend?.price).toBe(10)
    const out = run(
      g,
      { type: 'shop', key: 'mend:weapon' },
      { type: 'shop', key: 'mend:armour' },
    ).game
    expect(out.player.edge).toBe(8)
    expect(out.player.fit).toBe(8)
    expect(out.player.marks).toBe(72)
    g.player.edge = 8
    g.player.fit = 8
    expect(offers(g).some((o) => o.key.startsWith('mend:'))).toBe(false)
  })
})

describe('the vaults', () => {
  it('lets a Drawn take hold and pull you down the stair', () => {
    const g = gameOn(['#########', '#<@....>#', '#########'], 6)
    g.player.hp = 300
    g.player.maxHp = 300
    put(g, 'drawn', 3, 1).awake = true
    const out = fight(g, wait, (x) => x.depth === 7, 200)
    expect(out.lines.some((l) => l.includes('has hold of you'))).toBe(true)
    expect(out.lines.some((l) => l.includes('draws you along'))).toBe(true)
    expect(out.game.depth).toBe(7)
  })

  it('holds you while it has hold, and a hook cuts the rope', () => {
    const g = gameOn(['#########', '#<@....>#', '#########'], 6)
    const m = put(g, 'drawn', 3, 1)
    g.player.held = m.id
    const held = run(g, west)
    expect(held.lines[0]).toContain('The rope holds you')
    g.player.weapon = 'hook'
    const cut = run(g, east)
    expect(cut.lines[0]).toContain('You cut the rope')
    expect(cut.game.player.held).toBeNull()
    g.player.weapon = 'knife'
    const hit = run(g, east)
    expect(hit.lines[0]).toMatch(/You (hit|miss)|goes down/)
  })

  it('cuts nine notches, and the ninth brings the rope', () => {
    const g = gameOn(['#########', '#<@..n.>#', '#########'], 7)
    g.player.hp = 300
    g.player.maxHp = 300
    put(g, 'notcher', 5, 1)
    const out = fight(g, wait, (x) => x.depth === 8, 30)
    expect(out.lines.some((l) => l.includes('(9)'))).toBe(true)
    expect(out.lines.some((l) => l.includes('The ninth notch'))).toBe(true)
    expect(out.game.depth).toBe(8)
  })

  it('hangs a weak man at the ninth notch', () => {
    const g = gameOn(['#########', '#<@..n.>#', '#########'], 7)
    g.player.hp = 1
    const m = put(g, 'notcher', 5, 1)
    m.notches = 8
    m.awake = true
    const out = run(g, wait)
    expect(out.game.over?.cause).toContain('hanged by the ninth notch')
  })

  it('stays put on the last floor when the notches run out', () => {
    const g = gameOn(['#########', '#<@..n..#', '#########'], 10)
    g.player.hp = 300
    const m = put(g, 'notcher', 5, 1)
    m.notches = 8
    m.awake = true
    const out = run(g, wait)
    expect(out.game.depth).toBe(10)
    expect(out.game.level.monsters.every((x) => x.notches === 0)).toBe(true)
  })
})

describe('the tide and the grey', () => {
  it('says the right line when the tide turns', () => {
    const g = gameOn(ROOM, 1)
    g.tide = 79
    expect(run(g, wait).lines).toContain(pools['tide-turning'][0] ?? '')
  })

  it('drowns you on low ground at the flood', () => {
    const g = gameOn(ROOM, 1, { elev: 0 })
    g.tide = 116
    g.player.hp = 3
    const out = fight(g, wait, (x) => x.over !== null, 15)
    expect(out.game.over?.cause).toBe('drowned at depth 1')
  })

  it('drowns slowly, a Wrecker slower still, and keeps a Wrecker lamp dry', () => {
    const six = Array.from({ length: 6 }, () => wait)
    const g = gameOn(ROOM, 1, { elev: 0, bg: 'wrecker' })
    g.tide = 102
    const out = run(g, ...six)
    expect(g.player.hp - out.game.player.hp).toBe(1)
    const other = gameOn(ROOM, 1, { elev: 0 })
    other.tide = 102
    const drowning = run(other, ...six)
    expect(other.player.hp - drowning.game.player.hp).toBe(2)
    expect(out.game.player.lamp).toBe(8)
  })

  it('gets the wet into the lamp of anyone else', () => {
    const lines: string[] = []
    for (let seed = 1; seed < 20; seed++) {
      const g = gameOn(ROOM, 1, { elev: 1, seed })
      g.tide = 102
      g.player.hp = 200
      lines.push(
        ...run(g, wait, wait, wait, wait, wait, wait, wait, wait, wait).lines,
      )
    }
    expect(lines).toContain('The wet gets into the lamp. It burns lower.')
  })

  it('lets the grey take things from whoever stands in it', () => {
    const lines: string[] = []
    for (let seed = 1; seed < 15; seed++) {
      const g = gameOn(ROOM, 7, { seed })
      g.tide = 40
      g.known = ['picker']
      g.level.grey.push({ x: 4, y: 1 })
      lines.push(...run(g, ...Array.from({ length: 10 }, () => wait)).lines)
    }
    expect(lines.some((l) => l.startsWith('The grey takes'))).toBe(true)
  })

  it('runs the lamp and the water down, and thirst follows', () => {
    const g = gameOn(ROOM, 1, { seed: 5 })
    g.player.hp = 500
    g.player.maxHp = 500
    g.player.lamp = 4
    g.player.water = 4
    const out = run(g, ...Array.from({ length: 400 }, () => wait))
    expect(out.game.player.lamp).toBe(0)
    expect(out.game.player.water).toBe(0)
    expect(out.lines).toContain('The lamp goes out.')
    expect(out.lines).toContain('Your mouth is salt. You need water.')
  })

  it('kills by thirst in the end', () => {
    const g = gameOn(ROOM, 1)
    g.player.water = 0
    g.player.hp = 1
    g.turn = 24
    expect(run(g, wait).game.over?.cause).toBe('died of thirst at depth 1')
  })

  it('heals with water, and not without', () => {
    const g = gameOn(ROOM, 1)
    g.player.hp = 5
    expect(
      run(g, ...Array.from({ length: 12 }, () => wait)).game.player.hp,
    ).toBeGreaterThan(5)
  })

  it('holds the stream with will, during the flood only', () => {
    const g = gameOn(ROOM, 1)
    expect(run(g, { type: 'stop' }).lines[0]).toContain(
      'Nothing here is flowing',
    )
    g.tide = 95
    expect(run(g, { type: 'stop' }).lines[0]).toContain('takes 3 will')
    g.player.will = 3
    const held = run(g, { type: 'stop' })
    expect(held.game.held).toBe(14)
    expect(held.game.tide).toBe(95)
    held.game.held = 1
    expect(run(held.game, wait).lines).toContain(
      'You let the stream go. It goes.',
    )
  })

  it('reports the tide, and dims the lamp in the grey', () => {
    const g = gameOn(ROOM, 7)
    g.tide = 105
    expect(tideReport(g)).toEqual({ phase: 'flood', water: 2 })
    g.tide = 40
    expect(lightRadius(g)).toBe(6)
    g.level.grey.push({ x: 4, y: 1 })
    expect(lightRadius(g)).toBe(5)
    g.player.lamp = 0
    expect(lightRadius(g)).toBe(1)
    g.player.pack.push({ kind: 'sarn-lamp' })
    expect(lightRadius(g)).toBe(5)
    expect(lightRadius(newGame({ name: 'H', bg: 'ashborn', seed: 1 }))).toBe(99)
  })

  it('shrinks a resource die on a 1 or a 2', () => {
    const rng = makeRng(1)
    const results = new Set(Array.from({ length: 50 }, () => rollDie(rng, 8)))
    expect(results).toEqual(new Set([8, 6]))
    expect(rollDie(rng, 0)).toBe(0)
  })
})

describe('names', () => {
  it('names a creature in the field with will, cheaper for a Novice', () => {
    const g = gameOn(ROOM, 1)
    expect(run(g, { type: 'name', dir: 'e' }).lines[0]).toContain(
      'nothing there',
    )
    put(g, 'picker', 5, 1)
    expect(run(g, { type: 'name', dir: 'e' }).lines[0]).toContain(
      'takes 2 will',
    )
    g.player.will = 2
    const named = run(g, { type: 'name', dir: 'e' })
    expect(named.game.known).toContain('picker')
    expect(named.lines[0]).toContain('It is a Picker')
    expect(run(named.game, { type: 'name', dir: 'e' }).lines[0]).toContain(
      'already',
    )
    const novice = gameOn(ROOM, 1, { bg: 'novice' })
    put(novice, 'picker', 5, 1)
    expect(run(novice, { type: 'name', dir: 'e' }).game.player.will).toBe(3)
  })
})

describe('Sarn', () => {
  it('offers, and every gift is a theft', () => {
    const takings = new Set<string>()
    for (let seed = 1; seed < 60; seed++) {
      const g = gameOn(
        ['#################', '#<@S...........>#', '#################'],
        3,
        { seed },
      )
      g.player.pack = [{ kind: 'axe' }]
      g.player.lamp = 0
      g.known = ['picker']
      g.level.seen = g.level.seen.map(() => true)
      const offered = run(g, east)
      expect(offered.game.prompt?.kind).toBe('gift')
      const taken = run(offered.game, { type: 'answer', yes: true })
      const p = taken.game.player
      expect(at(taken.game.level, 3, 1)).toBe('.')
      expect(taken.game.offered).toEqual([3])
      if (p.maxHp < 16) takings.add('maxhp')
      if (taken.game.known.length === 0) takings.add('names')
      if (taken.game.level.seen.filter(Boolean).length < 20) takings.add('map')
      if (!p.pack.some((i) => i.kind === 'axe')) takings.add('item')
      if (p.grey === 2) takings.add('grey')
    }
    expect([...takings].sort()).toEqual([
      'grey',
      'item',
      'map',
      'maxhp',
      'names',
    ])
  })

  it('gives a purse, a blade or a lamp', () => {
    const gifts = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      const g = gameOn(['#######', '#<@S.>#', '#######'], 3, { seed })
      g.player.pack = []
      const out = run(g, east, { type: 'answer', yes: true })
      if (out.game.player.marks > 100) gifts.add('purse')
      for (const i of out.game.player.pack) gifts.add(i.kind)
    }
    expect([...gifts].sort()).toEqual(['purse', 'sarn-blade', 'sarn-lamp'])
  })

  it('takes a second grey mark when there is nothing worth stealing', () => {
    let found = false
    for (let seed = 1; seed < 80 && !found; seed++) {
      const g = gameOn(['#######', '#<@S.>#', '#######'], 3, { seed })
      g.player.pack = []
      const out = run(g, east, { type: 'answer', yes: true })
      const sarnOnly = out.game.player.pack.every((i) =>
        i.kind.startsWith('sarn'),
      )
      if (sarnOnly && out.game.player.grey === 1) found = true
    }
    expect(found).toBe(true)
  })

  it('lets you refuse', () => {
    const g = gameOn(['#######', '#<@S.>#', '#######'], 3)
    const out = run(g, east, { type: 'answer', yes: false })
    expect(out.lines.at(-1)).toContain('Refuse, then')
    expect(out.game.player.pack).toHaveLength(2)
  })
})

describe('the ways a run ends', () => {
  const HALL = ['#######', '#^@._K#', '#<....#', '#######']

  it('takes the ledger, and climbs out through the roof at low water', () => {
    const g = gameOn(HALL, 10)
    g.level.items.push({ x: 4, y: 1, item: { kind: 'ledger' } })
    const noLedger = run(g, west)
    expect(noLedger.lines.join(' ')).toContain(
      'You came down here for something',
    )
    const got = run(g, east, east, { type: 'get' })
    expect(got.lines.join(' ')).toContain('held the drain, days still counting')
    expect(at(got.game.level, 4, 1)).toBe('.')
    got.game.tide = 100
    const flooded = run(got.game, west, west, west)
    expect(flooded.lines.join(' ')).toContain('The water is over the gap')
    flooded.game.tide = 10
    const out = run(flooded.game, east, west)
    expect(out.game.over?.ending).toBe('escaped')
    expect(pools.escape).toContain(out.lines.at(-1) ?? '')
  })

  it('makes you one of the Unasked at six grey marks', () => {
    const g = gameOn(ROOM, 4)
    g.player.grey = 5
    g.player.pack = [{ kind: 'vial-black' }]
    const out = run(g, { type: 'use', index: 0 })
    expect(out.game.over?.ending).toBe('unasked')
    expect(pools.unasked).toContain(out.lines.at(-1) ?? '')
  })
})

describe('Wrackhead', () => {
  function atShop(digit: string, setup?: (g: Game) => void) {
    const g = newGame({ name: 'Hild', bg: 'ashborn', seed: 3 })
    const y = g.level.tiles.findIndex((r) => r.includes(digit))
    const x = g.level.tiles[y]?.indexOf(digit) ?? 0
    g.player.x = x
    g.player.y = y - 1
    setup?.(g)
    return run(g, { type: 'move', dir: 's' })
  }

  it('opens a shop by its door, and leaves it by walking or saying so', () => {
    const forge = atShop('1')
    expect(forge.game.shop).toBe('barr')
    expect(forge.lines[0]).toBe("Barr's forge.")
    expect(run(forge.game, { type: 'leave' }).game.shop).toBeNull()
    const out = run(forge.game, { type: 'move', dir: 'n' })
    expect(out.game.shop).toBeNull()
    expect(out.game.player.y).toBe(forge.game.player.y - 1)
  })

  it('sells at the forge, and buys back at a third', () => {
    const forge = atShop('1', (g) => {
      g.player.pack = [{ kind: 'axe' }, { kind: 'ring' }]
    })
    const list = offers(forge.game)
    expect(list.find((o) => o.key === 'buy:axe')?.enabled).toBe(false)
    expect(list.find((o) => o.key === 'buy:knife')?.enabled).toBe(true)
    const bought = run(forge.game, { type: 'shop', key: 'buy:knife' })
    expect(bought.game.player.marks).toBe(22)
    expect(bought.game.player.pack.at(-1)?.kind).toBe('knife')
    const sold = run(forge.game, { type: 'shop', key: 'sell:0' })
    expect(sold.game.player.marks).toBe(42)
    expect(sellPrice(forge.game, { kind: 'ring' })).toBe(6)
    forge.game.known.push('ring')
    expect(sellPrice(forge.game, { kind: 'ring' })).toBe(20)
    expect(sellPrice(forge.game, { kind: 'ledger' })).toBe(0)
    expect(
      run(forge.game, { type: 'shop', key: 'buy:axe' }).game.player.marks,
    ).toBe(30)
  })

  it('fills the lamp, the skin and the rope at the net-loft, and sells salt', () => {
    const loft = atShop('2', (g) => {
      Object.assign(g.player, { lamp: 0, water: 0, rope: 0 })
    })
    const out = run(
      loft.game,
      { type: 'shop', key: 'buy:oil' },
      { type: 'shop', key: 'buy:skin' },
      { type: 'shop', key: 'buy:coil' },
      { type: 'shop', key: 'buy:salt' },
    )
    expect(out.game.player.lamp).toBe(8)
    expect(out.game.player.water).toBe(8)
    expect(out.game.player.rope).toBe(8)
    expect(out.game.player.pack.filter((i) => i.kind === 'salt')).toHaveLength(
      2,
    )
    expect(out.game.player.marks).toBe(30 - 6 - 4 - 8 - 5)
  })

  it('has Ruun name what you carry and what you have killed', () => {
    const ruun = atShop('3', (g) => {
      g.player.pack = [{ kind: 'vial-cloud' }, { kind: 'knife' }]
      g.player.slain = ['picker']
    })
    expect(offers(ruun.game).map((o) => o.key)).toEqual([
      'name:vial-cloud',
      'name:picker',
    ])
    const out = run(
      ruun.game,
      { type: 'shop', key: 'name:vial-cloud' },
      { type: 'shop', key: 'name:picker' },
    )
    expect(out.game.known).toEqual(['vial-cloud', 'picker'])
    expect(out.game.player.marks).toBe(5)
    expect(offers(out.game)).toEqual([])
  })

  it('trades with Mardra once a visit, and she takes something', () => {
    const takes = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      const mardra = atShop('4', (g) => {
        g.seed = seed
        g.player.pack = [{ kind: 'vial-salt' }]
        g.known = ['picker']
      })
      const out = run(mardra.game, { type: 'shop', key: 'trade' })
      expect(out.game.known).toContain('vial-salt')
      expect(out.game.traded).toBe(true)
      expect(offers(out.game)[0]?.enabled).toBe(false)
      const p = out.game.player
      if (p.maxHp < 16) takes.add('strength')
      if (p.lamp === 4) takes.add('light')
      if (p.grey === 1) takes.add('grey')
      if (!out.game.known.includes('picker')) takes.add('a name')
    }
    expect([...takes].sort()).toEqual(['a name', 'grey', 'light', 'strength'])
  })

  it('takes an offering on the salt-pile, once', () => {
    const pile = atShop('5')
    const out = run(pile.game, { type: 'shop', key: 'offer:0' })
    expect(out.game.player.owed).toBe(true)
    expect(out.game.player.pack).toHaveLength(1)
    expect(offers(out.game)).toEqual([])
  })

  it('has Tolm apologise at the fort door, and Rauk say how', () => {
    const fort = atShop('6')
    expect(pools.tithe.some((t) => fort.lines[1]?.includes(t))).toBe(true)
    expect(offers(fort.game)).toEqual([])
    const rauk = atShop('7')
    const asked = run(rauk.game, { type: 'shop', key: 'ask' })
    expect(pools.advice.some((a) => asked.lines[0]?.includes(a))).toBe(true)
  })

  it('ignores an offer that is not on the counter', () => {
    const forge = atShop('1')
    expect(
      run(forge.game, { type: 'shop', key: 'buy:sarn-blade' }).game.player
        .marks,
    ).toBe(30)
    expect(
      run(forge.game, { type: 'shop', key: 'sell:9' }).game.player.marks,
    ).toBe(30)
  })

  it('keys what the place offers by number, and what you carry by its letter in the pack', () => {
    const forge = atShop('1', (g) => {
      g.player.pack = Array.from({ length: 12 }, () => ({ kind: 'knife' }))
      g.player.marks = 500
    })
    const list = offers(forge.game)
    expect(
      list.filter((o) => o.key.startsWith('buy:')).map((o) => o.hotkey),
    ).toEqual(['1', '2', '3', '4', '5', '6'])
    const sells = list.filter((o) => o.key.startsWith('sell:'))
    expect(sells).toHaveLength(12)
    expect(sells.map((o) => o.hotkey).join('')).toBe('abcdefghijkl')
    expect(sells[12 - 1]?.key).toBe('sell:11')
    expect(offerFor(forge.game, 'l')?.key).toBe('sell:11')
    expect(offerFor(forge.game, '7')).toBeUndefined()

    const ruun = atShop('3', (g) => {
      g.player.pack = [
        { kind: 'salt' },
        { kind: 'vial-cloud' },
        { kind: 'vial-cloud' },
      ]
      g.player.slain = ['picker', 'drawn']
    })
    expect(offers(ruun.game).map((o) => [o.key, o.hotkey])).toEqual([
      ['name:vial-cloud', 'b'],
      ['name:picker', '1'],
      ['name:drawn', '2'],
    ])

    const pile = atShop('5')
    expect(offers(pile.game).map((o) => o.hotkey)).toEqual(['a', 'b'])
    expect(offers(atShop('4').game)[0]?.hotkey).toBe('1')
    expect(offers(atShop('7').game)[0]?.hotkey).toBe('1')
  })

  it('does not let you drop things on the shingle', () => {
    const g = newGame({ name: 'H', bg: 'ashborn', seed: 1 })
    expect(run(g, { type: 'drop', index: 0 }).game.player.pack).toHaveLength(2)
  })
})

describe('the map you remember', () => {
  it('starts dark below the shingle', () => {
    const g = gameOn(ROOM, 1)
    expect(g.level.seen[index(g.level, 4, 1)]).toBe(false)
  })
})

describe('what using a thing means', () => {
  it('says wield, wear, drink or read, so the pack says what a key will do', () => {
    expect(verbOf({ kind: 'axe' })).toBe('Wield')
    expect(verbOf({ kind: 'mail' })).toBe('Wear')
    expect(verbOf({ kind: 'vial-grey' })).toBe('Drink')
    expect(verbOf({ kind: 'skin' })).toBe('Drink')
    expect(verbOf({ kind: 'oil' })).toBe('Fill lamp')
    expect(verbOf({ kind: 'sarn-lamp' })).toBe('Look')
    expect(verbOf({ kind: 'coil' })).toBe('Coil')
    expect(verbOf({ kind: 'salt' })).toBe('Wash')
    expect(verbOf({ kind: 'page' })).toBe('Read')
    expect(verbOf({ kind: 'ledger' })).toBe('Read')
    expect(verbOf({ kind: 'ring' })).toBe('Look')
    expect(verbOf({ kind: 'nothing' })).toBe('Use')
  })
})
