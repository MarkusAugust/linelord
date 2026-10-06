/**
 * What is down there, as data: the creatures, the things you can carry, the
 * backgrounds and the titles. The rules read this; nothing here does anything.
 * The creatures and their natures are the canon's (`creatures/` in
 * Gallowmark); the numbers are the game's.
 */
import type { CreatureId } from '../lore'
import type { Rival } from './holds'
import type { Background, Die } from './types'

export const LAST_DEPTH = 10

export interface Tier {
  name: string
  pool: 'arrive-quays' | 'arrive-streets' | 'arrive-vaults' | 'arrive-hall'
}

export const TIERS: Record<1 | 2 | 3 | 4, Tier> = {
  1: { name: 'The Quaysteps', pool: 'arrive-quays' },
  2: { name: 'The Lowstreets', pool: 'arrive-streets' },
  3: { name: 'The Brinevaults', pool: 'arrive-vaults' },
  4: { name: 'The Iron Hall', pool: 'arrive-hall' },
}

export function tierOf(depth: number): 1 | 2 | 3 | 4 {
  if (depth <= 2) return 1
  if (depth <= 5) return 2
  if (depth <= 8) return 3
  return 4
}

export interface MonsterKind {
  /** What it is in the canon: one of its creatures, or one of the holders. */
  creature?: CreatureId
  holder?: Rival
  glyph: string
  /** What you call it before you know its name. */
  unknown: string
  /** What you call it once you do. */
  known: string
  hp: number
  ac: number
  hit: number
  dmg: [number, number]
  xp: number
  tiers: (1 | 2 | 3 | 4)[]
  /** Comes for you twice as fast when you are parched or bleeding. */
  hunts?: boolean
  /** Never leaves its door. */
  stays?: boolean
  /** Asks a tenth before it fights. */
  tithes?: boolean
  /** Does not fight; counts. */
  counts?: boolean
  /** Takes hold, and pulls toward the drain. */
  grabs?: boolean
  /** Takes marks on a hit. */
  steals?: boolean
  /** Lets you be, until you raise a hand to it. */
  waits?: boolean
}

export const MONSTERS: Record<string, MonsterKind> = {
  picker: {
    creature: 'pickers',
    glyph: 'p',
    unknown: 'a crouched figure',
    known: 'a Picker',
    hp: 6,
    ac: 10,
    hit: 2,
    dmg: [1, 4],
    xp: 3,
    tiers: [1, 2],
    steals: true,
  },
  firstcloak: {
    creature: 'firstcloaks',
    glyph: 'c',
    unknown: 'a grey-cloaked shape',
    known: 'a Firstcloak',
    hp: 12,
    ac: 13,
    hit: 4,
    dmg: [1, 6],
    xp: 6,
    tiers: [1, 2, 4],
    tithes: true,
  },
  barred: {
    creature: 'the-barred',
    glyph: 'b',
    unknown: 'a shape leaning on a door',
    known: 'one of the Barred',
    hp: 9,
    ac: 11,
    hit: 3,
    dmg: [1, 4],
    xp: 4,
    tiers: [2],
    stays: true,
  },
  unasked: {
    creature: 'the-unasked',
    glyph: 'u',
    unknown: 'a thin, quick thing',
    known: 'one of the Unasked',
    hp: 10,
    ac: 12,
    hit: 4,
    dmg: [1, 6],
    xp: 7,
    tiers: [2, 3, 4],
    hunts: true,
  },
  notcher: {
    creature: 'notchers',
    glyph: 'n',
    unknown: 'a thin grey shape',
    known: 'a Notcher',
    hp: 7,
    ac: 13,
    hit: 0,
    dmg: [0, 0],
    xp: 8,
    tiers: [3, 4],
    counts: true,
  },
  drawn: {
    creature: 'the-drawn',
    glyph: 'd',
    unknown: 'a hanged thing on a rope',
    known: 'one of the Drawn',
    hp: 14,
    ac: 11,
    hit: 4,
    dmg: [1, 3],
    xp: 9,
    tiers: [3, 4],
    grabs: true,
  },
  // What the sea gave back of an earlier run. Never laid down at random:
  // it stands where that run fell, and is made stronger by how far it got.
  wrack: {
    creature: 'wrack',
    glyph: 'w',
    unknown: 'something that walks like you',
    known: 'your wrack',
    hp: 8,
    ac: 11,
    hit: 2,
    dmg: [1, 6],
    xp: 12,
    tiers: [],
  },
  // The holders. They are never laid down at random (no tiers): each waits
  // on the last floor of the depth it holds.
  hollin: {
    holder: 'hollin',
    glyph: 'H',
    unknown: 'Hollin',
    known: 'Hollin',
    hp: 16,
    ac: 11,
    hit: 2,
    dmg: [1, 4],
    xp: 20,
    tiers: [],
    steals: true,
  },
  grue: {
    holder: 'grue',
    glyph: 'G',
    unknown: 'Grue',
    known: 'Grue',
    hp: 26,
    ac: 13,
    hit: 4,
    dmg: [1, 8],
    xp: 30,
    tiers: [],
    stays: true,
    tithes: true,
  },
  sethra: {
    holder: 'sethra',
    glyph: 'S',
    unknown: 'Sethra',
    known: 'Sethra',
    hp: 24,
    ac: 14,
    hit: 5,
    dmg: [1, 6],
    xp: 40,
    tiers: [],
    waits: true,
  },
  corve: {
    holder: 'corve',
    glyph: 'C',
    unknown: 'Corve',
    known: 'Corve',
    hp: 34,
    ac: 15,
    hit: 6,
    dmg: [2, 6],
    xp: 60,
    tiers: [],
    stays: true,
  },
}

export type ItemUse =
  | 'weapon'
  | 'armour'
  | 'oil'
  | 'water'
  | 'rope'
  | 'salt'
  | 'vial'
  | 'trinket'
  | 'page'
  | 'ledger'

export interface ItemKind {
  glyph: string
  /** What it is called before it is named, for the things that need naming. */
  unknown?: string
  name: string
  use: ItemUse
  price: number
  /** Weapons: dice and a bonus to hit. */
  dmg?: [number, number]
  bonus?: number
  /** Weapons that cut a Drawn's rope. */
  cuts?: boolean
  /** Armour. */
  ac?: number
  /** Vials: what happens when you drink. */
  effect?: 'breath' | 'clear' | 'will' | 'grey' | 'mend' | 'sea'
  /** A gift of Sarn's: never sold, never found. */
  sarn?: boolean
  tiers?: (1 | 2 | 3 | 4)[]
}

export const ITEMS: Record<string, ItemKind> = {
  knife: {
    glyph: ')',
    name: 'a knife',
    use: 'weapon',
    price: 8,
    dmg: [1, 4],
    bonus: 1,
  },
  hook: {
    glyph: ')',
    name: "a wrecker's hook",
    use: 'weapon',
    price: 22,
    dmg: [1, 6],
    bonus: 0,
    cuts: true,
    tiers: [1, 2],
  },
  spear: {
    glyph: ')',
    name: 'a quay spear',
    use: 'weapon',
    price: 30,
    dmg: [1, 6],
    bonus: 2,
    tiers: [1, 2, 3],
  },
  axe: {
    glyph: ')',
    name: 'an axe',
    use: 'weapon',
    price: 38,
    dmg: [1, 8],
    bonus: 0,
    tiers: [2, 3],
  },
  'sarn-blade': {
    glyph: ')',
    name: 'a blade with no maker',
    use: 'weapon',
    price: 0,
    dmg: [2, 6],
    bonus: 3,
    cuts: true,
    sarn: true,
  },
  leather: {
    glyph: '[',
    name: 'a salt-hard jerkin',
    use: 'armour',
    price: 15,
    ac: 2,
  },
  mail: {
    glyph: '[',
    name: 'mail with the dye scrubbed out',
    use: 'armour',
    price: 45,
    ac: 4,
    tiers: [2, 3],
  },
  cloakmail: {
    glyph: '[',
    name: "a Firstcloak's mail",
    use: 'armour',
    price: 60,
    ac: 5,
    tiers: [3, 4],
  },
  oil: {
    glyph: '!',
    name: 'a flask of lamp oil',
    use: 'oil',
    price: 6,
    tiers: [1, 2, 3],
  },
  skin: {
    glyph: '!',
    name: 'a skin of water',
    use: 'water',
    price: 4,
    tiers: [1, 2, 3, 4],
  },
  coil: {
    glyph: '&',
    name: 'a coil of rope',
    use: 'rope',
    price: 8,
    tiers: [1, 2],
  },
  salt: {
    glyph: ',',
    name: 'a handful of salt',
    use: 'salt',
    price: 5,
    tiers: [1, 2, 3, 4],
  },
  'sarn-lamp': {
    glyph: '!',
    name: 'a lamp that does not burn grey',
    use: 'oil',
    price: 0,
    sarn: true,
  },
  'vial-grey': {
    glyph: '!',
    unknown: 'a grey vial',
    name: 'a grey vial of breath',
    use: 'vial',
    price: 20,
    effect: 'breath',
    tiers: [1, 2, 3, 4],
  },
  'vial-salt': {
    glyph: '!',
    unknown: 'a salt-stoppered vial',
    name: 'a salt-stoppered vial of clear sight',
    use: 'vial',
    price: 25,
    effect: 'clear',
    tiers: [1, 2, 3, 4],
  },
  'vial-cloud': {
    glyph: '!',
    unknown: 'a cloudy vial',
    name: 'a cloudy vial of will',
    use: 'vial',
    price: 30,
    effect: 'will',
    tiers: [2, 3, 4],
  },
  'vial-black': {
    glyph: '!',
    unknown: 'a black vial',
    name: 'a black vial of the grey',
    use: 'vial',
    price: 2,
    effect: 'grey',
    tiers: [2, 3, 4],
  },
  'vial-warm': {
    glyph: '!',
    unknown: 'a warm vial',
    name: 'a warm vial of mending',
    use: 'vial',
    price: 50,
    effect: 'mend',
    tiers: [3, 4],
  },
  'vial-bitter': {
    glyph: '!',
    unknown: 'a bitter vial',
    name: 'a bitter vial of the sea',
    use: 'vial',
    price: 15,
    effect: 'sea',
    tiers: [1, 2, 3, 4],
  },
  ring: {
    glyph: '*',
    unknown: 'a warm ring',
    name: "a ring of Kell's iron",
    use: 'trinket',
    price: 60,
    tiers: [3, 4],
  },
  seal: {
    glyph: '*',
    unknown: 'a seal on a cord',
    name: "a clerk's seal",
    use: 'trinket',
    price: 35,
    tiers: [2, 3],
  },
  bollard: {
    glyph: '*',
    unknown: 'a green ring of bronze',
    name: 'a bollard-ring',
    use: 'trinket',
    price: 12,
    tiers: [1, 2],
  },
  token: {
    glyph: '*',
    unknown: 'a stamped tin disc',
    name: 'a tithe token of the order',
    use: 'trinket',
    price: 25,
    tiers: [1, 2, 4],
  },
  page: {
    glyph: '?',
    name: "a clerk's page",
    use: 'page',
    price: 3,
    tiers: [3],
  },
  ledger: { glyph: '=', name: 'the ledger', use: 'ledger', price: 0 },
}

/** Whether a kind of thing has to be named before it is known. */
export const needsNaming = (kind: string): boolean =>
  ITEMS[kind]?.unknown !== undefined

export interface BackgroundKind {
  name: string
  what: string
  hp: number
  /** The die rolled for hit points at every new level. */
  grit: number
  might: number
  will: number
  rope: Die
}

export const BACKGROUNDS: Record<Background, BackgroundKind> = {
  ashborn: {
    name: 'Ashborn',
    what: 'Walked out of the grey in the north. Strong, and nobody asks what you ate.',
    hp: 16,
    grit: 8,
    might: 2,
    will: 0,
    rope: 6,
  },
  wrecker: {
    name: 'Wrecker',
    what: 'Born on the shingle. The flood drowns you slower, and your lamp keeps in the wet.',
    hp: 13,
    grit: 6,
    might: 1,
    will: 1,
    rope: 8,
  },
  novice: {
    name: 'Novice',
    what: 'Left Hookford without asking. Weak, but names come to you cheap.',
    hp: 11,
    grit: 4,
    might: 0,
    will: 4,
    rope: 6,
  },
}

/**
 * XP to reach each level. A level makes you stronger and nothing else: what
 * the coast calls you is what you hold (`HOLD_TITLES`).
 */
export const LEVELS: readonly number[] = [
  0, 10, 25, 45, 70, 100, 140, 190, 250, 320,
]

/** What Sarn offers, and what Sarn takes. Neither is said in advance. */
export const GIFTS = ['sarn-blade', 'sarn-lamp', 'purse'] as const
export const THEFTS = ['maxhp', 'names', 'map', 'item', 'grey'] as const
