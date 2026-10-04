/** Partial blocks, one eighth of a cell wider each. */
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/**
 * A horizontal bar for a fraction, exactly `width` cells wide.
 *
 * Eighth blocks give eight steps a cell, so a bar twenty cells wide tells 160
 * values apart where whole blocks told twenty. A share too small to reach one
 * eighth is drawn as the thinnest sliver, because a warrior who holds lines
 * is not one who holds none.
 */
export function bar(fraction: number, width: number): string {
  const clamped = Math.min(1, Math.max(0, fraction))
  let eighths = Math.round(clamped * width * 8)
  if (clamped > 0 && eighths === 0) eighths = 1
  const whole = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8] ?? ''
  return ('█'.repeat(whole) + part).padEnd(width)
}
