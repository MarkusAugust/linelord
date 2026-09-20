import { describe, expect, it } from 'bun:test'
import {
  type HistoryCommit,
  intervalKey,
  selectSnapshots,
} from '../snapshotSelection'

/**
 * Which revisions the survival curve is drawn through.
 *
 * Tested on a list of commits rather than on a repository, because what is
 * under test is the sampling: which commit stands for a month, what happens
 * when there are more months than the ceiling allows, and that the answer
 * does not depend on where in the world it is asked.
 */

const at = (iso: string, sha: string): HistoryCommit => ({
  sha,
  timestamp: Math.floor(new Date(iso).getTime() / 1000),
})

describe('intervalKey', () => {
  it('puts two commits in the same month together', () => {
    expect(
      intervalKey(at('2026-03-01T00:00:00Z', 'a').timestamp, 'month'),
    ).toBe(intervalKey(at('2026-03-31T23:59:59Z', 'b').timestamp, 'month'))
  })

  it('keeps neighbouring months apart', () => {
    expect(
      intervalKey(at('2026-03-31T23:59:59Z', 'a').timestamp, 'month'),
    ).not.toBe(intervalKey(at('2026-04-01T00:00:00Z', 'b').timestamp, 'month'))
  })

  it('groups by quarter when asked', () => {
    const january = intervalKey(
      at('2026-01-05T00:00:00Z', 'a').timestamp,
      'quarter',
    )
    const march = intervalKey(
      at('2026-03-30T00:00:00Z', 'b').timestamp,
      'quarter',
    )
    const april = intervalKey(
      at('2026-04-01T00:00:00Z', 'c').timestamp,
      'quarter',
    )

    expect(march).toBe(january)
    expect(april).not.toBe(january)
  })

  it('groups by week when asked', () => {
    const monday = at('2026-03-02T00:00:00Z', 'a').timestamp
    const sunday = at('2026-03-08T00:00:00Z', 'b').timestamp

    expect(intervalKey(monday + 3600, 'week')).toBe(intervalKey(monday, 'week'))
    expect(intervalKey(sunday + 7 * 86400, 'week')).not.toBe(
      intervalKey(monday, 'week'),
    )
  })

  it('reads the clock in UTC, so the answer does not move with the reader', () => {
    // A commit just before midnight UTC on the last of the month falls in
    // that month wherever it is asked about. Local time would put it in the
    // next one for anyone east of Greenwich, and two people would then get
    // survival curves that disagree for a reason neither could find.
    const lastMoment = at('2026-03-31T23:30:00Z', 'a').timestamp

    expect(intervalKey(lastMoment, 'month')).toBe('2026-03')
  })
})

describe('selectSnapshots', () => {
  it('takes the last commit of each month', () => {
    // Newest first, as git log gives them.
    const commits = [
      at('2026-02-14T10:00:00Z', 'feb-only'),
      at('2026-01-28T10:00:00Z', 'jan-late'),
      at('2026-01-05T10:00:00Z', 'jan-early'),
    ]

    expect(selectSnapshots(commits).map((one) => one.sha)).toEqual([
      'jan-late',
      'feb-only',
    ])
  })

  it('returns them oldest first, whatever order they arrived in', () => {
    // git log gives newest first, which is the opposite of the order the
    // analysis walks them in.
    const commits = [
      at('2026-03-20T10:00:00Z', 'mar'),
      at('2026-02-20T10:00:00Z', 'feb'),
      at('2026-01-20T10:00:00Z', 'jan'),
    ]

    expect(selectSnapshots(commits).map((one) => one.sha)).toEqual([
      'jan',
      'feb',
      'mar',
    ])
  })

  it('keeps the newest when there are more months than the ceiling', () => {
    // A curve through the recent past beats one that stops three years ago.
    // Newest first, as git gives them: m10 down to m1.
    const commits = Array.from({ length: 10 }, (_, index) =>
      at(
        `2026-${String(10 - index).padStart(2, '0')}-15T10:00:00Z`,
        `m${10 - index}`,
      ),
    )

    expect(selectSnapshots(commits, 'month', 3).map((one) => one.sha)).toEqual([
      'm8',
      'm9',
      'm10',
    ])
  })

  it('orders by ancestry, not by the clock', () => {
    // git lets a commit carry an earlier timestamp than its own parent --
    // clock skew, or a rebase. Ordering snapshots by time then puts a
    // descendant before its ancestor, and the walk between them asks git for
    // the commits in a range that is not a range at all. The counts carried
    // across are wrong, and nothing says so.
    //
    // The list arrives newest first, as git log --first-parent gives it, so
    // position in it is ancestry and needs no clock.
    const commits = [
      at('2025-05-01T10:00:00Z', 'child-dated-may'),
      at('2025-06-01T10:00:00Z', 'parent-dated-june'),
    ]

    expect(selectSnapshots(commits).map((one) => one.sha)).toEqual([
      'parent-dated-june',
      'child-dated-may',
    ])
  })

  it('stands for an interval with the commit closest to HEAD', () => {
    // "Last of the month" means last in the history, not latest on the clock.
    const commits = [
      at('2026-01-05T10:00:00Z', 'newest-in-january'),
      at('2026-01-28T10:00:00Z', 'older-but-later-dated'),
    ]

    expect(selectSnapshots(commits).map((one) => one.sha)).toEqual([
      'newest-in-january',
    ])
  })

  it('has nothing to sample in a repository with no history', () => {
    expect(selectSnapshots([])).toEqual([])
  })

  it('refuses to sample at all when asked for none', () => {
    expect(
      selectSnapshots([at('2026-01-01T00:00:00Z', 'a')], 'month', 0),
    ).toEqual([])
  })

  it('gives one snapshot for a repository with one commit', () => {
    expect(
      selectSnapshots([at('2026-01-01T00:00:00Z', 'only')]).map((s) => s.sha),
    ).toEqual(['only'])
  })
})
