import { describe, expect, it } from 'bun:test'
import {
  approach,
  CALM,
  DESCENT_MS,
  descent,
  FOUND,
  FRAGMENT,
  VERTEX,
} from '../water'

describe('the water in the O', () => {
  it('eases toward where it is going, and comes to rest there', () => {
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

  it('lies still in the hole of the O, and only stirs when it is found', () => {
    expect(CALM.stir).toBe(0)
    expect(FOUND.stir).toBeGreaterThan(0)
    expect(FOUND.stir).toBeLessThan(0.5)
    expect(FOUND.edge).toBeGreaterThan(CALM.edge)
    expect(CALM.edge).toBeLessThan(0.3)
  })

  it('goes down in order: the O spins up, the whirlpool fills the screen, then the dark', () => {
    const start = descent(0)
    expect(start.stir).toBe(0)
    expect(start.grow).toBe(0)
    expect(start.dark).toBe(0)
    expect(start.done).toBe(false)

    const spun = descent(400)
    expect(spun.stir).toBe(1)
    expect(spun.grow).toBeGreaterThan(0)
    expect(spun.dark).toBe(0)

    const middle = descent(900)
    expect(middle.grow).toBeGreaterThan(spun.grow)
    expect(middle.grow).toBeLessThan(1)

    const end = descent(DESCENT_MS)
    expect(end.grow).toBe(1)
    expect(end.dark).toBe(1)
    expect(end.done).toBe(true)
    expect(descent(DESCENT_MS * 3)).toEqual(end)
  })

  it('declares what the page sets', () => {
    for (const u of [
      'u_center',
      'u_radius',
      'u_t',
      'u_k',
      'u_stir',
      'u_edge',
      'u_squash',
      'u_dark',
    ])
      expect(FRAGMENT).toMatch(new RegExp(`uniform (float|vec2) ${u};`))
    expect(VERTEX).toContain('attribute vec2 a_pos;')
  })
})
