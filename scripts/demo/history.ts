/**
 * The history of the demo repository the documentation site is built from.
 *
 * Every screen LineLord draws is supposed to say something here, so the
 * commits below are chosen for what they make the numbers do: several warriors
 * with code of different ages, one of them committing under two addresses, a
 * file nobody but its author has touched, a reformatting sweep worth looking
 * past, and files that the exclusions must throw out.
 *
 * Commit dates are given as an age rather than a calendar date, and resolved
 * against a reference date when the repository is built. LineLord measures
 * every age it reports against now, so a fixture with fixed dates would drift:
 * "21% last touched within ninety days" becomes 0% a year after it was
 * written, and the published numbers would change without anyone touching
 * them. Resolved at build time, the site says the same thing forever.
 */

export interface DemoAuthor {
  name: string
  email: string
}

export interface DemoCommit {
  message: string
  author: DemoAuthor
  /** Days before the reference date. */
  ago: number
  /** Paths to create or overwrite, relative to the repository root. */
  write?: Record<string, string | Uint8Array>
  /** Paths to delete, relative to the repository root. */
  remove?: string[]
  /**
   * A sweep that rewrote lines without changing their meaning. The builder
   * records these in `.git-blame-ignore-revs`, which is the whole point of
   * having one in the fixture.
   */
  reformatting?: boolean
}

export interface ResolvedDemoCommit extends DemoCommit {
  date: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Offsets are plain days. Calendar arithmetic would have to decide what a
 * month before the 31st is, and the fixture gains nothing from the answer.
 */
export const years = (count: number): number => Math.round(count * 365)
export const months = (count: number): number => Math.round(count * 30)

/** Whole days from the earlier date to the later one. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

export const DEMO_AUTHORS = {
  /** Holds the most ground, and committed from two addresses along the way. */
  gorvek: {
    name: 'Gorvek of Bonereach',
    email: 'gorvek@bonereach.realm',
  },
  /** The same warrior, sworn to a new lord. Nothing merges this by itself. */
  gorvekAtKell: {
    name: 'Gorvek of Bonereach',
    email: 'gorvek@kell.realm',
  },
  /** Keeps to one file, which nobody else has touched. */
  drusk: {
    name: 'Captain Drusk',
    email: 'drusk@greycloaks.realm',
  },
  /** Arrived late, so the recent end of the histogram is not empty. */
  sarn: {
    name: 'Sarn the Faceless',
    email: 'sarn@kell.realm',
  },
  /**
   * Everything he wrote is gone. He is here because the history exists to
   * show precisely the person the present has forgotten: with no surviving
   * lines he is absent from every screen that reads HEAD, and the survival
   * figures are the only place he appears at all.
   */
  ruun: {
    name: 'Brother Ruun',
    email: 'ruun@thurn.realm',
  },
} as const satisfies Record<string, DemoAuthor>

/** A file long enough to count as legacy, and to make one day a massive battle. */
function legacyRites(): string {
  const rites = Array.from(
    { length: 110 },
    (_, index) =>
      `  recordRite(${index}, 'rite-${index}', ${index % 7}) // tithe of the ${index}th quarter`,
  )
  return [
    'function readTitheRolls(rolls) {',
    '  var total = 0',
    ...rites,
    '  return total',
    '}',
    '',
    'module.exports = { readTitheRolls }',
    '',
  ].join('\n')
}

/**
 * The holds Drusk keeps the rates for. Long enough that the share of the
 * codebase is spread across warriors rather than sitting in one file: an
 * overview where one bar is full and the rest are empty demonstrates nothing.
 */
function holdRates(): string {
  const holds = Array.from(
    { length: 64 },
    (_, index) =>
      `  'hold-${index}': ${(0.08 + (index % 9) * 0.01).toFixed(2)},`,
  )
  return [
    'export const holdRates: Record<string, number> = {',
    ...holds,
    '}',
    '',
    'export function rateOf(hold: string): number {',
    '  return holdRates[hold] ?? 0.12',
    '}',
    '',
  ].join('\n')
}

/** Sarn's work on the river, and the recent end of the age histogram. */
function riverWatch(): string {
  const gauges = Array.from(
    { length: 44 },
    (_, index) => `    ${1200 + index}: ${30 + (index % 17)},`,
  )
  return [
    'FLOOD_LEVEL = 40',
    '',
    '',
    'def gauges() -> dict[int, int]:',
    '    return {',
    ...gauges,
    '    }',
    '',
    '',
    'def drowned(depth: int) -> bool:',
    '    return depth > 3',
    '',
    '',
    'def quays_of_kell(level: int) -> str:',
    '    return "drowned" if level > FLOOD_LEVEL else "standing"',
    '',
  ].join('\n')
}

/** Ruun's work, written early and deleted before the present. */
function invocation(): string {
  const verses = Array.from(
    { length: 34 },
    (_, index) => `  invoke('verse-${index}', ${index})`,
  )
  return [
    "import { rateFor } from './tithe'",
    '',
    'export function invokeThurn(): void {',
    ...verses,
    '  void rateFor',
    '}',
    '',
  ].join('\n')
}

/**
 * What the long rites were cut down to. Most of the old file dies here, which
 * is what gives the cohort it belonged to a half-life the history can measure:
 * a fixture where nothing is ever rewritten reports a dash in that column and
 * teaches nobody what the column is for.
 */
function shortenedRites(): string {
  const rites = Array.from(
    { length: 38 },
    (_, index) => `  recordRite(${index}, 'rite-${index}', ${index % 7})`,
  )
  return [
    'function readTitheRolls(rolls) {',
    '  var total = 0',
    ...rites,
    '  return total',
    '}',
    '',
    'module.exports = { readTitheRolls }',
    '',
  ].join('\n')
}

/** Over the 50 KB threshold, so the analysis sets it aside unread. */
function bloatedRoster(): string {
  const rows = Array.from(
    { length: 2600 },
    (_, index) =>
      `${index},warrior-${index},bonereach,${1200 + index},sworn,unpaid`,
  )
  return `id,name,hold,tithe,status,settled\n${rows.join('\n')}\n`
}

/** A real PNG header, so git calls it binary for the same reason it always does. */
function sigil(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  ])
}

const { gorvek, gorvekAtKell, drusk, ruun, sarn } = DEMO_AUTHORS

export const DEMO_HISTORY: readonly DemoCommit[] = [
  {
    message: 'The ledger begins',
    author: gorvek,
    ago: years(4),
    write: {
      'README.md': [
        '# Tithe-rolls',
        '',
        'What the Greycloaks took, and from whom.',
        '',
      ].join('\n'),
      'src/ledger.ts': [
        "import { rateFor } from './tithe'",
        '',
        'export interface Entry {',
        '  hold: string',
        '  owed: number',
        '}',
        '',
        'export function owedBy(hold: string, harvest: number): Entry {',
        '  return { hold, owed: harvest * rateFor(hold) }',
        '}',
        '',
      ].join('\n'),
      Makefile: ['build:', '\tbun build src/ledger.ts', ''].join('\n'),
    },
  },
  {
    message: 'The rites of the old rolls, carried over as they were',
    author: gorvek,
    ago: years(4) - 11,
    write: { 'src/legacy/oldrites.js': legacyRites() },
  },
  {
    message: 'The invocation of Thurn, before every reckoning',
    author: ruun,
    ago: years(4) - 20,
    write: { 'src/rites/invocation.ts': invocation() },
  },
  {
    message: 'Drusk sets the rates, and keeps them',
    author: drusk,
    ago: years(3) + months(4),
    write: {
      'src/tithe.ts': [
        'const rates: Record<string, number> = {',
        '  bonereach: 0.1,',
        '  kell: 0.15,',
        '}',
        '',
        'export function rateFor(hold: string): number {',
        '  return rates[hold] ?? 0.12',
        '}',
        '',
      ].join('\n'),
    },
  },
  {
    message: 'Every hold and what it owes',
    author: drusk,
    ago: years(3) + months(3),
    write: { 'src/holds.ts': holdRates() },
  },
  {
    message: 'The roster, as the clerks keep it',
    author: drusk,
    ago: years(3) + months(2),
    write: { 'data/roster.csv': bloatedRoster() },
  },
  {
    message: 'The sigil, for the sealed rolls',
    author: gorvek,
    ago: years(3),
    write: { 'assets/sigil.png': sigil() },
  },
  {
    message: 'Lock what we build against',
    author: gorvek,
    ago: years(3) - 20,
    write: {
      'bun.lock': [
        '{',
        '  "lockfileVersion": 1,',
        '  "packages": {}',
        '}',
        '',
      ].join('\n'),
    },
  },
  {
    message: 'Gorvek, sworn to Kell, watches the river',
    author: gorvekAtKell,
    ago: years(2) + months(1),
    write: {
      'src/watch.go': [
        'package watch',
        '',
        '// Rising reports whether the river has passed the flood level.',
        'func Rising(level int) bool {',
        '\treturn level > FloodLevel',
        '}',
        '',
        'const FloodLevel = 40',
        '',
        '// Gauges are read in the order the river-priests walk them.',
        'var Gauges = []int{1200, 1201, 1202, 1203, 1204, 1205}',
        '',
        'func Highest(readings []int) int {',
        '\thighest := 0',
        '\tfor _, reading := range readings {',
        '\t\tif reading > highest {',
        '\t\t\thighest = reading',
        '\t\t}',
        '\t}',
        '\treturn highest',
        '}',
        '',
      ].join('\n'),
    },
  },
  {
    message: 'The schema, as the generator left it',
    author: gorvekAtKell,
    ago: years(2),
    write: {
      'src/schema_generated.ts': [
        '// Generated. Do not edit.',
        'export const tables = ["holds", "tithes"] as const',
        '',
      ].join('\n'),
    },
  },
  {
    message: 'Thurn is not invoked before a ledger entry',
    author: gorvek,
    ago: years(2) - months(2),
    remove: ['src/rites/invocation.ts'],
  },
  {
    message: 'Cut the old rites down to the ones still read',
    author: gorvek,
    ago: years(1) + months(9),
    write: { 'src/legacy/oldrites.js': shortenedRites() },
  },
  {
    message: 'Double quotes throughout. Not authorship.',
    author: drusk,
    ago: years(1) + months(6),
    reformatting: true,
    write: {
      'src/ledger.ts': [
        'import { rateFor } from "./tithe"',
        '',
        'export interface Entry {',
        '  hold: string',
        '  owed: number',
        '}',
        '',
        'export function owedBy(hold: string, harvest: number): Entry {',
        '  return { hold, owed: harvest * rateFor(hold) }',
        '}',
        '',
      ].join('\n'),
      'src/tithe.ts': [
        'const rates: Record<string, number> = {',
        '  bonereach: 0.1,',
        '  kell: 0.15,',
        '}',
        '',
        'export function rateFor(hold: string): number {',
        '  return rates[hold] ?? 0.12',
        '}',
        '',
      ].join('\n'),
    },
  },
  {
    message: 'What the river takes, it does not give back',
    author: sarn,
    ago: months(7),
    write: {
      'src/river.py': [
        'def drowned(depth: int) -> bool:',
        '    return depth > 3',
        '',
      ].join('\n'),
      'config.toml': ['[river]', 'flood_level = 40', ''].join('\n'),
    },
  },
  {
    message: 'Read every gauge the river-priests keep',
    author: sarn,
    ago: months(3),
    write: { 'src/river.py': riverWatch() },
  },
  {
    message: 'Say what the ledger is for',
    author: sarn,
    ago: 9,
    write: {
      'README.md': [
        '# Tithe-rolls',
        '',
        'What the Greycloaks took, and from whom.',
        '',
        'Read it before you swear to anything.',
        '',
      ].join('\n'),
    },
  },
]

/**
 * Turns the ages above into dates, oldest first. Throws rather than build a
 * repository whose history runs backwards, because git would accept it and
 * every age LineLord reported from it would be wrong.
 */
export function resolveDemoHistory(
  now: Date,
  history: readonly DemoCommit[] = DEMO_HISTORY,
): ResolvedDemoCommit[] {
  const resolved = history.map((commit) => ({
    ...commit,
    date: new Date(now.getTime() - commit.ago * DAY_MS),
  }))

  for (let index = 1; index < resolved.length; index += 1) {
    const previous = resolved[index - 1]
    const current = resolved[index]
    if (!previous || !current) continue
    if (current.date.getTime() <= previous.date.getTime()) {
      throw new Error(
        `The demo history is out of order: "${current.message}" is not after "${previous.message}"`,
      )
    }
  }

  return resolved
}
