import {
  type GallowmarkPool,
  gallowmarkQuotes,
} from './resources/gallowmarkQuotes'

const FALLBACK: Record<GallowmarkPool, string> = {
  farewell: 'Farewell!',
  initializing: 'By the Ashfall, we begin…',
  scanning: 'Crushing enemies…',
  analyzing: 'Counting spoils…',
  complete: 'By the Ashfall, the survey is complete!',
}

/**
 * A quote from one of the Gallowmark pools, for the loading screen, the
 * footer and the farewell. `random` is a parameter so a test can fix it.
 */
export function pickQuote(
  pool: GallowmarkPool,
  random: () => number = Math.random,
): string {
  const lines = gallowmarkQuotes[pool]
  return lines[Math.floor(random() * lines.length)] ?? FALLBACK[pool]
}
