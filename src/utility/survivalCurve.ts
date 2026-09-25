import type { SurvivalPoint } from '../core/survival'

/**
 * Drawing a survival curve in a terminal.
 *
 * Block characters rather than a plotting library: the shape is the whole
 * point -- does this person's work fall away quickly or hold -- and a
 * dependency for that would be a poor trade.
 */

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

/**
 * One row of blocks, oldest age on the right.
 *
 * The height is the fraction still alive, so a full block is all of it and a
 * space is none: an empty column means the work was gone by then, and a
 * shortest block would say "a little left" where there is none.
 */
export function renderSurvivalCurve(
  curve: SurvivalPoint[],
  width = 24,
): string {
  if (curve.length === 0) return ''

  const points = curve.length <= width ? curve : sampleTo(curve, width)
  return points
    .map((point) => {
      const alive = Math.max(0, Math.min(1, point.fractionAlive))
      if (alive === 0) return ' '
      const step = Math.ceil(alive * BLOCKS.length)
      return BLOCKS[Math.min(BLOCKS.length, Math.max(1, step)) - 1]
    })
    .join('')
}

/**
 * Thin a long curve down to the width available.
 *
 * Takes the lowest point in each column rather than the first. A curve that
 * is being summarised should not be able to look better than it was.
 */
function sampleTo(curve: SurvivalPoint[], width: number): SurvivalPoint[] {
  const out: SurvivalPoint[] = []
  for (let column = 0; column < width; column++) {
    const from = Math.floor((column * curve.length) / width)
    const to = Math.max(
      from + 1,
      Math.floor(((column + 1) * curve.length) / width),
    )
    let lowest = curve[from]
    for (let at = from; at < to && at < curve.length; at++) {
      const point = curve[at]
      if (point && (!lowest || point.fractionAlive < lowest.fractionAlive)) {
        lowest = point
      }
    }
    if (lowest) out.push(lowest)
  }
  return out
}

/** The age the curve reaches, as a label for its right-hand end. */
export function curveSpanDays(curve: SurvivalPoint[]): number {
  return curve[curve.length - 1]?.ageDays ?? 0
}
