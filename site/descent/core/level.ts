/**
 * The ground: Wrackhead on the shingle, nine floors of drowned Kell made fresh
 * on every visit, and the Iron Hall at the bottom, which is always the same
 * shape because it is always the same hall.
 *
 * Tiles are characters. `#` is wall, `.` floor, `+` a barred door, `'` an open
 * one, `<` and `>` the stairs. In Wrackhead `~` is the sea and the digits are
 * the doors of the seven places on the shingle. In the hall, `K` is the king,
 * `_` the ledger's stand, `O` the drain, `&` the man standing in it, and `^`
 * the gap in the roof. `S` is Sarn, wherever Sarn has chosen to be.
 */
import { ITEMS, MONSTERS, tierOf } from './content'
import type { Rng } from './rng'
import type { Item, Level, Monster, Pos } from './types'

export const W = 56
export const H = 20

const OPEN = new Set(['.', "'", '<', '>', '^', '_'])
const OPAQUE = new Set(['#', '+', '~'])

export const at = (level: Level, x: number, y: number): string =>
  x < 0 || y < 0 || x >= level.w || y >= level.h
    ? '#'
    : (level.tiles[y]?.[x] ?? '#')

export function set(level: Level, x: number, y: number, tile: string): void {
  const row = level.tiles[y]
  if (row === undefined || x < 0 || x >= level.w) return
  level.tiles[y] = row.slice(0, x) + tile + row.slice(x + 1)
}

export const index = (level: Level, x: number, y: number): number =>
  y * level.w + x

export const elevation = (level: Level, x: number, y: number): number =>
  level.elev[index(level, x, y)] ?? 0

/** Ground a body can stand on; a closed door is not, until it is opened. */
export const walkable = (tile: string): boolean =>
  OPEN.has(tile) || /[1-7]/.test(tile)

export const opaque = (tile: string): boolean => OPAQUE.has(tile)

export const monsterAt = (level: Level, x: number, y: number) =>
  level.monsters.find((m) => m.x === x && m.y === y && m.hp > 0)

/** The seven places on the shingle, by the digit on their door. */
export const SHOPS: Record<string, { id: string; name: string }> = {
  '1': { id: 'barr', name: "Barr's forge" },
  '2': { id: 'loft', name: 'The net-loft' },
  '3': { id: 'ruun', name: 'Brother Ruun, on the sand' },
  '4': { id: 'mardra', name: "Mardra's stall" },
  '5': { id: 'pile', name: 'The salt-pile' },
  '6': { id: 'fort', name: 'The fort door' },
  '7': { id: 'rauk', name: "Rauk's boat" },
}

const TOWN = [
  '########################################',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~>~~~~~~~~~~~~~~~~~~~#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '###1####2####3####4####5####6####7######',
]

function blank(depth: number, w: number, h: number, fill: string): Level {
  return {
    depth,
    w,
    h,
    tiles: Array.from({ length: h }, () => fill.repeat(w)),
    elev: Array.from({ length: w * h }, () => 3),
    seen: Array.from({ length: w * h }, () => false),
    up: { x: 0, y: 0 },
    down: null,
    items: [],
    monsters: [],
    grey: [],
  }
}

/** Wrackhead: the shingle, the sea, and the top of the Quaysteps. */
export function town(): Level {
  const level = blank(0, TOWN[0]?.length ?? 40, TOWN.length, '#')
  level.tiles = [...TOWN]
  level.seen = level.seen.map(() => true)
  level.down = { x: 19, y: 2 }
  level.up = { x: 19, y: 3 }
  return level
}

interface Room {
  x: number
  y: number
  w: number
  h: number
  elev: number
}

const centre = (r: Room): Pos => ({
  x: r.x + Math.floor(r.w / 2),
  y: r.y + Math.floor(r.h / 2),
})

const inside = (r: Room, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

const overlaps = (a: Room, b: Room) =>
  a.x - 1 < b.x + b.w &&
  a.x + a.w + 1 > b.x &&
  a.y - 1 < b.y + b.h &&
  a.y + a.h + 1 > b.y

function carve(level: Level, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      set(level, x, y, '.')
      level.elev[index(level, x, y)] = r.elev
    }
}

/**
 * An L-shaped corridor from one room's centre to another's. Where it leaves a
 * room in the Lowstreets it may pass a barred door.
 */
function corridor(
  level: Level,
  rng: Rng,
  rooms: Room[],
  a: Room,
  b: Room,
  doors: Pos[],
): void {
  const from = centre(a)
  const to = centre(b)
  const elev = Math.min(a.elev, b.elev)
  const path: Pos[] = []
  const horizontalFirst = rng.chance(0.5)
  let { x, y } = from
  const stepX = () => {
    while (x !== to.x) {
      x += Math.sign(to.x - x)
      path.push({ x, y })
    }
  }
  const stepY = () => {
    while (y !== to.y) {
      y += Math.sign(to.y - y)
      path.push({ x, y })
    }
  }
  if (horizontalFirst) {
    stepX()
    stepY()
  } else {
    stepY()
    stepX()
  }
  let wasInRoom = true
  for (const p of path) {
    const inRoom = rooms.some((r) => inside(r, p.x, p.y))
    if (at(level, p.x, p.y) === '#') {
      set(level, p.x, p.y, '.')
      level.elev[index(level, p.x, p.y)] = elev
    }
    if (wasInRoom && !inRoom) doors.push(p)
    wasInRoom = inRoom
  }
}

/** Ids come from the game, so that they survive a save. */
export type Ids = () => number

export function spawn(
  kind: string,
  x: number,
  y: number,
  depth: number,
  id: number,
): Monster {
  const m = MONSTERS[kind]
  if (!m) throw new Error(`no such creature: ${kind}`)
  const hp = Math.round(m.hp * (1 + (depth - 1) * 0.15))
  return {
    id,
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    awake: false,
    peaceful: m.waits === true,
    refused: false,
    notches: 0,
  }
}

/** A cell on open floor that nothing else is standing on. */
export function freeCell(level: Level, rng: Rng, avoid?: Room): Pos {
  for (let tries = 0; tries < 2000; tries++) {
    const x = rng.int(level.w)
    const y = rng.int(level.h)
    if (at(level, x, y) !== '.') continue
    if (avoid && inside(avoid, x, y)) continue
    if (monsterAt(level, x, y)) continue
    if (level.items.some((i) => i.x === x && i.y === y)) continue
    if (level.up.x === x && level.up.y === y) continue
    return { x, y }
  }
  throw new Error('no free floor')
}

/** What lies on the floor at this depth, drawn from the tier's things. */
function loot(rng: Rng, depth: number): Item {
  if (rng.chance(0.45))
    return { kind: 'marks', amount: rng.dice(2, 6) * (2 + depth) }
  const tier = tierOf(depth)
  const kinds = Object.entries(ITEMS)
    .filter(([, k]) => k.tiers?.includes(tier))
    .map(([kind]) => kind)
  return { kind: rng.pick(kinds) }
}

function populate(
  level: Level,
  rng: Rng,
  rooms: Room[],
  start: Room,
  ids: Ids,
): void {
  const depth = level.depth
  const tier = tierOf(depth)
  const items = 4 + rng.int(3) + (tier === 3 ? 1 : 0)
  for (let i = 0; i < items; i++) {
    const p = freeCell(level, rng)
    level.items.push({ ...p, item: loot(rng, depth) })
  }
  if (tier === 3) {
    const p = freeCell(level, rng)
    level.items.push({ ...p, item: { kind: 'page' } })
  }
  const kinds = Object.entries(MONSTERS)
    .filter(([, m]) => m.tiers.includes(tier) && !m.stays)
    .map(([kind]) => kind)
  const count = Math.min(9, 2 + depth)
  for (let i = 0; i < count; i++) {
    const p = freeCell(level, rng, start)
    level.monsters.push(spawn(rng.pick(kinds), p.x, p.y, depth, ids()))
  }
  if (tier >= 3) {
    const sources = 1 + rng.int(3)
    for (let i = 0; i < sources; i++) {
      const room = rooms[1 + rng.int(rooms.length - 1)]
      if (room) level.grey.push(centre(room))
    }
  }
  if (depth === 3 || depth === 6 || depth === 9) {
    const p = freeCell(level, rng, start)
    set(level, p.x, p.y, 'S')
  }
}

function placeRooms(
  level: Level,
  rng: Rng,
  rooms: Room[],
  target: number,
): void {
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = 4 + rng.int(8)
    const h = 3 + rng.int(4)
    const room: Room = {
      x: 1 + rng.int(level.w - w - 2),
      y: 1 + rng.int(level.h - h - 2),
      w,
      h,
      elev: rng.int(4),
    }
    if (rooms.some((r) => overlaps(r, room))) continue
    rooms.push(room)
  }
}

/** The bottom: one great hall, and a few rooms round it. */
function hall(level: Level, rng: Rng): Room[] {
  const great: Room = { x: 12, y: 4, w: 32, h: 12, elev: 0 }
  const rooms = [great]
  placeRooms(level, rng, rooms, 5)
  return rooms
}

function furnishHall(level: Level, great: Room): void {
  const c = centre(great)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) set(level, c.x + dx, c.y + dy, 'O')
  set(level, c.x, c.y, '&')
  set(level, c.x, great.y + 1, 'K')
  set(level, c.x + 1, great.y + 1, '_')
  level.items.push({ x: c.x + 1, y: great.y + 1, item: { kind: 'ledger' } })
  set(level, great.x + 1, great.y, '^')
  for (let y = great.y; y < great.y + great.h; y += 4)
    for (let x = great.x + 2; x < great.x + great.w; x += 8)
      level.grey.push({ x, y })
}

/**
 * A floor of drowned Kell. The room you come down into is the highest, the
 * one with the stair further down is the lowest, and the corridors between
 * take the lower of the two rooms they join: the flood finds the way down
 * before you do.
 */
export function generate(depth: number, rng: Rng, ids: Ids): Level {
  const level = blank(depth, W, H, '#')
  const tier = tierOf(depth)
  const rooms: Room[] = depth >= 10 ? hall(level, rng) : []
  if (depth < 10) placeRooms(level, rng, rooms, 7 + rng.int(3))
  rooms.sort((a, b) => a.x - b.x)

  const start =
    depth >= 10 ? (rooms.find((r) => r.w < 32) ?? rooms[0]) : rooms[0]
  const end = rooms[rooms.length - 1]
  if (!start || !end) throw new Error('a level with no rooms')
  start.elev = 3
  if (depth < 10) end.elev = 0

  for (const r of rooms) carve(level, r)
  const doors: Pos[] = []
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]
    const b = rooms[i]
    if (a && b) corridor(level, rng, rooms, a, b, doors)
  }

  level.up = centre(start)
  set(level, level.up.x, level.up.y, '<')
  if (depth < 10) {
    level.down = centre(end)
    set(level, level.down.x, level.down.y, '>')
  } else {
    const great = rooms.find((r) => r.w === 32)
    if (great) furnishHall(level, great)
  }

  if (tier === 2) {
    for (const d of doors) {
      if (at(level, d.x, d.y) !== '.' || !rng.chance(0.6)) continue
      set(level, d.x, d.y, '+')
      if (rng.chance(0.5)) {
        const behind = [
          { x: d.x + 1, y: d.y },
          { x: d.x - 1, y: d.y },
          { x: d.x, y: d.y + 1 },
          { x: d.x, y: d.y - 1 },
        ].find(
          (p) =>
            at(level, p.x, p.y) === '.' &&
            rooms.some((r) => inside(r, p.x, p.y)),
        )
        if (behind && !inside(start, behind.x, behind.y))
          level.monsters.push(spawn('barred', behind.x, behind.y, depth, ids()))
      }
    }
  }

  populate(level, rng, rooms, start, ids)
  return level
}
