import { eq } from 'drizzle-orm'
import type { LineLordDatabase } from './database'
import { meta } from './schema'

/**
 * Read one key, or null when the database has never recorded it.
 *
 * Null is the expected answer on a first run and on a cache written by a
 * version that did not know about this key yet. Neither is an error; both mean
 * the same thing to a caller deciding whether a cache can be trusted, which is
 * no.
 */
export function readMeta(db: LineLordDatabase, key: string): string | null {
  const [row] = db.select().from(meta).where(eq(meta.key, key)).all()
  return row?.value ?? null
}

/** Every key the database has recorded, as a plain object. */
export function readAllMeta(db: LineLordDatabase): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const row of db.select().from(meta).all()) {
    entries[row.key] = row.value
  }
  return entries
}

/**
 * Write keys, replacing any that are already there.
 *
 * One transaction, because these keys are only meaningful together: a database
 * recording the revision it was built against but not the threshold it used
 * describes nothing anyone can act on.
 */
export function writeMeta(
  db: LineLordDatabase,
  entries: Record<string, string>,
): void {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }))
  if (rows.length === 0) return

  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(meta)
        .values(row)
        .onConflictDoUpdate({ target: meta.key, set: { value: row.value } })
        .run()
    }
  })
}

export { HISTORY_HEAD_KEY, HISTORY_SNAPSHOTS_KEY } from '../../core/history'
