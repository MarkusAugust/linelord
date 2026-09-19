import { afterEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { createDatabase } from '../../db/database'
import { blameLines, files } from '../../db/schema'
import { GitService } from '../GitService'

/**
 * What the stored line numbers and timestamps actually refer to.
 *
 * Both used to be derived rather than read: the number was a counter over the
 * lines that were kept, and the time was an ISO string rebuilt from the
 * seconds git had already given.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }

describe('what a blamed line is stored as', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('numbers a line the way the file does, blank lines and all', async () => {
    // Blank lines belong to nobody and are not stored, but they are still
    // lines of the file. Counting only the ones kept put every line below the
    // first blank one at the wrong number -- and a line number that is wrong
    // is worse than none: it points confidently at the wrong line.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a file with gaps in it',
      author: GORVEK,
      write: { 'a.ts': 'const a = 1\n\nconst b = 2\n\n\nconst c = 3\n' },
    })

    const db = createDatabase()
    await new GitService(repo.path, db).initialize()

    const rows = await db
      .select({ lineNumber: blameLines.lineNumber })
      .from(blameLines)
      .innerJoin(files, eqFileId())

    expect(rows.map((row) => row.lineNumber).sort((a, b) => a - b)).toEqual([
      1, 3, 6,
    ])
  })

  it('keeps the commit time as the seconds git reported', async () => {
    // Stored as a number, so that "older than a year" is arithmetic rather
    // than a comparison of two strings that happen to sort correctly.
    repo = await createTestRepo()
    const when = new Date('2021-03-04T05:06:07Z')
    await repo.commit({
      message: 'one line',
      author: GORVEK,
      date: when,
      write: { 'a.ts': 'const a = 1\n' },
    })

    const db = createDatabase()
    await new GitService(repo.path, db).initialize()

    const [row] = await db
      .select({ commitTimestamp: blameLines.commitTimestamp })
      .from(blameLines)

    expect(row?.commitTimestamp).toBe(Math.floor(when.getTime() / 1000))
  })
})

/** The join condition, kept out of the assertion above for readability. */
function eqFileId() {
  return eq(files.id, blameLines.fileId)
}
