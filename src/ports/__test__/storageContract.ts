import { beforeEach, describe, expect, it } from 'bun:test'
import type { AnalysisStore } from '../storage'

/**
 * What every storage adapter has to do, stated once.
 *
 * The core is written against the port and tested against the in-memory
 * adapter, so the in-memory adapter had better behave like the one that
 * ships. This suite is run against both, and an adapter that does not pass
 * it is not an adapter.
 */
export function describeAnalysisStore(
  name: string,
  open: () => Promise<AnalysisStore> | AnalysisStore,
): void {
  describe(`AnalysisStore contract: ${name}`, () => {
    let store: AnalysisStore

    beforeEach(async () => {
      store = await open()
    })

    const twoFiles = async () => {
      await store.reconcileFiles({
        insert: [
          {
            path: 'src/a.ts',
            extension: '.ts',
            size: 100,
            isBinary: false,
            isIgnored: false,
            isLargerThanThreshold: false,
          },
          {
            path: 'logo.png',
            extension: '.png',
            size: 5,
            isBinary: true,
            isIgnored: false,
            isLargerThanThreshold: false,
          },
        ],
        update: [],
        remove: [],
      })
      const files = await store.listFiles()
      const a = files.find((f) => f.path === 'src/a.ts')
      const png = files.find((f) => f.path === 'logo.png')
      if (!a || !png) throw new Error('the files were not stored')
      return { a, png }
    }

    it('starts empty', async () => {
      expect(await store.loadAnalysis()).toEqual({
        files: [],
        authors: [],
        aliases: [],
        lines: [],
      })
      expect(await store.loadHistory()).toEqual({
        snapshots: [],
        cohortLines: [],
      })
      expect(await store.readMeta()).toEqual({})
    })

    it('inserts files with ids and the defaults a fresh file has', async () => {
      const { a, png } = await twoFiles()

      expect(a.id).not.toBe(png.id)
      expect(a).toMatchObject({
        extension: '.ts',
        size: 100,
        isBinary: false,
        isIgnored: false,
        isLargerThanThreshold: false,
        analysisFailed: false,
        totalLines: 0,
      })
      expect(png.isBinary).toBe(true)
    })

    it('updates only what the plan names, and keeps the id', async () => {
      const { a } = await twoFiles()

      await store.reconcileFiles({
        insert: [],
        update: [
          { id: a.id, changes: { size: 200, isLargerThanThreshold: true } },
        ],
        remove: [],
      })

      const after = (await store.listFiles()).find((f) => f.id === a.id)
      expect(after).toMatchObject({
        path: 'src/a.ts',
        size: 200,
        isLargerThanThreshold: true,
        isBinary: false,
      })
    })

    it('removes a file and takes its lines with it', async () => {
      const { a, png } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1
      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: 'a'.repeat(40),
          commitTimestamp: 10,
        },
      ])

      await store.reconcileFiles({ insert: [], update: [], remove: [a.id] })

      const data = await store.loadAnalysis()
      expect(data.files.map((f) => f.id)).toEqual([png.id])
      expect(data.lines).toEqual([])
    })

    it('stores blame with ids in order, and the count on the file', async () => {
      const { a } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1

      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: 'a'.repeat(40),
          commitTimestamp: 10,
        },
        {
          authorId: gorvek,
          lineNumber: 3,
          commitHash: 'b'.repeat(40),
          commitTimestamp: null,
        },
      ])

      const data = await store.loadAnalysis()
      expect(data.lines.map((l) => l.lineNumber)).toEqual([1, 3])
      expect(data.lines[0]?.id).toBeLessThan(data.lines[1]?.id ?? -1)
      expect(data.lines[1]?.commitTimestamp).toBeNull()
      expect(data.lines[0]).toMatchObject({
        fileId: a.id,
        authorId: gorvek,
        commitHash: 'a'.repeat(40),
        commitTimestamp: 10,
      })
      expect(data.files.find((f) => f.id === a.id)?.totalLines).toBe(2)
    })

    it('never hands out an id twice, even after lines are forgotten', async () => {
      const { a } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1
      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: null,
          commitTimestamp: 1,
        },
      ])
      const first = (await store.loadAnalysis()).lines[0]?.id ?? -1

      await store.forgetBlame([a.id])
      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: null,
          commitTimestamp: 2,
        },
      ])

      const second = (await store.loadAnalysis()).lines[0]?.id ?? -1
      expect(second).toBeGreaterThan(first)
    })

    it('forgets blame, the count and the failure of a file about to be re-read', async () => {
      const { a } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1
      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: null,
          commitTimestamp: 1,
        },
      ])
      await store.markAnalysisFailed(a.id)
      expect(
        (await store.listFiles()).find((f) => f.id === a.id)?.analysisFailed,
      ).toBe(true)

      await store.forgetBlame([a.id])

      const data = await store.loadAnalysis()
      expect(data.lines).toEqual([])
      expect(data.files.find((f) => f.id === a.id)).toMatchObject({
        totalLines: 0,
        analysisFailed: false,
      })
    })

    it('creates an author once, canonical and their own canonical', async () => {
      const first = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
        {
          name: 'Sister',
          email: 'nightshroud@alderstone.realm',
          displayName: 'Sister',
        },
      ])
      const again = await store.ensureAuthors([
        {
          name: 'Gorvek again',
          email: 'gorvek@ashendale.realm',
          displayName: 'G',
        },
      ])

      expect(again.get('gorvek@ashendale.realm')).toBe(
        first.get('gorvek@ashendale.realm') ?? -1,
      )
      const authors = await store.listAuthors()
      expect(authors).toHaveLength(2)
      const gorvek = authors.find((a) => a.email === 'gorvek@ashendale.realm')
      expect(gorvek).toMatchObject({
        name: 'Gorvek',
        displayName: 'Gorvek',
        isCanonical: true,
        rank: null,
        title: null,
        percentage: 0,
      })
      expect(gorvek?.canonicalId).toBe(gorvek?.id ?? -1)
    })

    it('leaves a merged author merged when their address turns up again', async () => {
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
        { name: 'gorvek', email: 'gorvek@old.realm', displayName: 'gorvek' },
      ])
      const keep = ids.get('gorvek@ashendale.realm') ?? -1
      const old = ids.get('gorvek@old.realm') ?? -1
      await store.updateAuthors([
        { id: old, changes: { isCanonical: false, canonicalId: keep } },
      ])

      await store.ensureAuthors([
        { name: 'gorvek', email: 'gorvek@old.realm', displayName: 'gorvek' },
      ])

      const after = (await store.listAuthors()).find((a) => a.id === old)
      expect(after).toMatchObject({ isCanonical: false, canonicalId: keep })
    })

    it('updates the fields ranking and matching decide', async () => {
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1

      await store.updateAuthors([
        {
          id: gorvek,
          changes: {
            rank: 1,
            percentage: 72.5,
            title: 'legend',
            displayName: 'Gorvek the Ironbane',
          },
        },
      ])

      expect((await store.listAuthors())[0]).toMatchObject({
        rank: 1,
        percentage: 72.5,
        title: 'legend',
        displayName: 'Gorvek the Ironbane',
      })
    })

    it('replaces the aliases rather than adding to them', async () => {
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1

      await store.replaceAliases([
        {
          canonicalAuthorId: gorvek,
          aliasName: 'gorvek',
          aliasEmail: 'gorvek@old.realm',
        },
      ])
      await store.replaceAliases([
        {
          canonicalAuthorId: gorvek,
          aliasName: 'G',
          aliasEmail: 'g@old.realm',
        },
      ])

      expect((await store.loadAnalysis()).aliases).toEqual([
        {
          canonicalAuthorId: gorvek,
          aliasName: 'G',
          aliasEmail: 'g@old.realm',
        },
      ])
    })

    it('moves every line from one author to another', async () => {
      const { a } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
        { name: 'gorvek', email: 'gorvek@old.realm', displayName: 'gorvek' },
      ])
      const keep = ids.get('gorvek@ashendale.realm') ?? -1
      const old = ids.get('gorvek@old.realm') ?? -1
      await store.storeBlame(a.id, [
        { authorId: old, lineNumber: 1, commitHash: null, commitTimestamp: 1 },
        { authorId: keep, lineNumber: 2, commitHash: null, commitTimestamp: 1 },
      ])

      await store.reassignBlame(old, keep)

      const lines = (await store.loadAnalysis()).lines
      expect(lines.map((l) => l.authorId)).toEqual([keep, keep])
    })

    it('keeps meta as written, replacing a key that is written again', async () => {
      await store.writeMeta({ head_sha: 'a'.repeat(40), threshold: '51200' })
      await store.writeMeta({ head_sha: 'b'.repeat(40) })

      expect(await store.readMeta()).toEqual({
        head_sha: 'b'.repeat(40),
        threshold: '51200',
      })

      await store.deleteMeta(['threshold', 'never-there'])
      expect(await store.readMeta()).toEqual({ head_sha: 'b'.repeat(40) })
    })

    it('stores a snapshot with its cohorts, and clears the history apart from the rest', async () => {
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1

      await store.storeSnapshot(
        { commitSha: 'a'.repeat(40), snapshotTimestamp: 1000, totalLines: 5 },
        [{ authorId: gorvek, cohortMonth: 900, lineCount: 5 }],
      )
      await store.storeSnapshot(
        { commitSha: 'b'.repeat(40), snapshotTimestamp: 2000, totalLines: 3 },
        [{ authorId: gorvek, cohortMonth: 900, lineCount: 3 }],
      )

      const history = await store.loadHistory()
      expect(history.snapshots.map((s) => s.commitSha)).toEqual([
        'a'.repeat(40),
        'b'.repeat(40),
      ])
      expect(history.snapshots[0]?.id).not.toBe(history.snapshots[1]?.id)
      expect(history.cohortLines).toEqual([
        {
          snapshotId: history.snapshots[0]?.id ?? -1,
          authorId: gorvek,
          cohortMonth: 900,
          lineCount: 5,
        },
        {
          snapshotId: history.snapshots[1]?.id ?? -1,
          authorId: gorvek,
          cohortMonth: 900,
          lineCount: 3,
        },
      ])

      await store.clearHistory()
      expect(await store.loadHistory()).toEqual({
        snapshots: [],
        cohortLines: [],
      })
      expect(await store.listAuthors()).toHaveLength(1)
    })

    it('clears everything, meta included', async () => {
      const { a } = await twoFiles()
      const ids = await store.ensureAuthors([
        {
          name: 'Gorvek',
          email: 'gorvek@ashendale.realm',
          displayName: 'Gorvek',
        },
      ])
      const gorvek = ids.get('gorvek@ashendale.realm') ?? -1
      await store.storeBlame(a.id, [
        {
          authorId: gorvek,
          lineNumber: 1,
          commitHash: null,
          commitTimestamp: 1,
        },
      ])
      await store.replaceAliases([
        {
          canonicalAuthorId: gorvek,
          aliasName: 'g',
          aliasEmail: 'g@old.realm',
        },
      ])
      await store.writeMeta({ head_sha: 'a'.repeat(40) })
      await store.storeSnapshot(
        { commitSha: 'a'.repeat(40), snapshotTimestamp: 1, totalLines: 1 },
        [{ authorId: gorvek, cohortMonth: 0, lineCount: 1 }],
      )

      await store.clear()

      expect(await store.loadAnalysis()).toEqual({
        files: [],
        authors: [],
        aliases: [],
        lines: [],
      })
      expect(await store.loadHistory()).toEqual({
        snapshots: [],
        cohortLines: [],
      })
      expect(await store.readMeta()).toEqual({})
    })
  })
}
