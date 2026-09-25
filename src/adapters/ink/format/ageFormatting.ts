import type { AgeHistogram } from '../../../core/longevity'

/**
 * Turning ages into something readable at a glance.
 *
 * A dashboard column has room for "3y 2m" and not for "1174.3 days", and the
 * precision that is lost was never meaningful: nobody needs the hours on a
 * line written two years ago.
 */

/** An age in days, as a person would say it. */
export function formatAge(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '—'
  if (days < 1) return '<1d'
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}m`

  const years = Math.floor(days / 365)
  const months = Math.round((days - years * 365) / 30)
  // Twelve months rounded up is another year, not "2y 12m".
  if (months >= 12) return `${years + 1}y 0m`
  return `${years}y ${months}m`
}

/** The two ends of a spread, as one column. */
export function formatSpread(youngerDays: number, olderDays: number): string {
  return `${formatAge(youngerDays)} – ${formatAge(olderDays)}`
}

/** The buckets, newest on the left, in the order they are drawn. */
export const HISTOGRAM_BUCKETS: Array<{
  key: keyof AgeHistogram
  label: string
}> = [
  { key: 'underAWeek', label: 'under a week' },
  { key: 'weekToMonth', label: 'a week to a month' },
  { key: 'oneToThreeMonths', label: 'one to three months' },
  { key: 'threeToTwelveMonths', label: 'three to twelve months' },
  { key: 'oneToTwoYears', label: 'one to two years' },
  { key: 'overTwoYears', label: 'over two years' },
]

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

/**
 * The age histogram as one line of blocks, newest code on the left.
 *
 * Scaled to the tallest bucket, so the shape is the whole point and the
 * absolute counts are not: this says where somebody's code sits in time, and
 * the detail view gives the numbers.
 *
 * An empty bucket is a space rather than the shortest block. A bar that shows
 * "some" where there is none would be the one thing a glanceable summary must
 * not do.
 */
export function renderAgeSparkline(histogram: AgeHistogram): string {
  const counts = HISTOGRAM_BUCKETS.map(({ key }) => histogram[key])
  const tallest = Math.max(...counts)
  if (tallest <= 0) return ' '.repeat(counts.length)

  return counts
    .map((count) => {
      if (count <= 0) return ' '
      const step = Math.ceil((count / tallest) * BLOCKS.length)
      return BLOCKS[Math.min(BLOCKS.length, Math.max(1, step)) - 1]
    })
    .join('')
}
