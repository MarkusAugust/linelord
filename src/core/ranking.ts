import type { AuthorChanges } from '../ports/storage'
import { getDistributedTitlesWithAssignment } from '../resources/rankedTitles'
import type { AnalysisData } from './model'

/**
 * Rank, share and title for every canonical author, as changes to store.
 *
 * Decided over the whole repository at once, which is why it runs again
 * after any change however small: a rank is a position among everyone, and
 * cannot be updated in part. The result is what to write, not a write --
 * the caller hands it to the storage port.
 */
export function rankAuthors(
  data: AnalysisData,
): Array<{ id: number; changes: AuthorChanges }> {
  const canonical = data.authors.filter((author) => author.isCanonical)
  const canonicalIds = new Set(canonical.map((author) => author.id))

  const lines = new Map<number, number>()
  let totalProjectLines = 0
  for (const line of data.lines) {
    if (!canonicalIds.has(line.authorId)) continue
    lines.set(line.authorId, (lines.get(line.authorId) ?? 0) + 1)
    totalProjectLines += 1
  }

  // Nothing to rank. Nothing is written either, so an author's standing from
  // a previous run is left as it was rather than erased over an empty tree.
  if (totalProjectLines === 0) return []

  const contributing = canonical
    .filter((author) => (lines.get(author.id) ?? 0) > 0)
    .sort(
      (a, b) => (lines.get(b.id) ?? 0) - (lines.get(a.id) ?? 0) || a.id - b.id,
    )

  const titles = getDistributedTitlesWithAssignment(
    contributing.map((author) => author.displayName),
  )

  const changes: Array<{ id: number; changes: AuthorChanges }> =
    contributing.map((author, index) => ({
      id: author.id,
      changes: {
        rank: index + 1,
        percentage: percentageOf(lines.get(author.id) ?? 0, totalProjectLines),
        title: titles[index]?.title ?? 'peasant',
      },
    }))

  const ranked = new Set(contributing.map((author) => author.id))
  for (const author of canonical) {
    if (ranked.has(author.id)) continue
    changes.push({
      id: author.id,
      changes: { rank: null, percentage: 0, title: null },
    })
  }

  return changes
}

/** A share of the whole, rounded to two decimals. */
function percentageOf(authorLines: number, totalLines: number): number {
  if (totalLines === 0) return 0
  return Math.round((authorLines / totalLines) * 100 * 100) / 100
}
