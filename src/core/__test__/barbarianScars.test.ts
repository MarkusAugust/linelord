import { afterEach, describe, expect, it } from 'bun:test'
import {
  createTestRepo,
  type TestRepo,
} from '../../__test__/helpers/createTestRepo'
import { lineLord } from '../../__test__/helpers/lineLord'
import { barbarianRankings } from '../barbarian'

/**
 * Battle scars and the size threshold, over a real repository.
 *
 * The scar rule and `--threshold` interact: no blame is stored for a file
 * the threshold excludes, so the size clause can only ever select files
 * between the two numbers. That is a property of the whole analysis, not
 * of the arithmetic alone, which is why this runs the analysis.
 */
describe('battle scars and the size threshold', () => {
  let repo: TestRepo | undefined

  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  /** A plain .ts file, comfortably over the 5000-byte legacy mark. */
  const WIDE_FILE = `${'const filler = "aaaaaaaaaaaaaaaaaaaa"\n'.repeat(200)}`

  async function scarsFor(repoPath: string, thresholdBytes: number) {
    const service = lineLord(repoPath, thresholdBytes)
    await service.initialize()
    const rankings = barbarianRankings(service.getAnalysis())
    return rankings[0]?.metrics.battleScars ?? 0
  }

  it('counts lines in large files, which is where most scars come from', async () => {
    // The file is neither legacy-named nor a legacy extension, so only the
    // size clause can match it. Under the default threshold it is analysed,
    // and every one of its lines is a scar.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a wide file',
      write: { 'src/wide.ts': WIDE_FILE, 'src/narrow.ts': 'const a = 1\n' },
    })

    expect(await scarsFor(repo.path, 50 * 1024)).toBe(200)
  })

  it('counts none of them once the threshold excludes the file itself', async () => {
    // Below the legacy size the size clause can never match, because no
    // blame is recorded for a file the threshold excluded. Scars fall away,
    // and that is the configuration working as documented.
    repo = await createTestRepo()
    await repo.commit({
      message: 'a wide file',
      write: { 'src/wide.ts': WIDE_FILE, 'src/narrow.ts': 'const a = 1\n' },
    })

    expect(await scarsFor(repo.path, 1024)).toBe(0)
  })

  it('still scars on path and extension when size cannot apply', async () => {
    repo = await createTestRepo()
    await repo.commit({
      message: 'small but dangerous',
      write: {
        'src/legacy/helper.ts': 'const legacy = 1\n',
        'src/script.js': 'const js = 1\n',
        'src/clean.ts': 'const clean = 1\n',
      },
    })

    // Two scars from the legacy path and the .js extension; clean.ts is neither.
    expect(await scarsFor(repo.path, 1024)).toBe(2)
  })
})
