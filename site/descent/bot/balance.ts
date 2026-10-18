/**
 * How far the bot gets, run after run: for each background, the share of runs
 * that reached each depth, and what ended them. The point is the shape of the
 * curve. A depth where the share falls off a cliff is a depth that kills.
 */
import { BACKGROUNDS, LAST_DEPTH } from '../core/content'
import type { Background } from '../core/types'
import { playRun, type RunResult } from './bot'

export interface Spread {
  bg: Background
  runs: number
  /** Index d: how many runs reached depth d or deeper. */
  reached: number[]
  escaped: number
  /** What ended the runs, most often first. */
  causes: [string, number][]
  medianTurns: number
}

export function spread(bg: Background, results: RunResult[]): Spread {
  const reached = Array.from(
    { length: LAST_DEPTH + 1 },
    (_, d) => results.filter((r) => r.deepest >= d).length,
  )
  const causes = new Map<string, number>()
  for (const r of results) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1)
  const turns = results.map((r) => r.turns).sort((a, b) => a - b)
  return {
    bg,
    runs: results.length,
    reached,
    escaped: results.filter((r) => r.ending === 'escaped').length,
    causes: [...causes].sort((a, b) => b[1] - a[1]),
    medianTurns: turns[Math.floor(turns.length / 2)] ?? 0,
  }
}

/** `runs` runs of each background, on seeds 1 to `runs`. */
export function weigh(
  runs: number,
  bgs: Background[] = Object.keys(BACKGROUNDS) as Background[],
): Spread[] {
  return bgs.map((bg) =>
    spread(
      bg,
      Array.from({ length: runs }, (_, i) => playRun(bg, i + 1)),
    ),
  )
}

const share = (n: number, of: number) =>
  `${Math.round((100 * n) / Math.max(1, of))}%`.padStart(5)

/** The spreads as a table to read in a terminal. */
export function report(spreads: Spread[]): string {
  const depths = Array.from({ length: LAST_DEPTH }, (_, i) => i + 1)
  const head = `${'reached'.padEnd(10)}${depths.map((d) => String(d).padStart(5)).join('')}  escaped`
  const rows = spreads.map(
    (s) =>
      `${BACKGROUNDS[s.bg].name.padEnd(10)}${depths.map((d) => share(s.reached[d] ?? 0, s.runs)).join('')}  ${share(s.escaped, s.runs)}`,
  )
  const causes = spreads.map(
    (s) =>
      `${BACKGROUNDS[s.bg].name}, ${s.runs} runs, median ${s.medianTurns} turns:\n${s.causes
        .slice(0, 6)
        .map(([cause, n]) => `  ${share(n, s.runs)}  ${cause}`)
        .join('\n')}`,
  )
  return [head, ...rows, '', ...causes].join('\n')
}
