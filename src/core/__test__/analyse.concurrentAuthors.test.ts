import { afterEach, describe, expect, it } from 'bun:test'
import { analyseInto } from '../../__test__/helpers/analyseInto'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../adapters/sqlite/database'
import { authors, blameLines } from '../../adapters/sqlite/schema'

/**
 * Several files blamed at once, all introducing the same new contributor.
 *
 * Authors are created on the way through the blame output, and files are
 * blamed twelve at a time. Looking an author up and then inserting them is
 * two steps with an await between, so two files in the same batch can both
 * find nobody and both insert -- and the second loses its whole file to a
 * unique-constraint error on the address.
 */

const WARRIORS = [
  { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' },
  { name: 'Sister Nightshroud', email: 'night@alderstone.realm' },
  { name: 'Zygofer the Defiler', email: 'zygofer@vale.realm' },
  { name: 'Merigall the Trickster', email: 'merigall@bitterreach.realm' },
  { name: 'Rust the Ravenlander', email: 'rust@ravenland.realm' },
]

describe('blaming many files at once', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('creates every contributor once, and loses no file to the attempt', async () => {
    // Thirty files across five contributors, interleaved so that the first
    // batch of twelve introduces each of them more than once.
    repo = await createTestRepo()
    for (let index = 0; index < 30; index++) {
      const warrior = WARRIORS[index % WARRIORS.length]
      await repo.commit({
        message: `file ${index}`,
        author: warrior,
        write: { [`src/file-${index}.ts`]: `const a${index} = ${index}\n` },
      })
    }

    const db = createDatabase()
    const outcome = await analyseInto(repo.path, db)

    expect(outcome.failures).toEqual([])

    const stored = await db.select({ email: authors.email }).from(authors)
    expect(stored.map((one) => one.email).sort()).toEqual(
      WARRIORS.map((one) => one.email).sort(),
    )

    // One line per file, and every one of them attributed.
    const lines = await db.select({ id: blameLines.id }).from(blameLines)
    expect(lines).toHaveLength(30)
  }, 60000)
})
