import { describe, expect, it } from 'bun:test'
import { createDatabase } from '../database'
import { createSqliteStore } from '../store'

/**
 * Creating the same contributor twice at once.
 *
 * Looking an author up and then inserting them is two steps with an await
 * between, so two files in one batch can both find nobody and both insert
 * -- and the second loses its whole file to a unique-constraint error on
 * the address. The store's insert is idempotent, so both callers get the
 * one row.
 */
describe('ensureAuthors, called twice at once for one address', () => {
  it('returns the one row rather than failing the second caller', async () => {
    const store = createSqliteStore(createDatabase())
    const gorvek = {
      name: 'Gorvek the Ironbane',
      email: 'gorvek@ashendale.realm',
      displayName: 'Gorvek the Ironbane',
    }

    const [first, second] = await Promise.all([
      store.ensureAuthors([gorvek]),
      store.ensureAuthors([gorvek]),
    ])

    expect(first.get(gorvek.email)).toBe(second.get(gorvek.email) ?? -1)
    expect(await store.listAuthors()).toHaveLength(1)
  })
})
