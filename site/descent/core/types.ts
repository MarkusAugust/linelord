/**
 * The shape of a run. Everything a save needs is in `Game`, and all of it is
 * plain data: a run is written to storage as JSON and read back the same.
 */

import type { Tier, World, Wrack } from './holds'

export type Background = 'ashborn' | 'wrecker' | 'novice'

/** 8 = d8, 6 = d6, 4 = d4, 0 = spent. */
export type Die = 0 | 4 | 6 | 8

export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export interface Pos {
  x: number
  y: number
}

export interface Item {
  /** A key into `ITEMS`, or `marks` for coin on the floor. */
  kind: string
  /** Marks: how many. */
  amount?: number
  /** Iron found in Kell: it never wears, and it is a little weaker. */
  old?: boolean
  /** New iron's wear, as a die; full (8) when not given. */
  wear?: Die
}

export interface Monster {
  id: number
  /** A key into `MONSTERS`. */
  kind: string
  x: number
  y: number
  hp: number
  maxHp: number
  awake: boolean
  /** A Firstcloak that has been paid. */
  peaceful: boolean
  /** A Firstcloak that has been refused. */
  refused: boolean
  /** Notches cut while the player was in sight. */
  notches: number
  /** A warrior of an earlier run, come back as one of the Unasked. */
  bones?: { name: string; weapon: string | null }
  /** A holder who has said who they are. */
  spoke?: boolean
  /** A holder who has given way, and the hold with it. */
  yielded?: boolean
  /** The wrack of an earlier run, and what it holds. */
  wrack?: Wrack
}

export interface Level {
  depth: number
  w: number
  h: number
  /** One string per row. */
  tiles: string[]
  /** Height above the low-water mark, per cell; the flood covers the lowest first. */
  elev: number[]
  seen: boolean[]
  up: Pos
  down: Pos | null
  items: { x: number; y: number; item: Item }[]
  monsters: Monster[]
  /** Where the grey stands; it spreads from these at low water. */
  grey: Pos[]
}

export interface Player {
  name: string
  bg: Background
  x: number
  y: number
  hp: number
  maxHp: number
  xp: number
  level: number
  might: number
  will: number
  /** Grey marks. At six you are one of the Unasked. */
  grey: number
  marks: number
  lamp: Die
  water: Die
  rope: Die
  pack: Item[]
  weapon: string | null
  armour: string | null
  /** The weapon in hand is Kell's iron. */
  oldWeapon?: boolean
  /** The armour worn is Kell's iron. */
  oldArmour?: boolean
  /** The edge on the weapon in hand, as a die; 0 is blunt. Full when not given. */
  edge?: Die
  /** What is left of the armour worn, as a die; 0 keeps nothing out. */
  fit?: Die
  /** The id of the Drawn that has hold of you. */
  held: number | null
  /** The salt-pile has been paid, and the sea will give you back once. */
  owed: boolean
  /** The next attack is meant: rolled twice, and paid for in grey. */
  meaning: boolean
  /** Marks gained since the last time at Wrackhead; the fort tithes these. */
  gained: number
  deepest: number
  /** Kinds slain this run, which Ruun can name. */
  slain: string[]
}

export type Prompt =
  | { kind: 'tithe'; monster: number }
  | { kind: 'gift'; gift: string }

export type Ending = 'escaped' | 'dead' | 'unasked'

/** A warrior of an earlier run who became one of the Unasked. */
export interface Bones {
  name: string
  weapon: string | null
}

export interface Game {
  seed: number
  turn: number
  /** 0 is Wrackhead. */
  depth: number
  level: Level
  player: Player
  /** Names learned, in this run and the ones before it. */
  known: string[]
  /** Turns left that the tide is held still. */
  held: number
  prompt: Prompt | null
  /** The shop the player is standing in, in Wrackhead. */
  shop: string | null
  /** Sarn has made an offer on these depths. */
  offered: number[]
  /** Mardra has traded since the last descent. */
  traded: boolean
  over: { ending: Ending; cause: string } | null
  nextId: number
  /** The tide clock. It runs with the turns, except while a stream is held. */
  tide: number
  /** Waiting in the Lowstreets for this run to meet. */
  bones?: Bones
  /** Who held what when this run went down. Runs saved before there were holds have none. */
  world?: World
  /** The holds this run has taken. */
  taken?: Tier[]
  /** The wrack this run has taken back, by id. */
  cleared?: number[]
}

export type Command =
  | { type: 'move'; dir: Dir }
  | { type: 'wait' }
  | { type: 'stairs' }
  | { type: 'get' }
  | { type: 'use'; index: number }
  | { type: 'drop'; index: number }
  | { type: 'mean' }
  | { type: 'name'; dir: Dir }
  | { type: 'stop' }
  | { type: 'rope' }
  | { type: 'answer'; yes: boolean }
  | { type: 'shop'; key: string }
  | { type: 'leave' }

export interface Outcome {
  game: Game
  lines: string[]
}
