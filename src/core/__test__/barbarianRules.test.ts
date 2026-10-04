import { describe, expect, it } from 'bun:test'
import {
  ACHIEVEMENTS,
  LEGACY_EXTENSIONS,
  LEGACY_PATH_WORDS,
} from '../barbarian'

describe('the rules the guide reads', () => {
  it('cannot be changed by whoever imports them', () => {
    // Never called: the typecheck is the test. Each line must be refused.
    const tamper = () => {
      // @ts-expect-error -- a ReadonlySet has no add
      LEGACY_EXTENSIONS.add('.ts')
      // @ts-expect-error -- a readonly array has no push
      LEGACY_PATH_WORDS.push('src')
      // @ts-expect-error -- a readonly array has no push
      ACHIEVEMENTS.push({ metric: 'battleScars', title: 'x' })
    }
    expect(typeof tamper).toBe('function')
  })
})
