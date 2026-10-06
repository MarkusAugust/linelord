import { describe, expect, it } from 'bun:test'
import {
  DIVE_MS,
  dive,
  FRAGMENT,
  glsl,
  HOLD_MS,
  hold,
  live,
  MAX_RIPPLES,
  PALETTE,
  ripple,
  SURFACE_MS,
  saying,
  surface,
  TIDE_MS,
  tide,
  VERTEX,
  waterline,
} from '../water'

describe('the tide', () => {
  it('runs on the clock, twelve hours and twenty-five minutes from high water to high water', () => {
    expect(TIDE_MS).toBe((12 * 60 + 25) * 60 * 1000)
    expect(tide(0)).toBeCloseTo(0.5)
    expect(tide(TIDE_MS / 4)).toBeCloseTo(1)
    expect(tide((TIDE_MS * 3) / 4)).toBeCloseTo(0)
    expect(tide(TIDE_MS)).toBeCloseTo(tide(0))
  })

  it('stands the water higher at the flood than at the ebb', () => {
    expect(waterline(300, 1)).toBeGreaterThan(waterline(300, 0))
    expect(waterline(300, 0)).toBeGreaterThan(0)
    expect(waterline(300, 1)).toBeLessThan(300)
  })
})

describe('rings on the water', () => {
  it('keeps the newest few, and lets each one die out', () => {
    let rings = [] as ReturnType<typeof ripple>[]
    for (let i = 0; i < MAX_RIPPLES + 3; i++)
      rings = [...rings, ripple(i, 0, i * 10, 1)]
    const now = live(rings, 100)
    expect(now).toHaveLength(MAX_RIPPLES)
    expect(now[0]?.x).toBe(3)
    expect(live(rings, 100_000)).toEqual([])
  })
})

describe('holding on', () => {
  it('takes a second and a half, and lets go if you do', () => {
    expect(hold(null, 500)).toBe(0)
    expect(hold(1000, 1000)).toBe(0)
    expect(hold(1000, 1000 + HOLD_MS / 2)).toBeCloseTo(0.5)
    expect(hold(1000, 1000 + HOLD_MS * 2)).toBe(1)
  })
})

describe('going down and coming up', () => {
  it('raises the water over the page, then the dark, then opens the game', () => {
    const start = dive(0)
    expect(start).toEqual({ rise: 0, dark: 0, done: false })
    const mid = dive(DIVE_MS / 2)
    expect(mid.rise).toBeGreaterThan(0)
    expect(mid.rise).toBeLessThan(1)
    const end = dive(DIVE_MS)
    expect(end).toEqual({ rise: 1, dark: 1, done: true })
    expect(dive(DIVE_MS * 2)).toEqual(end)
  })

  it('lets the dark go first, then the water down off the page', () => {
    expect(surface(0)).toEqual({ fall: 0, dark: 1, done: false })
    const mid = surface(SURFACE_MS / 2)
    expect(mid.dark).toBeLessThan(1)
    expect(mid.fall).toBeGreaterThan(0)
    expect(surface(SURFACE_MS)).toEqual({ fall: 1, dark: 0, done: true })
  })
})

describe('the colour of the water', () => {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

  it('is the page own, and has no blue in it', () => {
    expect(PALETTE.dark.rim).toBe('#c8a34a')
    expect(PALETTE.night).toBe('#14110d')
    for (const hex of [
      PALETTE.night,
      ...Object.values(PALETTE.dark),
      ...Object.values(PALETTE.light),
    ]) {
      const [r = 0, g = 0, b = 0] = channels(hex)
      expect(b).toBeLessThanOrEqual(r)
      expect(b).toBeLessThanOrEqual(g)
    }
  })

  it('is what the shader draws with, and the shader declares what the page sets', () => {
    expect(FRAGMENT).toContain(glsl(PALETTE.dark.mid))
    expect(FRAGMENT).toContain(glsl(PALETTE.night))
    for (const u of [
      'u_res',
      'u_t',
      'u_surface',
      'u_feather',
      'u_hold',
      'u_dark',
      'u_light',
      'u_k',
      'u_textures',
    ])
      expect(FRAGMENT).toMatch(new RegExp(`uniform (float|vec2) ${u};`))
    expect(FRAGMENT).toContain(`uniform vec4 u_ripples[${MAX_RIPPLES}];`)
    expect(FRAGMENT).toContain('uniform sampler2D u_reflect;')
    expect(FRAGMENT).toContain('uniform sampler2D u_kell;')
    expect(VERTEX).toContain('attribute vec2 a_pos;')
    expect(glsl('#ff8000')).toBe('vec3(1.000, 0.502, 0.000)')
  })
})

describe('what the foot of the page says', () => {
  it('says what the tide is doing, from the same clock as the water', () => {
    expect(saying(0)).toBe('The sea is coming in.')
    expect(saying(TIDE_MS / 4)).toBe('High water.')
    expect(saying(TIDE_MS / 2)).toBe('The sea is going out.')
    expect(saying((TIDE_MS * 3) / 4)).toBe('Low water.')
    expect(saying(TIDE_MS)).toBe(saying(0))
  })
})
