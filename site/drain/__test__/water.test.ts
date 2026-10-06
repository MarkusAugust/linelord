import { describe, expect, it } from 'bun:test'
import { approach, FRAGMENT, VERTEX } from '../water'

describe('the water in the O', () => {
  it('eases in and out, and comes to rest so the page can stop drawing', () => {
    let k = 0
    for (let i = 0; i < 4; i++) k = approach(k, 1, 1 / 60)
    expect(k).toBeGreaterThan(0)
    expect(k).toBeLessThan(1)
    for (let i = 0; i < 120; i++) k = approach(k, 1, 1 / 60)
    expect(k).toBe(1)
    for (let i = 0; i < 120; i++) k = approach(k, 0, 1 / 60)
    expect(k).toBe(0)
    expect(approach(0.5, 0, 10)).toBe(0)
  })

  it('declares what the page sets, and nothing else', () => {
    for (const u of ['u_res', 'u_t', 'u_k']) expect(FRAGMENT).toContain(u)
    expect(FRAGMENT).toMatch(
      /uniform vec2 u_res;\s+uniform float u_t;\s+uniform float u_k;/,
    )
    expect(VERTEX).toContain('attribute vec2 a_pos;')
  })
})
