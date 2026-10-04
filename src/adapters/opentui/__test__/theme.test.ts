import { describe, expect, it } from 'bun:test'
import { fit, ordinal, percent } from '../theme'

describe('fit', () => {
  it('writes a number in full while it leaves a space before it', () => {
    expect(fit(523, 8)).toBe('     523')
    expect(fit(12_345, 8)).toBe('  12,345')
  })

  it('goes to thousands, then millions, never to a thousand thousands', () => {
    expect(fit(123_456, 7)).toBe('   123k')
    // 999,600 rounded to thousands is 1000k, which is a million.
    expect(fit(999_600, 7)).toBe('   1.0M')
    expect(fit(2_340_000, 7)).toBe('   2.3M')
  })
})

describe('ordinal and percent', () => {
  it('names places as people say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ])
  })

  it('says a whole of nothing is no share at all, and a sliver is less than a tenth', () => {
    expect(percent(1, 0)).toBe('—')
    expect(percent(1, 10_000)).toBe('<0.1%')
    expect(percent(9, 17)).toBe('52.9%')
  })
})
