import { describe, it, expect } from 'bun:test'
import { capitalizeString } from '../capitalizeString'

describe('capitalizeString', () => {
  it('should capitalize the first letter of a string', () => {
    expect(capitalizeString('hello world')).toBe('Hello world')
    expect(capitalizeString('legend')).toBe('Legend')
    expect(capitalizeString('apex predator')).toBe('Apex predator')
    expect(capitalizeString('a')).toBe('A')
    expect(capitalizeString('')).toBe('')
    expect(capitalizeString('ALREADY CAPS')).toBe('ALREADY CAPS')
    expect(capitalizeString('123numbers')).toBe('123numbers')
  })
})
