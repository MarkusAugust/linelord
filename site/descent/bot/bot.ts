/**
 * A warrior who plays the descent by rule, so that the numbers can be weighed
 * without anyone going down by hand. It plays the way a careful player does:
 * it buys salt and spare water and keeps its lamp full in Wrackhead, rests when
 * nothing is near, fights what stands next to it, pays the order, refuses
 * Sarn, names what it fights while it has the will, and climbs back to the
 * shingle when the salt or the water is gone and the blood is low. It does
 * not dig or mean a blow, and every run starts knowing no names, where a
 * player keeps the names of the runs before.
 *
 * It sees the whole floor, lit or not, so what it measures is how hard the
 * rules are to survive, not how hard Kell is to find your way through. Like
 * the page, it only turns a game into commands; the rules are in `../core`.
 */
import { ITEMS, MONSTERS } from '../core/content'
import { act, DIRS, newGame, offers, PACK } from '../core/game'
import { at, monsterAt, SHOPS, walkable } from '../core/level'
import { waterAt } from '../core/tide'
import type { Background, Command, Dir, Game, Item, Pos } from '../core/types'

/** Salt to carry down. */
const SALT = 4
/** Skins of water to carry down, over the one it drinks from. */
const SKINS = 2
/** Below this share of blood, the bot reaches for salt. */
const WASH = 0.4
/** Below this share, with no salt left, it goes back up. */
const RETREAT = 0.5

const steps = Object.entries(DIRS) as [Dir, [number, number]][]

/**
 * The first step of the shortest way to a cell `goal` accepts, over ground a
 * body can stand on, through barred doors and past Sarn (walking into Sarn is
 * how Sarn is answered, and refused Sarn is gone), around the shops' doors.
 * Null when there is no way.
 */
export function wayTo(
  game: Game,
  goal: (x: number, y: number) => boolean,
): Dir | null {
  const level = game.level
  const p = game.player
  const key = (x: number, y: number) => y * level.w + x
  const first = new Map<number, Dir | null>([[key(p.x, p.y), null]])
  const queue: Pos[] = [{ x: p.x, y: p.y }]
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i] as Pos
    for (const [dir, [dx, dy]] of steps) {
      const x = c.x + dx
      const y = c.y + dy
      if (first.has(key(x, y))) continue
      const tile = at(level, x, y)
      const target = goal(x, y)
      if (
        !target &&
        (!(walkable(tile) || tile === '+' || tile === 'S') ||
          /[1-7]/.test(tile))
      )
        continue
      const how = first.get(key(c.x, c.y)) ?? dir
      if (target) return how
      first.set(key(x, y), how)
      queue.push({ x, y })
    }
  }
  return null
}

const packIndex = (game: Game, kind: string) =>
  game.player.pack.findIndex((i) => i.kind === kind)

/** What a weapon is worth to the bot: its average cut, and half its bonus to hit. */
function cutting(kind: string | null, old?: boolean): number {
  const k = ITEMS[kind ?? '']
  if (!k?.dmg) return 1.5
  const [count, sides] = k.dmg
  return (count * (sides + 1)) / 2 - (old ? 1 : 0) + (k.bonus ?? 0) / 2
}

const keeping = (kind: string | null, old?: boolean) =>
  (ITEMS[kind ?? '']?.ac ?? 0) - (old ? 1 : 0)

/** A thing in the pack that is better than what is in hand or worn. */
function better(game: Game): number {
  const p = game.player
  const beats = (i: Item) => {
    const use = ITEMS[i.kind]?.use
    if (use === 'weapon')
      return cutting(i.kind, i.old) > cutting(p.weapon, p.oldWeapon)
    if (use === 'armour')
      return keeping(i.kind, i.old) > keeping(p.armour, p.oldArmour)
    return false
  }
  return p.pack.findIndex(beats)
}

const count = (game: Game, kind: string) =>
  game.player.pack.filter((i) => i.kind === kind).length

/** What it wants in Wrackhead, in order: the shop to go to and the offer to take. */
function errand(game: Game): { shop: string; key: string } | null {
  const p = game.player
  const reserve = (price: number) => p.marks >= price
  if (p.hp < p.maxHp - 4 && reserve(5) && count(game, 'salt') === 0)
    return { shop: 'loft', key: 'buy:salt' }
  if (p.lamp < 8 && reserve(6)) return { shop: 'loft', key: 'buy:oil' }
  if (p.water < 8 && reserve(4)) return { shop: 'loft', key: 'buy:skin' }
  if (p.weapon === 'knife' && reserve(30 + 5 * SALT))
    return { shop: 'barr', key: 'buy:spear' }
  if (count(game, 'salt') < SALT && reserve(5) && p.pack.length < PACK)
    return { shop: 'loft', key: 'buy:salt' }
  if (count(game, 'skin') < SKINS && reserve(4) && p.pack.length < PACK)
    return { shop: 'loft', key: 'buy:skin' }
  return null
}

function inTown(game: Game): Command {
  const p = game.player
  const level = game.level
  const salt = packIndex(game, 'salt')
  if (p.hp < p.maxHp - 4 && salt >= 0) return { type: 'use', index: salt }
  const gear = better(game)
  if (gear >= 0) return { type: 'use', index: gear }
  const want = errand(game)
  if (want && game.shop === want.shop) {
    const offer = offers(game).find((o) => o.key === want.key)
    if (offer?.enabled) return { type: 'shop', key: want.key }
  }
  if (want && game.shop !== want.shop) {
    const digit = Object.keys(SHOPS).find((d) => SHOPS[d]?.id === want.shop)
    const dir = wayTo(game, (x, y) => at(level, x, y) === digit)
    if (dir) return { type: 'move', dir }
  }
  const down = level.down as Pos
  if (p.x === down.x && p.y === down.y) return { type: 'stairs' }
  const dir = wayTo(game, (x, y) => x === down.x && y === down.y)
  return dir ? { type: 'move', dir } : { type: 'wait' }
}

/** A foe on a neighbouring cell that it means to fight, and the way to it. */
function foeBeside(game: Game): Dir | null {
  const p = game.player
  for (const [dir, [dx, dy]] of steps) {
    const m = monsterAt(game.level, p.x + dx, p.y + dy)
    if (m && !m.peaceful && !MONSTERS[m.kind]?.waits) return dir
  }
  return null
}

const near = (game: Game, reach: number) =>
  game.level.monsters.some(
    (m) =>
      m.hp > 0 &&
      m.awake &&
      !m.peaceful &&
      Math.max(Math.abs(m.x - game.player.x), Math.abs(m.y - game.player.y)) <=
        reach,
  )

function below(game: Game): Command {
  const p = game.player
  const level = game.level
  if (p.held !== null) {
    const holder = level.monsters.find((m) => m.id === p.held)
    const dir = steps.find(
      ([, [dx, dy]]) => p.x + dx === holder?.x && p.y + dy === holder?.y,
    )?.[0]
    if (dir) return { type: 'move', dir }
  }
  const salt = packIndex(game, 'salt')
  if (p.hp < p.maxHp * WASH && salt >= 0) return { type: 'use', index: salt }
  const skin = packIndex(game, 'skin')
  if (p.water === 0 && skin >= 0) return { type: 'use', index: skin }
  const oil = packIndex(game, 'oil')
  if (p.lamp <= 4 && oil >= 0) return { type: 'use', index: oil }
  const foe = foeBeside(game)
  if (foe) {
    const [dx, dy] = DIRS[foe]
    const m = monsterAt(level, p.x + dx, p.y + dy)
    const cost = p.bg === 'novice' ? 1 : 2
    if (m && !game.known.includes(m.kind) && p.will >= cost)
      return { type: 'name', dir: foe }
    return { type: 'move', dir: foe }
  }
  const gear = better(game)
  if (gear >= 0) return { type: 'use', index: gear }
  const dry = waterAt(level, game.tide, p.x, p.y) < 2
  if (dry && !near(game, 8) && p.hp < p.maxHp * 0.9 && p.water > 0)
    return { type: 'wait' }
  const going = p.pack.some((i) => i.kind === 'ledger')
  const parched = p.water === 0 && skin < 0
  const back = !going && ((salt < 0 && p.hp < p.maxHp * RETREAT) || parched)
  const here = level.items.some((i) => i.x === p.x && i.y === p.y)
  if (here && p.pack.length < PACK && !back) return { type: 'get' }
  if (going) {
    if (at(level, p.x, p.y) === '^') return { type: 'wait' }
    const dir = wayTo(game, (x, y) => at(level, x, y) === '^')
    if (dir) return { type: 'move', dir }
  }
  const ledger = level.items.find((i) => i.item.kind === 'ledger')
  const goal = back
    ? level.up
    : (ledger ?? level.down ?? { x: level.up.x, y: level.up.y })
  if (p.x === goal.x && p.y === goal.y && /[<>]/.test(at(level, p.x, p.y)))
    return { type: 'stairs' }
  const dir = wayTo(game, (x, y) => x === goal.x && y === goal.y)
  return dir ? { type: 'move', dir } : { type: 'wait' }
}

/** The bot's next command for a game. */
export function choose(game: Game): Command {
  if (game.prompt) return { type: 'answer', yes: game.prompt.kind === 'tithe' }
  return game.depth === 0 ? inTown(game) : below(game)
}

/** A cause with every creature called by its name, known or not, so that causes can be counted together. */
const known = (cause: string) =>
  Object.values(MONSTERS).reduce(
    (c, k) => c.replace(` by ${k.unknown}`, ` by ${k.known}`),
    cause,
  )

export interface RunResult {
  bg: Background
  seed: number
  /** How the run ended, or `stuck` when it ran out of turns first. */
  ending: string
  /** What ended it, without the depth: `killed by a Picker`, `drowned`. */
  cause: string
  deepest: number
  turns: number
  level: number
}

/** One run, played by the bot until it ends or `limit` commands have been given. */
export function playRun(bg: Background, seed: number, limit = 6000): RunResult {
  let game = newGame({ name: 'Bot', bg, seed })
  for (let i = 0; i < limit && !game.over; i++)
    game = act(game, choose(game)).game
  const over = game.over
  return {
    bg,
    seed,
    ending: over?.ending ?? 'stuck',
    cause: over
      ? known(over.cause)
          .replace(/ (at depth|on turn) \d+$/, '')
          .replace(/ with the ledger$/, '')
      : 'stuck',
    deepest: game.player.deepest,
    turns: game.turn,
    level: game.player.level,
  }
}
