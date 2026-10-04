/** Colours, glyphs and the small formatting every screen shares. */

export const C = {
  green: '#9ece6a',
  gray: '#7a7f93',
  dim: '#565f89',
  cyan: '#7dcfff',
  blue: '#7aa2f7',
  yellow: '#e0af68',
  orange: '#ff9e64',
  magenta: '#bb9af7',
  red: '#f7768e',
  text: '#c0caf5',
  strip: '#1f2335',
  selected: '#2f3549',
  marked: '#3b3f5c',
} as const

/** The crown and the medals, for the three who hold the most. */
export const MEDALS = ['👑', '🥈', '🥉']

/**
 * Text with the emoji variation selector taken out.
 *
 * ⚔️ 🛡️ 🗡️ are symbols that become emoji only when U+FE0F follows them, and
 * terminals disagree on whether that makes them one cell wide or two -- so
 * everything after them on the line lands somewhere different in each. Without
 * the selector every terminal draws them one cell wide. The ones that are
 * always emoji (👑 🏰 🏆) are left alone.
 */
export function steady(text: string): string {
  return text.replace(/️/g, '')
}

/** A number in a column, never wider than the column allows for. */
export function fit(n: number, width: number): string {
  const whole = Math.round(n)
  const plain = whole.toLocaleString('en-GB')
  if (plain.length < width) return plain.padStart(width)
  if (whole < 1_000_000) return `${Math.round(whole / 1000)}k`.padStart(width)
  return `${(whole / 1_000_000).toFixed(1)}M`.padStart(width)
}

export function count(n: number): string {
  return n.toLocaleString('en-GB')
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`
}

export function percent(part: number, whole: number): string {
  if (whole <= 0) return '—'
  const value = (part / whole) * 100
  return value > 0 && value < 0.1 ? '<0.1%' : `${value.toFixed(1)}%`
}

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const suffix: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  return `${n}${suffix[n % 10] ?? 'th'}`
}
