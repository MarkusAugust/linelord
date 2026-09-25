import { afterEach, describe, expect, it } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { type LineLord, lineLord } from '../../__test__/helpers/lineLord'
import { IGNORE_REVS_FILENAME } from '../ignoreRevs'
import { authorContributions } from '../ownership'

/**
 * A repository-wide reformatting, and what it does to the numbers.
 *
 * This is the case the whole feature exists for: one commit rewrites every
 * line without changing what any of them mean, and blame then credits the
 * entire codebase to whoever ran the formatter, dated to the afternoon they
 * ran it.
 */

const GORVEK = { name: 'Gorvek the Ironbane', email: 'gorvek@ashendale.realm' }
const BOT = { name: 'Prettier Bot', email: 'bot@example.com' }

const WRITTEN = new Date('2020-01-01T10:00:00Z')
const REFORMATTED = new Date('2026-09-01T10:00:00Z')

/** Quotes changed, meaning unchanged -- and not whitespace, which `-w` absorbs. */
async function repoWithAReformatting() {
  const repo = await createTestRepo()
  await repo.commit({
    message: 'the real work',
    author: GORVEK,
    date: WRITTEN,
    write: {
      'f.js': "const a = 'alpha'\nconst b = 'beta'\nconst c = 'gamma'\n",
    },
  })
  const reformat = await repo.commit({
    message: 'switch to double quotes',
    author: BOT,
    date: REFORMATTED,
    write: {
      'f.js': 'const a = "alpha"\nconst b = "beta"\nconst c = "gamma"\n',
    },
  })
  return { repo, reformat }
}

/** Lines owned in HEAD, by email. */
async function ownership(service: LineLord): Promise<Map<string, number>> {
  const contributions = authorContributions(service.getAnalysis())
  return new Map(
    contributions.map((one) => [one.email, one.totalLines] as const),
  )
}

describe('a commit blame is told to look past', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  it('credits the formatter with everything when nobody says otherwise', async () => {
    const made = await repoWithAReformatting()
    repo = made.repo

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    expect((await ownership(service)).get(BOT.email)).toBe(3)
    expect((await ownership(service)).get(GORVEK.email) ?? 0).toBe(0)
  })

  it('gives the lines back when .git-blame-ignore-revs names it', async () => {
    const made = await repoWithAReformatting()
    repo = made.repo
    await writeFile(
      join(repo.path, IGNORE_REVS_FILENAME),
      `# reformatting, not authorship\n${made.reformat}\n`,
    )

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    expect((await ownership(service)).get(GORVEK.email)).toBe(3)
    expect((await ownership(service)).get(BOT.email) ?? 0).toBe(0)
  })

  it('gives them back for a commit named on the command line too', async () => {
    const made = await repoWithAReformatting()
    repo = made.repo

    const service = lineLord(repo.path, 50 * 1024, {
      ignoreRevisions: [made.reformat],
    })
    await service.initialize()

    expect((await ownership(service)).get(GORVEK.email)).toBe(3)
  })

  it('dates the code to when it was written, not when it was reformatted', async () => {
    // The reason this matters beyond ownership: a formatting commit resets the
    // apparent age of the entire codebase to one afternoon, and every number
    // built on age is then measuring the formatter's calendar.
    const made = await repoWithAReformatting()
    repo = made.repo
    await writeFile(join(repo.path, IGNORE_REVS_FILENAME), `${made.reformat}\n`)

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    const rows = service.getAnalysis().lines

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.commitTimestamp).toBe(Math.floor(WRITTEN.getTime() / 1000))
    }
  })

  it('says so, so the numbers can be read correctly', async () => {
    const made = await repoWithAReformatting()
    repo = made.repo
    await writeFile(join(repo.path, IGNORE_REVS_FILENAME), `${made.reformat}\n`)

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    const context = service.getAnalysisContext()
    expect(context.ignoredRevisionCount).toBe(1)
    expect(context.ignoreRevSources).toEqual({ file: true, flag: false })
    expect(context.unresolvedIgnoreRevs).toEqual([])
  })

  it('analyses the repository anyway when an entry names no commit', async () => {
    // Handed to git, one bad entry makes it refuse the blame -- once per file.
    // The whole repository then comes back unreadable over a typo.
    const made = await repoWithAReformatting()
    repo = made.repo
    await writeFile(
      join(repo.path, IGNORE_REVS_FILENAME),
      `${made.reformat}\nnot a commit at all\n`,
    )

    const service = lineLord(repo.path, 50 * 1024)
    await service.initialize()

    expect(service.getFailures()).toEqual([])
    expect((await ownership(service)).get(GORVEK.email)).toBe(3)
    expect(service.getAnalysisContext().unresolvedIgnoreRevs).toEqual([
      { entry: 'not a commit at all', source: 'file' },
    ])
  })
})
