import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { authors, blameLines } from '../../db/schema'
import { GitService } from '../GitService'

/**
 * Several files blamed at once, all introducing the same new contributor.
 *
 * Authors are created on the way through the blame output, and files are
 * blamed twelve at a time. Looking an author up and then inserting them is
 * two steps with an await between, so two files in the same batch can both
 * find nobody and both insert -- and the second loses its whole file to a
 * unique-constraint error on the address.
 */

const WARRIOR_EMAIL = 'gorvek@ashendale.realm'

const WARRIORS = [
  { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' },
  { name: 'Sister Nightshroud', email: 'night@alderstone.realm' },
  { name: 'Zygofer the Defiler', email: 'zygofer@vale.realm' },
  { name: 'Merigall the Trickster', email: 'merigall@bitterreach.realm' },
  { name: 'Rust the Ravenlander', email: 'rust@ravenland.realm' },
]

describe('creating the same contributor twice at once', () => {
  it('returns the one row rather than failing the second caller', async () => {
    // Reaching past the visibility on purpose. This is the level the defect
    // lives at: looking an author up and then inserting them is two steps
    // with an await between, and two callers in that window both find nobody
    // and both insert.
    //
    // It does not happen through the blame pipeline today, because each
    // file's output arrives as its own I/O event and the microtask queue
    // drains between them, so one file finishes creating an author before
    // the next file's output is delivered. That is an accident of event
    // ordering, not a guarantee -- and --concurrency and the cohort analysis
    // are both changes that could disturb it. A test at the level above
    // cannot pin this, because at that level it already passes.
    const db = createDatabase()
    const gitService = new GitService('/tmp', db) as unknown as {
      getOrCreateAuthor(name: string, email: string): Promise<number>
    }

    const [first, second] = await Promise.all([
      gitService.getOrCreateAuthor('Gorvek the Ironbane', WARRIOR_EMAIL),
      gitService.getOrCreateAuthor('Gorvek the Ironbane', WARRIOR_EMAIL),
    ])

    expect(first).toBe(second)
    expect(
      await db.select({ email: authors.email }).from(authors),
    ).toHaveLength(1)
  })
})

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
    const gitService = new GitService(repo.path, db)
    await gitService.initialize()

    expect(gitService.getFailures()).toEqual([])

    const stored = await db.select({ email: authors.email }).from(authors)
    expect(stored.map((one) => one.email).sort()).toEqual(
      WARRIORS.map((one) => one.email).sort(),
    )

    // One line per file, and every one of them attributed.
    const lines = await db.select({ id: blameLines.id }).from(blameLines)
    expect(lines).toHaveLength(30)
  }, 60000)
})
