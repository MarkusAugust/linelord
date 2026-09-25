import { describe, expect, it } from 'bun:test'
import type { AgeHistogram } from '../../core/longevity'
import { formatAge, formatSpread, renderAgeSparkline } from '../ageFormatting'

const EMPTY: AgeHistogram = {
  underAWeek: 0,
  weekToMonth: 0,
  oneToThreeMonths: 0,
  threeToTwelveMonths: 0,
  oneToTwoYears: 0,
  overTwoYears: 0,
}

describe('formatAge', () => {
  it('counts days while days are still the useful unit', () => {
    expect(formatAge(1)).toBe('1d')
    expect(formatAge(18)).toBe('18d')
    expect(formatAge(29.4)).toBe('29d')
  })

  it('counts months up to a year', () => {
    expect(formatAge(60)).toBe('2m')
    expect(formatAge(200)).toBe('7m')
  })

  it('counts years and months beyond that', () => {
    expect(formatAge(365)).toBe('1y 0m')
    expect(formatAge(3 * 365 + 60)).toBe('3y 2m')
  })

  it('carries twelve rounded-up months into another year', () => {
    // Otherwise an age lands on "2y 12m", which is a way of writing three
    // years that nobody uses.
    expect(formatAge(2 * 365 + 358)).toBe('3y 0m')
  })

  it('says so rather than rounding an age below a day to nothing', () => {
    expect(formatAge(0.7)).toBe('<1d')
  })

  it('refuses to invent an age it does not have', () => {
    expect(formatAge(Number.NaN)).toBe('—')
    expect(formatAge(-1)).toBe('—')
  })
})

describe('formatSpread', () => {
  it('puts the younger end first, the way it is read', () => {
    expect(formatSpread(4, 60)).toBe('4d – 2m')
  })
})

describe('renderAgeSparkline', () => {
  it('draws newest code on the left', () => {
    const histogram: AgeHistogram = { ...EMPTY, underAWeek: 10 }

    expect(renderAgeSparkline(histogram)).toBe('█     ')
  })

  it('draws oldest code on the right', () => {
    const histogram: AgeHistogram = { ...EMPTY, overTwoYears: 10 }

    expect(renderAgeSparkline(histogram)).toBe('     █')
  })

  it('leaves an empty bucket empty', () => {
    // The shortest block would say "a few lines here" where there are none,
    // which is the one thing a glanceable summary must not do.
    const histogram: AgeHistogram = {
      ...EMPTY,
      underAWeek: 100,
      overTwoYears: 100,
    }

    expect(renderAgeSparkline(histogram)).toBe('█    █')
  })

  it('scales to the tallest bucket, so the shape is what is read', () => {
    const histogram: AgeHistogram = {
      ...EMPTY,
      underAWeek: 1,
      weekToMonth: 8,
    }
    const drawn = renderAgeSparkline(histogram)

    expect(drawn[1]).toBe('█')
    expect(drawn[0]).not.toBe('█')
    expect(drawn[0]).not.toBe(' ')
  })

  it('draws nothing for an author with no lines at all', () => {
    expect(renderAgeSparkline(EMPTY)).toBe('      ')
  })
})
