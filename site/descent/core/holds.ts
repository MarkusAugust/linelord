/**
 * Who holds what in Kell, between one run and the next. The ledger names a
 * holder for each of the four depths, by who holds the ground and for how
 * long, and the Linelord above them: whoever holds the most, the oldest
 * holding first among equals. A run can take a hold; the low water after it
 * may give the hold back to the one it was taken from. Fresh holdings pay
 * well and fall easily; old ones pay little and stay. Old is stable. It is
 * not good.
 *
 * The clock is the low water: one for every run that ends.
 */
import { holders, pools } from '../lore'
import { ITEMS, TIERS } from './content'
import type { Rng } from './rng'

export type Tier = 1 | 2 | 3 | 4
export type Rival = 'hollin' | 'grue' | 'sethra' | 'corve'
export const TIER_LIST: readonly Tier[] = [1, 2, 3, 4]

export interface Claim {
  holder: Rival | 'you'
  /** Who holds it, by name: yours is the name of the run that took it. */
  name: string
  /** The low water it was taken at. */
  since: number
  /** Whose it was before, and who wants it back. */
  from: Rival
}

/**
 * What the sea gave back of a run that went down and stayed: it stands on the
 * floor where it fell, holding what it carried, until a later run takes it.
 */
export interface Wrack {
  /** The low water it fell at; one run, one wrack. */
  id: number
  name: string
  depth: number
  weapon: string | null
  armour: string | null
  marks: number
  level: number
}

export interface World {
  lowWater: number
  holds: Record<Tier, Claim>
  /** Newest first. Worlds kept before there was any wrack have none. */
  wrack?: Wrack[]
}

/** The sea keeps no more than this many. */
export const WRACK_SIZE = 5

export const HOLD_TITLES: Record<Tier, string> = {
  1: 'Holder of the Quaysteps',
  2: 'Lord of the Lowstreets',
  3: 'Keeper of the Brinevaults',
  4: 'Sitter in the Iron Hall',
}

/** How many floors each hold is. */
export const FLOORS: Record<Tier, number> = { 1: 2, 2: 3, 3: 3, 4: 2 }

/** The depth each of the old holders holds. */
export const RIVAL_TIER: Record<Rival, Tier> = {
  hollin: 1,
  grue: 2,
  sethra: 3,
  corve: 4,
}

/** Where each holder waits: the last floor of the depth. */
export const holdFloor = (tier: Tier): number =>
  ({ 1: 2, 2: 5, 3: 8, 4: 10 })[tier]

/** Jarn's shingle, as the ledger counts it, and how long he has held it. */
export const SHINGLE = 3
const JARN_SINCE = -170

const FIRST: Record<Tier, [Rival, number]> = {
  1: ['hollin', -160],
  2: ['grue', -100],
  3: ['sethra', -80],
  4: ['corve', -140],
}

/** The world before anyone has gone down: the old holders, holding. */
export function firstWorld(): World {
  const holds = {} as Record<Tier, Claim>
  for (const t of TIER_LIST) {
    const [rival, since] = FIRST[t]
    holds[t] = { holder: rival, name: holders[rival].name, since, from: rival }
  }
  return { lowWater: 0, holds }
}

/** The world with these holds taken by `name`, as of now. */
export function withTaken(
  world: World,
  taken: readonly Tier[],
  name: string,
): World {
  const next = structuredClone(world)
  for (const t of taken) {
    const before = next.holds[t]
    next.holds[t] = {
      holder: 'you',
      name,
      since: next.lowWater,
      from: before.holder === 'you' ? before.from : before.holder,
    }
  }
  return next
}

export interface Row {
  who: Rival | 'jarn' | 'you'
  name: string
  titles: string[]
  /** Floors held. */
  ground: number
  /** Low waters the oldest of it has been held. */
  held: number
}

/** Everyone the ledger counts, the most ground first and the oldest first among equals. */
export function ranking(world: World): Row[] {
  const rows: Row[] = [
    {
      who: 'jarn',
      name: holders.jarn.name,
      titles: [],
      ground: SHINGLE,
      held: world.lowWater - JARN_SINCE,
    },
    ...(['hollin', 'grue', 'sethra', 'corve'] as const).map((r) =>
      row(world, r),
    ),
  ]
  const you = row(world, 'you')
  if (you.ground > 0) rows.push(you)
  return rows.sort((a, b) => b.ground - a.ground || b.held - a.held)
}

function row(world: World, who: Rival | 'you'): Row {
  const mine = TIER_LIST.filter((t) => world.holds[t].holder === who)
  const latest = mine
    .map((t) => world.holds[t])
    .sort((a, b) => b.since - a.since)[0]
  return {
    who,
    name:
      who === 'you'
        ? (latest?.name ?? '')
        : `${holders[who].name} ${holders[who].epithet}`,
    titles: mine.map((t) => HOLD_TITLES[t]),
    ground: mine.reduce((sum, t) => sum + FLOORS[t], 0),
    held: Math.max(
      0,
      ...mine.map((t) => world.lowWater - world.holds[t].since),
    ),
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The ranking as the ledger writes it, one line for each who counts. */
export function standing(world: World): string[] {
  return ranking(world).map((r, i) => {
    const titles = [...r.titles, ...(i === 0 ? ['the Linelord'] : [])]
      .map((t) => `, ${t}`)
      .join('')
    const what =
      r.who === 'jarn'
        ? 'the shingle under Wrackhead'
        : r.ground === 0
          ? null
          : plural(r.ground, 'floor')
    return what
      ? `${i + 1}. ${r.name}${titles}: ${what}, held ${plural(r.held, 'low water')}.`
      : `${i + 1}. ${r.name}${titles}: nothing held.`
  })
}

/** Whoever the ledger calls the Linelord. */
export function linelord(world: World): Row {
  const top = ranking(world)[0]
  if (!top) throw new Error('the ledger has nobody in it')
  return top
}

/**
 * The chance that a hold this many low waters old is taken back at the next
 * one: high while it is fresh, and never quite nothing. Old is stable; it is
 * not for ever.
 */
const contested = (age: number) => Math.max(0.05, 0.6 / (1 + age))

const tierName = (t: Tier) => TIERS[t].name.replace(/^The /, 'the ')

/**
 * The low water after a run: what it took is written in, every other hold of
 * yours may be taken back by the one it was taken from, and the clock moves.
 */
export function settle(
  world: World,
  taken: readonly Tier[],
  name: string,
  rng: Rng,
): { world: World; news: string[] } {
  const next = withTaken(world, taken, name)
  const news: string[] = []
  const tide = next.lowWater + 1
  for (const t of TIER_LIST) {
    const claim = next.holds[t]
    if (claim.holder !== 'you' || taken.includes(t)) continue
    if (!rng.chance(contested(next.lowWater - claim.since))) continue
    const back = claim.from
    next.holds[t] = {
      holder: back,
      name: holders[back].name,
      since: tide,
      from: back,
    }
    news.push(`${holders[back].name} has ${tierName(t)} back.`)
    news.push(rng.pick(pools['title-lost']))
  }
  next.lowWater = tide
  return { world: next, news }
}

/** What your holds pay at the start of a run: much while they are fresh, little once they are old. */
export function tribute(world: World): number {
  return TIER_LIST.filter((t) => world.holds[t].holder === 'you').reduce(
    (sum, t) =>
      sum +
      FLOORS[t] * Math.max(1, 10 - 3 * (world.lowWater - world.holds[t].since)),
    0,
  )
}

/** A run's wrack washed up, and what later runs took back taken away. */
export function washUp(
  world: World,
  fell: Wrack | null,
  cleared: readonly number[],
): World {
  const kept = (world.wrack ?? []).filter((w) => !cleared.includes(w.id))
  return {
    ...structuredClone(world),
    wrack: [...(fell ? [fell] : []), ...kept].slice(0, WRACK_SIZE),
  }
}

/** Where each wrack stands and what it holds, as the ledger writes it. */
export function wrackSaid(world: World): string[] {
  return (world.wrack ?? []).map((w) => {
    const things = [
      ...[w.weapon, w.armour].flatMap((k) =>
        k && ITEMS[k] ? [ITEMS[k].name] : [],
      ),
      ...(w.marks > 0 ? [`${w.marks} marks`] : []),
    ]
    const held =
      things.length === 0
        ? 'nothing'
        : things.length === 1
          ? things[0]
          : `${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}`
    return `${w.name}, on depth ${w.depth}, holding ${held}.`
  })
}

const isWrack = (v: unknown): v is Wrack =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Wrack).id === 'number' &&
  typeof (v as Wrack).name === 'string' &&
  typeof (v as Wrack).depth === 'number' &&
  typeof (v as Wrack).marks === 'number' &&
  typeof (v as Wrack).level === 'number'

const isClaim = (v: unknown): v is Claim =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Claim).holder === 'string' &&
  typeof (v as Claim).name === 'string' &&
  typeof (v as Claim).since === 'number' &&
  typeof (v as Claim).from === 'string'

export const isWorld = (v: unknown): v is World =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as World).lowWater === 'number' &&
  typeof (v as World).holds === 'object' &&
  (v as World).holds !== null &&
  TIER_LIST.every((t) => isClaim((v as World).holds[t])) &&
  ((v as World).wrack === undefined ||
    (Array.isArray((v as World).wrack) &&
      ((v as World).wrack ?? []).every(isWrack)))
