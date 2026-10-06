/**
 * The rules of the descent, as one function: a game and a command in, a new
 * game and what was said out. Nothing here knows about the page, the keyboard
 * or storage; a run is a value, and `act` is the only way it changes. The
 * game it is given is left alone: `act` works on a copy, and the copy is
 * what it hands back.
 */
import { holders, type Pool, pools } from '../lore'
import {
  BACKGROUNDS,
  GIFTS,
  ITEMS,
  isIron,
  LAST_DEPTH,
  LEVELS,
  MONSTERS,
  needsNaming,
  THEFTS,
  TIERS,
  tierOf,
} from './content'
import { inSight, visible } from './fov'
import {
  HOLD_TITLES,
  holdFloor,
  linelord,
  RIVAL_TIER,
  type Tier,
  tribute,
  type World,
  withTaken,
} from './holds'
import {
  at,
  freeCell,
  generate,
  monsterAt,
  SHOPS,
  set,
  spawn,
  town,
  walkable,
} from './level'
import { makeRng, type Rng } from './rng'
import { floodLevel, greyAt, phase, waterAt } from './tide'
import type {
  Background,
  Bones,
  Command,
  Die,
  Dir,
  Game,
  Item,
  Monster,
  Outcome,
  Pos,
} from './types'

export const PACK = 12
export const GREY_LIMIT = 6

export const DIRS: Record<Dir, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
}

export interface NewRun {
  name: string
  bg: Background
  seed: number
  /** Names learned in earlier runs. */
  known?: string[]
  bones?: Bones | null
  /** Who holds what in Kell as this run goes down. */
  world?: World
}

const say = (rng: Rng, pool: Pool): string => rng.pick(pools[pool])

export function newGame(run: NewRun): Game {
  const bg = BACKGROUNDS[run.bg]
  const level = town()
  const game: Game = {
    seed: run.seed,
    turn: 0,
    depth: 0,
    level,
    player: {
      name: run.name.trim() || 'Nameless',
      bg: run.bg,
      x: level.up.x,
      y: level.up.y,
      hp: bg.hp,
      maxHp: bg.hp,
      xp: 0,
      level: 1,
      might: bg.might,
      will: bg.will,
      grey: 0,
      marks: 30 + (run.world ? tribute(run.world) : 0),
      lamp: 8,
      water: 8,
      rope: bg.rope,
      pack: [{ kind: 'salt' }, { kind: 'oil' }],
      weapon: 'knife',
      armour: 'leather',
      held: null,
      owed: false,
      meaning: false,
      gained: 0,
      deepest: 0,
      slain: [],
    },
    known: [...(run.known ?? [])],
    held: 0,
    prompt: null,
    shop: null,
    offered: [],
    traded: false,
    over: null,
    nextId: 1,
    tide: 0,
  }
  if (run.bones) game.bones = run.bones
  if (run.world) {
    game.world = structuredClone(run.world)
    game.taken = []
  }
  return game
}

// ---------------------------------------------------------------------------
// What things are called
// ---------------------------------------------------------------------------

export function itemName(game: Game, item: Item): string {
  if (item.kind === 'marks') return `${item.amount ?? 0} marks`
  const kind = ITEMS[item.kind]
  if (!kind) return item.kind
  if (kind.unknown && !game.known.includes(item.kind)) return kind.unknown
  if (!isIron(item.kind)) return kind.name
  if (item.old) return `${kind.name} (Kell iron)`
  const wear = item.wear ?? 8
  if (wear === 0)
    return `${kind.name} (${kind.use === 'weapon' ? 'blunt' : 'split'})`
  return wear < 8 ? `${kind.name} (worn)` : kind.name
}

/** The weapon in hand and the armour worn, as things, with their age and wear. */
export function inHand(game: Game): {
  weapon: Item | null
  armour: Item | null
} {
  const p = game.player
  const iron = (
    kind: string | null,
    old?: boolean,
    wear?: Die,
  ): Item | null => {
    if (!kind) return null
    if (old) return { kind, old: true }
    return wear !== undefined && wear < 8 ? { kind, wear } : { kind }
  }
  return {
    weapon: iron(p.weapon, p.oldWeapon, p.edge),
    armour: iron(p.armour, p.oldArmour, p.fit),
  }
}

export function monsterName(game: Game, m: Monster): string {
  const kind = MONSTERS[m.kind]
  if (!kind) return 'something'
  if (kind.holder)
    return `${holders[kind.holder].name} ${holders[kind.holder].epithet}`
  if (m.wrack) return `the wrack of ${m.wrack.name}`
  if (!game.known.includes(m.kind)) return kind.unknown
  return m.bones
    ? `${m.bones.name}, ${kind.known.replace(/^a /, '')}`
    : kind.known
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------------------------------------------------------------------------
// The lamp, the water, the rope
// ---------------------------------------------------------------------------

const STEP: Record<Die, Die> = { 8: 6, 6: 4, 4: 0, 0: 0 }

/** Roll a resource die: a 1 or a 2 and it shrinks. */
export function rollDie(rng: Rng, die: Die): Die {
  if (die === 0) return 0
  return rng.roll(die) <= 2 ? STEP[die] : die
}

const hasSarnLamp = (game: Game) =>
  game.player.pack.some((i) => i.kind === 'sarn-lamp')

/** How far the lamp reaches. Wrackhead is in daylight. */
export function lightRadius(game: Game): number {
  if (game.depth === 0) return 99
  const lamp = hasSarnLamp(game) ? 8 : game.player.lamp
  const base = { 8: 6, 6: 5, 4: 3, 0: 1 }[lamp]
  const p = game.player
  return greyAt(game.level, game.tide, p.x, p.y) ? Math.max(1, base - 1) : base
}

/**
 * What keeps blows out: the armour worn, a point less if it is Kell's iron,
 * and nothing at all once new iron has split.
 */
export function armourClass(game: Game): number {
  const p = game.player
  const ac = ITEMS[p.armour ?? '']?.ac ?? 0
  if (ac === 0 || (!p.oldArmour && p.fit === 0)) return 10
  return 10 + ac - (p.oldArmour ? 1 : 0)
}

/** New iron wears with use: now and then its die is rolled, and a low roll takes some of it. */
const WEAR_CHANCE = 0.15

// ---------------------------------------------------------------------------
// Going up and down
// ---------------------------------------------------------------------------

function travel(
  game: Game,
  rng: Rng,
  depth: number,
  arrive: 'top' | 'bottom',
  lines: string[],
): void {
  const p = game.player
  const fromTier = game.depth === 0 ? 0 : tierOf(game.depth)
  game.depth = depth
  p.held = null
  game.prompt = null
  if (depth === 0) {
    game.level = town()
    p.x = game.level.up.x
    p.y = game.level.up.y
    game.traded = false
    const tax = Math.floor(p.gained / 10)
    p.gained = 0
    lines.push('You come up onto the shingle at Wrackhead.')
    if (tax > 0) {
      p.marks -= tax
      lines.push(`Tolm: "${say(rng, 'tithe')}" The fort takes ${tax} marks.`)
    }
    return
  }
  game.level = generate(depth, rng, () => game.nextId++)
  const at =
    arrive === 'top' ? game.level.up : (game.level.down ?? game.level.up)
  p.x = at.x
  p.y = at.y
  p.deepest = Math.max(p.deepest, depth)
  const tier = tierOf(depth)
  if (tier !== fromTier) lines.push(`${TIERS[tier].name}.`)
  lines.push(say(rng, TIERS[tier].pool))
  if (game.bones && tier === 2) {
    const cell = freeCell(game.level, rng)
    const m = spawn('unasked', cell.x, cell.y, depth, game.nextId++)
    m.bones = { name: game.bones.name, weapon: game.bones.weapon }
    m.hp += 6
    m.maxHp += 6
    game.level.monsters.push(m)
    delete game.bones
  }
  placeHolder(game, rng, tier)
  placeWrack(game, rng)
}

/** The wrack of earlier runs stands where each fell, until it is taken back. */
function placeWrack(game: Game, rng: Rng): void {
  for (const w of game.world?.wrack ?? []) {
    if (w.depth !== game.depth || (game.cleared ?? []).includes(w.id)) continue
    const cell = freeCell(game.level, rng)
    const m = spawn('wrack', cell.x, cell.y, game.depth, game.nextId++)
    m.hp += 2 * w.level
    m.maxHp += 2 * w.level
    m.wrack = w
    game.level.monsters.push(m)
  }
}

/**
 * On the last floor of a depth its holder waits, by the stair down, or in the
 * hall by the ledger: unless the hold is yours, or this run has taken it.
 */
function placeHolder(game: Game, rng: Rng, tier: Tier): void {
  const claim = game.world?.holds[tier]
  if (!claim || claim.holder === 'you') return
  if (game.depth !== holdFloor(tier) || (game.taken ?? []).includes(tier))
    return
  const level = game.level
  const ledger = level.items.find((i) => i.item.kind === 'ledger')
  const by = level.down ?? ledger ?? level.up
  const free = (x: number, y: number) =>
    at(level, x, y) === '.' &&
    !monsterAt(level, x, y) &&
    !level.items.some((i) => i.x === x && i.y === y) &&
    !(game.player.x === x && game.player.y === y)
  const cell =
    Object.values(DIRS)
      .map(([dx, dy]) => ({ x: by.x + dx, y: by.y + dy }))
      .find((c) => free(c.x, c.y)) ?? freeCell(level, rng)
  const m = spawn(claim.holder, cell.x, cell.y, game.depth, game.nextId++)
  // Who they are goes with them; how hard they fight is the depth's.
  const as = TIER_RIVAL[tier]
  const numbers = spawn(as, cell.x, cell.y, game.depth, m.id)
  m.holds = tier
  m.as = as
  m.hp = numbers.hp
  m.maxHp = numbers.maxHp
  level.monsters.push(m)
}

const tierHeld = (t: Tier) => TIERS[t].name.replace(/^The /, 'the ')

/** The old holder of each depth, whose numbers whoever holds it fights with. */
const TIER_RIVAL = Object.fromEntries(
  Object.entries(RIVAL_TIER).map(([rival, tier]) => [tier, rival]),
) as Record<Tier, string>

/** A hold goes to this run: the ledger says so, and so may Jarn. */
function takeHold(game: Game, rng: Rng, tier: Tier, lines: string[]): void {
  const taken = game.taken ?? []
  if (taken.includes(tier)) return
  const name = game.player.name
  const before = game.world && linelord(withTaken(game.world, taken, name)).who
  game.taken = [...taken, tier]
  lines.push(
    `You hold ${tierHeld(tier)}. The ledger calls you ${HOLD_TITLES[tier]}.`,
  )
  lines.push(say(rng, 'title-won'))
  if (
    game.world &&
    before !== 'you' &&
    linelord(withTaken(game.world, game.taken, name)).who === 'you'
  )
    lines.push(`Jarn: "${pools['linelord-won'][0]}"`)
}

/** Beaten to a third, a holder gives way, and gives up the hold. */
function giveWay(game: Game, rng: Rng, m: Monster, lines: string[]): void {
  const rival = MONSTERS[m.kind]?.holder
  if (!rival) return
  m.yielded = true
  m.peaceful = true
  m.refused = true
  lines.push(`${holders[rival].name}: "${say(rng, `${rival}-yields` as Pool)}"`)
  takeHold(game, rng, m.holds ?? RIVAL_TIER[rival], lines)
}

// ---------------------------------------------------------------------------
// Fighting
// ---------------------------------------------------------------------------

function gainXp(game: Game, amount: number, lines: string[], rng: Rng): void {
  const p = game.player
  p.xp += amount
  for (;;) {
    const next = LEVELS[p.level]
    if (next === undefined || p.xp < next) break
    p.level++
    const gain = Math.max(1, rng.roll(BACKGROUNDS[p.bg].grit))
    p.maxHp += gain
    p.hp += gain
    lines.push(`You are level ${p.level} now.`)
  }
}

function kill(game: Game, rng: Rng, m: Monster, lines: string[]): void {
  const kind = MONSTERS[m.kind]
  m.hp = 0
  lines.push(`${cap(monsterName(game, m))} goes down.`)
  if (kind?.holder)
    takeHold(game, rng, m.holds ?? RIVAL_TIER[kind.holder], lines)
  if (!game.player.slain.includes(m.kind)) game.player.slain.push(m.kind)
  const xp = MONSTERS[m.as ?? m.kind]?.xp ?? 1
  gainXp(game, xp * (1 + Math.floor(game.depth / 2)), lines, rng)
  const drop = (item: Item) => game.level.items.push({ x: m.x, y: m.y, item })
  if (m.bones?.weapon) drop({ kind: m.bones.weapon })
  if (m.wrack) {
    const w = m.wrack
    if (w.weapon) drop({ kind: w.weapon })
    if (w.armour) drop({ kind: w.armour })
    if (w.marks > 0) drop({ kind: 'marks', amount: w.marks })
    game.cleared = [...(game.cleared ?? []), w.id]
    lines.push(`What ${w.name} carried is yours again.`)
  }
  if (m.kind === 'picker')
    drop({ kind: 'marks', amount: rng.dice(1, 6) * (1 + game.depth) })
  if (m.kind === 'firstcloak' && rng.chance(0.35))
    drop(
      tierOf(game.depth) >= 3
        ? { kind: 'cloakmail', old: true }
        : { kind: 'token' },
    )
}

function playerAttack(game: Game, rng: Rng, m: Monster, lines: string[]): void {
  const p = game.player
  const weapon = ITEMS[p.weapon ?? '']
  const known = game.known.includes(m.kind)
  const kind = MONSTERS[m.kind]
  m.awake = true
  if (m.kind === 'firstcloak') m.refused = true
  if (kind?.waits && !m.yielded) m.peaceful = false
  if (m.kind === 'drawn' && p.held === m.id && weapon?.cuts) {
    p.held = null
    lines.push(
      'You cut the rope. It goes slack, and what was on it drifts off toward the hall.',
    )
    kill(game, rng, m, lines)
    return
  }
  const bonus = p.level + p.might + (weapon?.bonus ?? 0) + (known ? 2 : 0)
  let roll = rng.roll(20)
  if (p.meaning) {
    roll = Math.max(roll, rng.roll(20))
    p.meaning = false
    p.grey++
    p.will++
    lines.push(
      'You mean it. Something grey goes into the blow, and stays in you.',
    )
  }
  if (roll + bonus < (MONSTERS[m.as ?? m.kind]?.ac ?? 10)) {
    lines.push(`You miss ${monsterName(game, m)}.`)
    return
  }
  const [count, sides] = weapon?.dmg ?? [1, 2]
  let cut = rng.dice(count, sides)
  if (p.oldWeapon) cut = Math.max(1, cut - 1)
  else if (p.edge === 0) cut = Math.ceil(cut / 2)
  const dmg = cut + Math.floor(p.might / 2) + (known ? 1 : 0)
  m.hp -= dmg
  if (p.weapon && isIron(p.weapon) && !p.oldWeapon && rng.chance(WEAR_CHANCE)) {
    const edge = rollDie(rng, p.edge ?? 8)
    if (edge !== (p.edge ?? 8))
      lines.push(
        edge === 0
          ? `${cap(ITEMS[p.weapon]?.name ?? 'Your weapon')} is blunt. Barr can put an edge back on it.`
          : `${cap(ITEMS[p.weapon]?.name ?? 'Your weapon')} loses some of its edge.`,
      )
    p.edge = edge
  }
  if (m.hp <= 0) {
    kill(game, rng, m, lines)
    return
  }
  lines.push(`You hit ${monsterName(game, m)}.`)
  if (kind?.holder && !m.yielded && m.hp * 3 <= m.maxHp)
    giveWay(game, rng, m, lines)
}

function monsterAttack(
  game: Game,
  rng: Rng,
  m: Monster,
  lines: string[],
): void {
  const kind = MONSTERS[m.kind]
  if (!kind || kind.counts) return
  const p = game.player
  const numbers = MONSTERS[m.as ?? m.kind] ?? kind
  const hit = numbers.hit + Math.floor(game.depth / 3)
  const name = cap(monsterName(game, m))
  if (rng.roll(20) + hit < armourClass(game)) {
    lines.push(`${name} misses.`)
    return
  }
  const [count, sides] = ITEMS[m.wrack?.weapon ?? '']?.dmg ?? numbers.dmg
  const dmg = rng.dice(count, sides)
  p.hp -= dmg
  lines.push(`${name} hits you.`)
  if (p.armour && isIron(p.armour) && !p.oldArmour && rng.chance(WEAR_CHANCE)) {
    const fit = rollDie(rng, p.fit ?? 8)
    if (fit !== (p.fit ?? 8))
      lines.push(
        fit === 0
          ? `${cap(ITEMS[p.armour]?.name ?? 'Your armour')} splits. Barr can mend it.`
          : `${cap(ITEMS[p.armour]?.name ?? 'Your armour')} gives a little.`,
      )
    p.fit = fit
  }
  if (kind.grabs && p.held === null) {
    p.held = m.id
    lines.push('It has hold of you. The rope pulls toward the hall.')
  }
  if (kind.steals && p.marks > 0) {
    const taken = Math.min(p.marks, rng.dice(2, 6))
    p.marks -= taken
    lines.push(`It takes ${taken} marks.`)
  }
  if (p.hp <= 0)
    dying(
      game,
      rng,
      `killed by ${monsterName(game, m)} at depth ${game.depth}`,
      lines,
    )
}

// ---------------------------------------------------------------------------
// Dying, and the ways out of it
// ---------------------------------------------------------------------------

function dying(game: Game, rng: Rng, cause: string, lines: string[]): void {
  const p = game.player
  if (game.over || p.hp > 0) return
  if (p.owed) {
    p.owed = false
    p.hp = Math.ceil(p.maxHp / 2)
    p.held = null
    p.x = game.level.up.x
    p.y = game.level.up.y
    lines.push(pools['salt-pile'][1] ?? 'The sea gives you back.')
    return
  }
  game.over = { ending: 'dead', cause }
  lines.push(say(rng, 'death'))
}

function checkGrey(game: Game, rng: Rng, lines: string[]): void {
  if (game.over || game.player.grey < GREY_LIMIT) return
  game.over = {
    ending: 'unasked',
    cause: `became one of the Unasked at depth ${game.depth}`,
  }
  lines.push(say(rng, 'unasked'))
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

function step(
  m: Pos,
  to: Pos,
  game: Game,
  through: (tile: string) => boolean,
): Pos | null {
  let best: Pos | null = null
  let bestD = (m.x - to.x) ** 2 + (m.y - to.y) ** 2
  for (const [dx, dy] of Object.values(DIRS)) {
    const x = m.x + dx
    const y = m.y + dy
    if (!through(at(game.level, x, y))) continue
    if (monsterAt(game.level, x, y)) continue
    if (game.player.x === x && game.player.y === y) continue
    const d = (x - to.x) ** 2 + (y - to.y) ** 2
    if (d < bestD) {
      bestD = d
      best = { x, y }
    }
  }
  return best
}

const adjacent = (a: Pos, b: Pos) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1

function pickUpMarks(game: Game, lines: string[]): void {
  const p = game.player
  const here = game.level.items.filter((i) => i.x === p.x && i.y === p.y)
  for (const i of here) {
    if (i.item.kind !== 'marks') continue
    const amount = i.item.amount ?? 0
    p.marks += amount
    p.gained += amount
    lines.push(`You pick up ${amount} marks.`)
  }
  game.level.items = game.level.items.filter(
    (i) => !(i.x === p.x && i.y === p.y && i.item.kind === 'marks'),
  )
  const rest = game.level.items.filter((i) => i.x === p.x && i.y === p.y)
  if (rest.length === 1 && rest[0])
    lines.push(`There is ${itemName(game, rest[0].item)} here.`)
  else if (rest.length > 1) lines.push(`There are ${rest.length} things here.`)
}

function openDoor(
  game: Game,
  rng: Rng,
  x: number,
  y: number,
  lines: string[],
): void {
  set(game.level, x, y, "'")
  lines.push('You put your shoulder to the door. Whatever held it lets go.')
  const roll = rng.int(10)
  if (roll < 3) {
    const cell = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].find(
      (c) =>
        walkable(at(game.level, c.x, c.y)) &&
        !monsterAt(game.level, c.x, c.y) &&
        !(c.x === game.player.x && c.y === game.player.y),
    )
    if (cell) {
      const m = spawn('unasked', cell.x, cell.y, game.depth, game.nextId++)
      m.awake = true
      game.level.monsters.push(m)
      lines.push(`${cap(monsterName(game, m))} comes through it.`)
    }
  } else if (roll < 5) {
    game.level.grey.push({ x, y })
    lines.push('Grey comes out past the door, slow, like breath.')
  }
}

function roof(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  if (!p.pack.some((i) => i.kind === 'ledger')) {
    lines.push(
      'Light, through a gap in the iron. You came down here for something.',
    )
    return
  }
  const ph = phase(game.tide)
  if (ph === 'turning' || ph === 'flood') {
    lines.push('The water is over the gap. Wait for low water.')
    return
  }
  game.over = {
    ending: 'escaped',
    cause: `came up through the roof with the ledger on turn ${game.turn}`,
  }
  lines.push(say(rng, 'escape'))
}

function move(game: Game, rng: Rng, dir: Dir, lines: string[]): boolean {
  const p = game.player
  const [dx, dy] = DIRS[dir]
  const x = p.x + dx
  const y = p.y + dy
  const m = monsterAt(game.level, x, y)
  if (p.held !== null) {
    const holder = game.level.monsters.find((h) => h.id === p.held)
    if (m && holder && m.id === holder.id) {
      playerAttack(game, rng, m, lines)
      return true
    }
    lines.push('The rope holds you. Cut it, or hit what is on it.')
    return true
  }
  if (m) {
    const kind = MONSTERS[m.kind]
    if (m.peaceful && (kind?.tithes || m.yielded)) {
      m.x = p.x
      m.y = p.y
      p.x = x
      p.y = y
      lines.push(
        kind?.holder
          ? `${cap(monsterName(game, m))} stands aside and lets you by.`
          : 'The cloaked shape stands aside, politely, and lets you by.',
      )
      return true
    }
    if (kind?.tithes && !m.refused) {
      game.prompt = { kind: 'tithe', monster: m.id }
      lines.push(
        kind.holder
          ? `${holders[kind.holder].name} holds out a hand. "A tenth." Pay? (y/n)`
          : '"Pardon. A tenth." Pay? (y/n)',
      )
      return false
    }
    playerAttack(game, rng, m, lines)
    return true
  }
  const tile = at(game.level, x, y)
  if (tile === '+') {
    openDoor(game, rng, x, y, lines)
    return true
  }
  if (tile === 'S') {
    const gift = rng.pick(GIFTS)
    game.prompt = { kind: 'gift', gift }
    lines.push(
      `Yellow eyes. "${rng.pick(pools.gift.filter((g) => !g.startsWith('Refuse')))}" Take it? (y/n)`,
    )
    return false
  }
  if (tile === '&') {
    lines.push(
      `Gorvek, in the drain, the stream held still in his hand: "${say(rng, 'drain')}"`,
    )
    return false
  }
  if (tile === 'K') {
    lines.push(
      'The king sits with three empty sockets in his crown. The iron is warm.',
    )
    return false
  }
  if (tile === 'O') {
    lines.push(
      'The drain. The sea is going out through it, and something is holding it from going faster.',
    )
    return false
  }
  if (!walkable(tile)) return false
  p.x = x
  p.y = y
  if (/[1-7]/.test(tile)) {
    enterShop(game, rng, tile, lines)
    return false
  }
  pickUpMarks(game, lines)
  if (tile === '^') roof(game, rng, lines)
  return true
}

// ---------------------------------------------------------------------------
// The things in the pack
// ---------------------------------------------------------------------------

function learn(game: Game, kind: string): void {
  if (!game.known.includes(kind)) game.known.push(kind)
}

function drink(game: Game, rng: Rng, kind: string, lines: string[]): void {
  const p = game.player
  const effect = ITEMS[kind]?.effect
  const unknown = !game.known.includes(kind)
  learn(game, kind)
  if (unknown) lines.push(`It was ${ITEMS[kind]?.name}.`)
  if (effect === 'breath') {
    p.hp = Math.min(p.maxHp, p.hp + 10)
    lines.push('Air, as if you had come up for it.')
  } else if (effect === 'clear') {
    p.lamp = 8
    game.level.seen = game.level.seen.map(() => true)
    lines.push('You see the whole floor at once, every wall of it.')
  } else if (effect === 'will') {
    p.will += 3
    lines.push('Something in you sets, like a stream told to stop.')
  } else if (effect === 'grey') {
    p.grey++
    lines.push('It tastes of ash. The grey goes into you and stays.')
    checkGrey(game, rng, lines)
  } else if (effect === 'mend') {
    p.maxHp += 2
    p.hp = Math.min(p.maxHp, p.hp + 6)
    lines.push('Warm, like the iron of the crown.')
  } else if (effect === 'sea') {
    p.held = null
    p.x = game.level.up.x
    p.y = game.level.up.y
    lines.push('The sea takes you, and puts you down at the foot of the stair.')
  }
}

/** What using a thing does, in a word the pack can put on its button. */
export function verbOf(item: Item): string {
  if (item.kind === 'sarn-lamp') return 'Look'
  const verbs: Record<string, string> = {
    weapon: 'Wield',
    armour: 'Wear',
    oil: 'Fill lamp',
    water: 'Drink',
    rope: 'Coil',
    salt: 'Wash',
    vial: 'Drink',
    page: 'Read',
    ledger: 'Read',
    trinket: 'Look',
  }
  return verbs[ITEMS[item.kind]?.use ?? ''] ?? 'Use'
}

function use(game: Game, rng: Rng, index: number, lines: string[]): boolean {
  const p = game.player
  const item = p.pack[index]
  const kind = item ? ITEMS[item.kind] : undefined
  if (!item || !kind) return false
  const remove = () => p.pack.splice(index, 1)
  switch (kind.use) {
    case 'weapon': {
      remove()
      const held = inHand(game).weapon
      if (held) p.pack.push(held)
      p.weapon = item.kind
      p.oldWeapon = item.old === true
      p.edge = item.old ? 8 : (item.wear ?? 8)
      lines.push(`You take up ${itemName(game, item)}.`)
      return true
    }
    case 'armour': {
      remove()
      const worn = inHand(game).armour
      if (worn) p.pack.push(worn)
      p.armour = item.kind
      p.oldArmour = item.old === true
      p.fit = item.old ? 8 : (item.wear ?? 8)
      lines.push(`You put on ${itemName(game, item)}.`)
      return true
    }
    case 'oil':
      if (item.kind === 'sarn-lamp') {
        lines.push('It is already lit. It always will be.')
        return false
      }
      remove()
      p.lamp = 8
      lines.push('You fill the lamp. It burns grey, but it burns.')
      return true
    case 'water':
      remove()
      p.water = 8
      lines.push('You drink, and fill what you carry.')
      return true
    case 'rope':
      remove()
      p.rope = 8
      lines.push('You coil the new rope over your shoulder.')
      return true
    case 'salt':
      remove()
      p.hp = Math.min(p.maxHp, p.hp + 6)
      lines.push('You wash the wounds with salt. It stings, and then it holds.')
      return true
    case 'vial':
      remove()
      drink(game, rng, item.kind, lines)
      return true
    case 'page':
      remove()
      game.level.seen = game.level.seen.map(() => true)
      lines.push(
        'A page of strokes, one for every day, in a hand that gets worse. On the back, a plan of this floor.',
      )
      return true
    case 'ledger':
      lines.push('It counts lines and days. It is not a measure of worth.')
      return false
    default:
      lines.push(`${cap(itemName(game, item))}. Someone will pay for it.`)
      return false
  }
}

// ---------------------------------------------------------------------------
// Wrackhead
// ---------------------------------------------------------------------------

export interface Offer {
  key: string
  label: string
  price: number
  enabled: boolean
  /**
   * The key that takes it: the letter of the thing in the pack when the offer
   * is about something carried, so that `c` sells what `e c` would use, and a
   * number for what the place itself has. No place has more than nine.
   */
  hotkey: string
}

/** An offer before it has a key; `item` is the pack index it is about. */
type Stock = Omit<Offer, 'hotkey'> & { item?: number }

const letter = (i: number) => String.fromCharCode(97 + i)

export function offers(game: Game): Offer[] {
  let n = 0
  return stock(game).map(({ item, ...o }) => ({
    ...o,
    hotkey: item === undefined ? String(++n) : letter(item),
  }))
}

/** The offer a key takes, if the place has one under it. */
export function offerFor(game: Game, key: string): Offer | undefined {
  return offers(game).find((o) => o.hotkey === key)
}

const BARR_STOCK = ['knife', 'hook', 'spear', 'axe', 'leather', 'mail']
const LOFT_STOCK = ['oil', 'skin', 'coil', 'salt']

export function sellPrice(game: Game, item: Item): number {
  const kind = ITEMS[item.kind]
  if (!kind || kind.sarn || kind.use === 'ledger') return 0
  const third = Math.floor(kind.price / 3)
  return needsNaming(item.kind) && !game.known.includes(item.kind)
    ? Math.max(1, Math.floor(third / 3))
    : third
}

function stock(game: Game): Stock[] {
  const p = game.player
  const afford = (price: number) => p.marks >= price
  switch (game.shop) {
    case 'barr':
      return [
        ...BARR_STOCK.map((kind) => {
          const price = ITEMS[kind]?.price ?? 0
          return {
            key: `buy:${kind}`,
            label: `Buy ${ITEMS[kind]?.name}`,
            price,
            enabled: afford(price) && p.pack.length < PACK,
          }
        }),
        ...mending(game).map(({ slot, price }) => ({
          key: `mend:${slot}`,
          label:
            slot === 'weapon'
              ? `Put an edge back on ${ITEMS[p.weapon ?? '']?.name}`
              : `Mend ${ITEMS[p.armour ?? '']?.name}`,
          price,
          enabled: afford(price),
        })),
        ...p.pack.flatMap((item, i) => {
          const price = sellPrice(game, item)
          return price > 0
            ? [
                {
                  key: `sell:${i}`,
                  label: `Sell ${itemName(game, item)}`,
                  price: -price,
                  enabled: true,
                  item: i,
                },
              ]
            : []
        }),
      ]
    case 'loft':
      return LOFT_STOCK.map((kind) => {
        const price = ITEMS[kind]?.price ?? 0
        return {
          key: `buy:${kind}`,
          label: `Buy ${ITEMS[kind]?.name}`,
          price,
          enabled: afford(price) && p.pack.length < PACK,
        }
      })
    case 'ruun': {
      const things = [...new Set(p.pack.map((i) => i.kind))].filter(
        (k) => needsNaming(k) && !game.known.includes(k),
      )
      const creatures = p.slain.filter((k) => !game.known.includes(k))
      return [
        ...things.map((kind) => ({
          key: `name:${kind}`,
          label: `Name ${ITEMS[kind]?.unknown}`,
          price: 10,
          enabled: afford(10),
          item: p.pack.findIndex((i) => i.kind === kind),
        })),
        ...creatures.map((kind) => ({
          key: `name:${kind}`,
          label: `Name ${MONSTERS[kind]?.unknown}`,
          price: 15,
          enabled: afford(15),
        })),
      ]
    }
    case 'mardra':
      return [
        {
          key: 'trade',
          label: 'Trade with her',
          price: 0,
          enabled: !game.traded,
        },
      ]
    case 'pile':
      return p.owed
        ? []
        : p.pack.map((item, i) => ({
            key: `offer:${i}`,
            label: `Lay ${itemName(game, item)} on the pile`,
            price: 0,
            enabled: item.kind !== 'ledger',
            item: i,
          }))
    case 'rauk':
      return [{ key: 'ask', label: 'Ask her how', price: 0, enabled: true }]
    default:
      return []
  }
}

/** What Barr can mend: new iron in hand or worn that has worn, at two marks a step and two for the fire. */
function mending(game: Game): { slot: 'weapon' | 'armour'; price: number }[] {
  const p = game.player
  const out: { slot: 'weapon' | 'armour'; price: number }[] = []
  const price = (die: Die) => 2 + 2 * (8 - die)
  if (p.weapon && isIron(p.weapon) && !p.oldWeapon && (p.edge ?? 8) < 8)
    out.push({ slot: 'weapon', price: price(p.edge ?? 8) })
  if (p.armour && isIron(p.armour) && !p.oldArmour && (p.fit ?? 8) < 8)
    out.push({ slot: 'armour', price: price(p.fit ?? 8) })
  return out
}

function enterShop(game: Game, rng: Rng, digit: string, lines: string[]): void {
  const shop = SHOPS[digit]
  if (!shop) return
  game.shop = shop.id
  lines.push(`${shop.name}.`)
  const greeting: Partial<Record<string, string>> = {
    barr: `Barr: "${say(rng, 'haggle')}"`,
    ruun: say(rng, 'naming'),
    mardra: `Mardra: "${say(rng, 'trade')}"`,
    pile: pools['salt-pile'][0],
    fort: `Tolm: "${say(rng, 'tithe')}"`,
    rauk: `Rauk: "${say(rng, 'advice')}"`,
  }
  const line = greeting[shop.id]
  if (line) lines.push(line)
}

function trade(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  game.traded = true
  for (const item of p.pack) if (needsNaming(item.kind)) learn(game, item.kind)
  p.pack.push({ kind: rng.pick(['vial-warm', 'vial-cloud', 'vial-grey']) })
  learn(game, p.pack[p.pack.length - 1]?.kind ?? '')
  const creatures = game.known.filter((k) => MONSTERS[k])
  const taken = rng.int(creatures.length > 0 ? 4 : 3)
  if (taken === 0) {
    p.maxHp = Math.max(1, p.maxHp - 2)
    p.hp = Math.min(p.hp, p.maxHp)
  } else if (taken === 1) p.lamp = Math.min(p.lamp, 4) as Die
  else if (taken === 2) p.grey++
  else {
    const forgotten = rng.pick(creatures)
    game.known = game.known.filter((k) => k !== forgotten)
  }
  lines.push(
    'She names everything you carry and gives you something for the road. You will find out later what she took.',
  )
  checkGrey(game, rng, lines)
}

function shopCommand(game: Game, rng: Rng, key: string, lines: string[]): void {
  const offer = offers(game).find((o) => o.key === key)
  if (!offer || !offer.enabled) return
  const p = game.player
  const [verb, arg = ''] = key.split(':')
  if (verb === 'buy') {
    p.marks -= offer.price
    if (game.shop === 'loft' && arg !== 'salt') {
      if (arg === 'oil') p.lamp = 8
      if (arg === 'skin') p.water = 8
      if (arg === 'coil') p.rope = 8
      lines.push(`${cap(ITEMS[arg]?.name ?? arg)}. Done.`)
      return
    }
    p.pack.push({ kind: arg })
    lines.push(`Barr: "${say(rng, 'haggle')}" You have ${ITEMS[arg]?.name}.`)
  } else if (verb === 'mend') {
    p.marks -= offer.price
    if (arg === 'weapon') p.edge = 8
    else p.fit = 8
    lines.push(
      arg === 'weapon'
        ? 'Barr puts it to the stone until it will shave the hair off your arm.'
        : 'Barr hammers it back into shape, and it holds.',
    )
  } else if (verb === 'sell') {
    const item = p.pack[Number(arg)]
    if (!item) return
    p.pack.splice(Number(arg), 1)
    p.marks -= offer.price
    lines.push(
      `Barr weighs ${itemName(game, item)} and gives you ${-offer.price} marks.`,
    )
  } else if (verb === 'name') {
    p.marks -= offer.price
    learn(game, arg)
    lines.push(
      `${say(rng, 'naming')} It is ${ITEMS[arg]?.name ?? MONSTERS[arg]?.known}.`,
    )
  } else if (verb === 'trade') {
    trade(game, rng, lines)
  } else if (verb === 'offer') {
    const item = p.pack[Number(arg)]
    if (!item) return
    p.pack.splice(Number(arg), 1)
    p.owed = true
    lines.push(
      `You lay ${itemName(game, item)} on the salt-pile. The sea will give you back, once.`,
    )
  } else if (verb === 'ask') {
    lines.push(`Rauk: "${say(rng, 'advice')}"`)
  }
}

// ---------------------------------------------------------------------------
// Sarn and the order
// ---------------------------------------------------------------------------

function answer(game: Game, rng: Rng, yes: boolean, lines: string[]): void {
  const prompt = game.prompt
  game.prompt = null
  if (!prompt) return
  const p = game.player
  if (prompt.kind === 'tithe') {
    const asker = game.level.monsters.find((m) => m.id === prompt.monster)
    const holder = asker && MONSTERS[asker.kind]?.holder
    // A holder's price is his own; the order's is paid to all of it.
    const askers = game.level.monsters.filter((m) =>
      holder ? m === asker : m.kind === 'firstcloak',
    )
    if (yes) {
      const tenth = Math.max(1, Math.floor(p.marks / 10))
      p.marks = Math.max(0, p.marks - tenth)
      for (const m of askers) if (!m.refused) m.peaceful = true
      lines.push(
        holder
          ? `You pay ${tenth} marks. ${holders[holder].name} lets you by, and keeps what is his.`
          : `You pay ${tenth} marks. "Thank you." They stand aside.`,
      )
    } else {
      for (const m of askers) {
        m.refused = true
        m.awake = true
      }
      lines.push(
        holder
          ? `${holders[holder].name} gets up. "Then all of it."`
          : '"A pity." The hook comes out.',
      )
    }
    return
  }
  for (let y = 0; y < game.level.h; y++)
    for (let x = 0; x < game.level.w; x++)
      if (at(game.level, x, y) === 'S') set(game.level, x, y, '.')
  game.offered.push(game.depth)
  if (!yes) {
    lines.push(
      pools.gift.find((g) => g.startsWith('Refuse')) ?? 'Refuse, then.',
    )
    return
  }
  if (prompt.gift === 'purse') {
    p.marks += 150
    p.gained += 150
    lines.push('A purse, heavy. A hundred and fifty marks.')
  } else {
    p.pack.push({ kind: prompt.gift })
    lines.push(`You have ${ITEMS[prompt.gift]?.name}.`)
  }
  const theft = rng.pick(THEFTS)
  if (theft === 'maxhp') {
    p.maxHp = Math.max(1, p.maxHp - 3)
    p.hp = Math.min(p.hp, p.maxHp)
  } else if (theft === 'names') game.known = []
  else if (theft === 'map') game.level.seen = game.level.seen.map(() => false)
  else if (theft === 'item') {
    const dearest = p.pack
      .map((item, i) => ({
        i,
        price: ITEMS[item.kind]?.sarn ? -1 : (ITEMS[item.kind]?.price ?? 0),
      }))
      .sort((a, b) => b.price - a.price)[0]
    if (dearest && dearest.price >= 0) p.pack.splice(dearest.i, 1)
    else p.grey++
  } else p.grey += 2
  lines.push('The eyes are gone. You feel lighter, somewhere you cannot find.')
  checkGrey(game, rng, lines)
}

// ---------------------------------------------------------------------------
// The turn: the tide, the things that move, and the things that take
// ---------------------------------------------------------------------------

const TIDE_LINE: Record<string, Pool> = {
  turning: 'tide-turning',
  flood: 'tide-flood',
  ebb: 'tide-ebb',
  low: 'tide-low',
}

function monstersAct(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  const radius = lightRadius(game)
  for (const m of game.level.monsters) {
    if (m.hp <= 0 || game.over) continue
    const kind = MONSTERS[m.kind]
    if (!kind || m.peaceful) continue
    const d2 = (m.x - p.x) ** 2 + (m.y - p.y) ** 2
    const sees = d2 <= (radius + 3) ** 2 && inSight(game.level, m, p)
    if (!m.awake && sees) m.awake = true
    if (!m.awake) continue
    if (kind.counts) {
      if (sees && d2 <= (radius + 1) ** 2) {
        m.notches++
        lines.push(
          `${cap(monsterName(game, m))} cuts a notch in the salt. (${m.notches})`,
        )
      }
      continue
    }
    if (kind.grabs && p.held === m.id) {
      drag(game, rng, m, lines)
      continue
    }
    const moves = kind.hunts && (p.water === 0 || p.hp * 2 < p.maxHp) ? 2 : 1
    for (let i = 0; i < moves && !game.over; i++) {
      if (adjacent(m, p)) {
        if (kind.tithes && !m.refused) {
          if (!game.prompt) {
            game.prompt = { kind: 'tithe', monster: m.id }
            lines.push(
              kind.holder
                ? `${holders[kind.holder].name} holds out a hand. "A tenth." Pay? (y/n)`
                : `${cap(monsterName(game, m))} bows. "Pardon. A tenth." Pay? (y/n)`,
            )
          }
          break
        }
        monsterAttack(game, rng, m, lines)
        break
      }
      if (kind.stays) break
      const next = step(m, p, game, (t) => walkable(t))
      if (!next) break
      m.x = next.x
      m.y = next.y
    }
  }
}

/**
 * A holder says who they are, once, the first time they see you; and the
 * first time you see your wrack, Sarn has a word about it.
 */
function holdersSpeak(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  const radius = lightRadius(game)
  for (const m of game.level.monsters) {
    const rival = MONSTERS[m.kind]?.holder
    if ((!rival && !m.wrack) || m.spoke || m.hp <= 0) continue
    const d2 = (m.x - p.x) ** 2 + (m.y - p.y) ** 2
    if (d2 > (radius + 3) ** 2 || !inSight(game.level, m, p)) continue
    m.spoke = true
    lines.push(
      rival
        ? `${holders[rival].name}: "${say(rng, rival)}"`
        : say(rng, 'wrack'),
    )
  }
}

/** The Drawn goes where its rope goes, and takes you with it. */
function drag(game: Game, rng: Rng, m: Monster, lines: string[]): void {
  const p = game.player
  const target = game.level.down ?? game.level.up
  const from = { x: m.x, y: m.y }
  const next = step(m, target, game, (t) => walkable(t))
  if (!next) return
  m.x = next.x
  m.y = next.y
  p.x = from.x
  p.y = from.y
  lines.push('The rope draws you along behind it.')
  if (
    game.level.down &&
    m.x === game.level.down.x &&
    m.y === game.level.down.y
  ) {
    lines.push('It goes down the stair, and so do you.')
    travel(game, rng, game.depth + 1, 'top', lines)
  }
}

function notched(game: Game, rng: Rng, lines: string[]): void {
  const counter = game.level.monsters.find((m) => m.hp > 0 && m.notches >= 9)
  if (!counter) return
  for (const m of game.level.monsters) m.notches = 0
  const p = game.player
  p.hp -= rng.roll(6) + game.depth
  lines.push(
    'The ninth notch. A rope comes down out of the dark and finds your neck.',
  )
  if (p.hp <= 0) {
    dying(game, rng, `hanged by the ninth notch at depth ${game.depth}`, lines)
    return
  }
  if (game.depth < LAST_DEPTH) {
    lines.push('It drags you down through the floor.')
    travel(game, rng, game.depth + 1, 'top', lines)
  }
}

function theGreyTakes(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  const options: (() => string)[] = [
    () => {
      p.maxHp = Math.max(1, p.maxHp - 1)
      p.hp = Math.min(p.hp, p.maxHp)
      return 'a little of your strength'
    },
  ]
  if (game.known.length > 0)
    options.push(() => {
      const name = rng.pick(game.known)
      game.known = game.known.filter((k) => k !== name)
      return 'a name you knew'
    })
  if (p.lamp > 0 && !hasSarnLamp(game))
    options.push(() => {
      p.lamp = STEP[p.lamp]
      return 'some of the light'
    })
  lines.push(`The grey takes ${rng.pick(options)()}.`)
}

function endTurn(game: Game, rng: Rng, lines: string[]): void {
  const p = game.player
  const before = phase(game.tide)
  game.turn++
  if (game.held > 0) {
    game.held--
    if (game.held === 0) lines.push('You let the stream go. It goes.')
  } else game.tide++
  if (game.depth === 0) return
  const now = phase(game.tide)
  if (now !== before) {
    const pool = TIDE_LINE[now]
    if (pool) lines.push(say(rng, pool))
  }

  monstersAct(game, rng, lines)
  if (game.over || game.depth === 0) return
  holdersSpeak(game, rng, lines)

  const water = waterAt(game.level, game.tide, p.x, p.y)
  if (water >= 2 && game.turn % (p.bg === 'wrecker' ? 3 : 2) === 0) {
    p.hp--
    if (game.turn % 4 === 0)
      lines.push('You are under. Find the stair, or air.')
    if (p.hp <= 0) {
      dying(game, rng, `drowned at depth ${game.depth}`, lines)
      return
    }
  }
  if (
    water >= 1 &&
    p.bg !== 'wrecker' &&
    !hasSarnLamp(game) &&
    game.turn % 3 === 0
  ) {
    const lamp = rollDie(rng, p.lamp)
    if (lamp !== p.lamp)
      lines.push('The wet gets into the lamp. It burns lower.')
    p.lamp = lamp
  }
  if (greyAt(game.level, game.tide, p.x, p.y) && rng.chance(0.12))
    theGreyTakes(game, rng, lines)

  if (game.turn % 40 === 0 && !hasSarnLamp(game)) {
    const lamp = rollDie(rng, p.lamp)
    if (lamp !== p.lamp)
      lines.push(lamp === 0 ? 'The lamp goes out.' : 'The lamp burns lower.')
    p.lamp = lamp
  }
  if (game.turn % 60 === 0) {
    const water = rollDie(rng, p.water)
    if (water !== p.water)
      lines.push(
        water === 0
          ? 'The last of the water is gone.'
          : 'The water is getting low.',
      )
    p.water = water
  }
  if (p.water === 0 && game.turn % 25 === 0) {
    p.hp--
    lines.push('Your mouth is salt. You need water.')
    if (p.hp <= 0) {
      dying(game, rng, `died of thirst at depth ${game.depth}`, lines)
      return
    }
  }
  if (
    p.water > 0 &&
    p.hp < p.maxHp &&
    game.turn % Math.max(2, 8 - p.level) === 0
  )
    p.hp++

  notched(game, rng, lines)
}

// ---------------------------------------------------------------------------
// The one way in
// ---------------------------------------------------------------------------

function command(game: Game, rng: Rng, cmd: Command, lines: string[]): boolean {
  const p = game.player
  switch (cmd.type) {
    case 'move':
      game.shop = null
      return move(game, rng, cmd.dir, lines)
    case 'wait':
      return true
    case 'stairs': {
      const tile = at(game.level, p.x, p.y)
      if (p.held !== null) {
        lines.push('The rope holds you.')
        return true
      }
      if (tile === '>') {
        travel(game, rng, game.depth + 1, 'top', lines)
        return true
      }
      if (tile === '<') {
        travel(game, rng, game.depth - 1, 'bottom', lines)
        return true
      }
      lines.push('There is no stair here.')
      return false
    }
    case 'get': {
      const here = game.level.items.findIndex((i) => i.x === p.x && i.y === p.y)
      const found = game.level.items[here]
      if (!found) {
        lines.push('There is nothing here.')
        return false
      }
      if (p.pack.length >= PACK) {
        lines.push('Your pack is full.')
        return false
      }
      game.level.items.splice(here, 1)
      p.pack.push(found.item)
      if (found.item.kind === 'ledger') {
        if (at(game.level, p.x, p.y) === '_') set(game.level, p.x, p.y, '.')
        lines.push(
          'You take up the ledger. It is heavier than a man can carry far, and lighter than it ought to be. The last line in it reads: held the drain, days still counting.',
        )
      } else lines.push(`You take ${itemName(game, found.item)}.`)
      return true
    }
    case 'use':
      return use(game, rng, cmd.index, lines)
    case 'drop': {
      const item = p.pack[cmd.index]
      if (!item || game.depth === 0) return false
      p.pack.splice(cmd.index, 1)
      game.level.items.push({ x: p.x, y: p.y, item })
      lines.push(`You put down ${itemName(game, item)}.`)
      return true
    }
    case 'mean':
      p.meaning = !p.meaning
      lines.push(
        p.meaning
          ? 'You will mean the next blow. It will cost you.'
          : 'You let it go.',
      )
      return false
    case 'name': {
      const [dx, dy] = DIRS[cmd.dir]
      const m = monsterAt(game.level, p.x + dx, p.y + dy)
      const cost = p.bg === 'novice' ? 1 : 2
      if (!m) {
        lines.push('There is nothing there to name.')
        return false
      }
      if (game.known.includes(m.kind)) {
        lines.push('You know its name already.')
        return false
      }
      if (p.will < cost) {
        lines.push(`Naming takes ${cost} will. You have ${p.will}.`)
        return false
      }
      p.will -= cost
      learn(game, m.kind)
      lines.push(
        `You say its name, and mean it. It is ${monsterName(game, m)}, and it knows you know.`,
      )
      return true
    }
    case 'stop': {
      const ph = phase(game.tide)
      if (game.depth === 0 || (ph !== 'turning' && ph !== 'flood')) {
        lines.push('Nothing here is flowing that needs stopping.')
        return false
      }
      if (p.will < 3) {
        lines.push(`Stopping a stream takes 3 will. You have ${p.will}.`)
        return false
      }
      p.will -= 3
      game.held = 15
      lines.push('You tell the water to stop, and mean it. It stops.')
      return true
    }
    case 'rope': {
      if (game.depth === 0) return false
      if (p.held !== null) {
        lines.push('You are on the wrong end of a rope already.')
        return false
      }
      if (p.rope === 0) {
        lines.push('You have no rope left.')
        return false
      }
      p.rope = rollDie(rng, p.rope)
      lines.push(
        'You throw the rope up into the dark, and it holds, and you climb.',
      )
      travel(game, rng, game.depth - 1, 'bottom', lines)
      return true
    }
    case 'answer':
      answer(game, rng, cmd.yes, lines)
      return true
    case 'shop':
      shopCommand(game, rng, cmd.key, lines)
      return false
    case 'leave':
      game.shop = null
      return false
  }
}

export function act(prev: Game, cmd: Command): Outcome {
  const game = structuredClone(prev)
  const lines: string[] = []
  if (game.over) return { game, lines }
  if (game.prompt && cmd.type !== 'answer') {
    lines.push('Answer first: y or n.')
    return { game, lines }
  }
  const rng = makeRng(game.seed)
  const tookTime = command(game, rng, cmd, lines)
  if (tookTime && !game.over) endTurn(game, rng, lines)
  if (!game.over && game.player.hp <= 0)
    dying(game, rng, `died at depth ${game.depth}`, lines)
  checkGrey(game, rng, lines)
  reveal(game)
  game.seed = rng.seed()
  return { game, lines }
}

/** Mark what the lamp shows as seen, so the map remembers it. */
export function reveal(game: Game): void {
  if (game.depth === 0) return
  for (const i of visible(game.level, game.player, lightRadius(game)))
    game.level.seen[i] = true
}

/** What the tide is doing, for the page. */
export function tideReport(game: Game): { phase: string; water: number } {
  return { phase: phase(game.tide), water: floodLevel(game.tide) }
}
