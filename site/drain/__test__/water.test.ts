import { describe, expect, it } from 'bun:test'
import {
  approach,
  CALM,
  DESCENT_MS,
  descent,
  FOUND,
  FRAGMENT,
  SPUN,
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

  it('lies in the bottom of the O under a surface, and rises and rocks when it is found', () => {
    expect(CALM.stir).toBe(0)
    expect(CALM.level).toBeGreaterThan(0.2)
    expect(CALM.level).toBeLessThan(0.6)
    expect(CALM.edge).toBeLessThan(0.2)
    expect(FOUND.stir).toBeGreaterThan(0)
    expect(FOUND.stir).toBeLessThan(0.5)
    expect(FOUND.level).toBeGreaterThan(CALM.level)
    expect(FOUND.wave).toBeGreaterThan(CALM.wave)
  })

  it('fills the O when it spins, with no surface left to rock', () => {
    expect(SPUN.stir).toBe(1)
    expect(SPUN.level).toBe(1)
    expect(SPUN.wave).toBe(0)
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
      'u_level',
      'u_wave',
      'u_light',
    ])
      expect(FRAGMENT).toMatch(new RegExp(`uniform (float|vec2) ${u};`))
    expect(VERTEX).toContain('attribute vec2 a_pos;')
  })
})
