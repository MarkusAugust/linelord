import { describe, expect, it } from 'bun:test'
import { DEMO_HISTORY, daysBetween, resolveDemoHistory } from '../history'

const DAY_MS = 24 * 60 * 60 * 1000

describe('resolveDemoHistory', () => {
  it('dates every commit before the reference date, oldest first', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const resolved = resolveDemoHistory(now)

    expect(resolved.length).toBe(DEMO_HISTORY.length)
    for (const commit of resolved) {
      expect(commit.date.getTime()).toBeLessThan(now.getTime())
    }
    for (let i = 1; i < resolved.length; i += 1) {
      const previous = resolved[i - 1]?.date.getTime() ?? 0
      const current = resolved[i]?.date.getTime() ?? 0
      expect(current).toBeGreaterThan(previous)
    }
  })

  it('gives the same ages whenever it is run, so the published numbers do not drift', () => {
    const early = resolveDemoHistory(new Date('2026-09-30T12:00:00Z'))
    const late = resolveDemoHistory(new Date('2029-04-17T03:25:00Z'))

    const agesOf = (
      commits: ReturnType<typeof resolveDemoHistory>,
      now: Date,
    ) => commits.map((commit) => daysBetween(commit.date, now))

    expect(agesOf(late, new Date('2029-04-17T03:25:00Z'))).toEqual(
      agesOf(early, new Date('2026-09-30T12:00:00Z')),
    )
  })

  it('spans years and reaches the present, so the age histogram has a shape', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const resolved = resolveDemoHistory(now)

    const oldest = resolved[0]
    const newest = resolved[resolved.length - 1]
    if (!oldest || !newest) {
      throw new Error('The demo history is empty')
    }

    expect(daysBetween(oldest.date, now)).toBeGreaterThanOrEqual(3 * 365)
    expect(daysBetween(newest.date, now)).toBeLessThanOrEqual(30)
  })

  it('has code older than a year, so the Ancient Code ranking counts something', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const ancient = resolveDemoHistory(now).filter(
      (commit) => daysBetween(commit.date, now) > 365,
    )

    expect(ancient.length).toBeGreaterThan(0)
  })
})

describe('DEMO_HISTORY', () => {
  it('has one warrior committing under two addresses, for the identity warning to find', () => {
    const addressesByName = new Map<string, Set<string>>()
    for (const commit of DEMO_HISTORY) {
      const addresses =
        addressesByName.get(commit.author.name) ?? new Set<string>()
      addresses.add(commit.author.email)
      addressesByName.set(commit.author.name, addresses)
    }

    const divided = [...addressesByName.values()].filter(
      (addresses) => addresses.size > 1,
    )
    expect(divided.length).toBeGreaterThan(0)
  })

  it('has more than one warrior, so the rankings have someone to rank', () => {
    const addresses = new Set(DEMO_HISTORY.map((commit) => commit.author.email))
    expect(addresses.size).toBeGreaterThan(2)
  })

  it('names exactly one reformatting commit, which .git-blame-ignore-revs exists to look past', () => {
    const reformatting = DEMO_HISTORY.filter((commit) => commit.reformatting)
    expect(reformatting.length).toBe(1)
  })

  it('writes the files the exclusion counts need: a lockfile, a blob and an oversized file', () => {
    const written = new Set(
      DEMO_HISTORY.flatMap((commit) => Object.keys(commit.write ?? {})),
    )

    expect(written).toContain('bun.lock')
    expect([...written].some((path) => path.endsWith('.png'))).toBe(true)
    expect([...written].some((path) => path.includes('generated'))).toBe(true)
  })
})

describe('daysBetween', () => {
  it('counts whole days from the earlier date to the later one', () => {
    const then = new Date('2026-01-01T00:00:00Z')
    const now = new Date(then.getTime() + 10 * DAY_MS)

    expect(daysBetween(then, now)).toBe(10)
  })
})
