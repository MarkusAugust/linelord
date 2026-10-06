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

  it('fills most of the foot of the page, close under the text above it, even at the ebb', () => {
    expect(waterline(300, 0)).toBeGreaterThanOrEqual(300 * 0.8)
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

describe('the colour of the plate', () => {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

  it('is the page own: steel for the light in the grooves, the paper for the dark, and no blue', () => {
    expect(PALETTE.gold).toBe('#c8a34a')
    expect(PALETTE.night).toBe('#14110d')
    expect(PALETTE.paper).toBe('#f4efe4')
    for (const hex of Object.values(PALETTE)) {
      const [r = 0, g = 0, b = 0] = channels(hex)
      expect(b).toBeLessThanOrEqual(r)
      expect(b).toBeLessThanOrEqual(g)
    }
  })

  it('is what the shader draws with, and the shader declares what the page sets', () => {
    expect(FRAGMENT).toContain(glsl(PALETTE.gold))
    expect(FRAGMENT).toContain(glsl(PALETTE.night))
    for (const u of [
      'u_res',
      'u_t',
      'u_surface',
      'u_feather',
      'u_depth',
      'u_hold',
      'u_dark',
      'u_light',
      'u_k',
      'u_textures',
      'u_tile',
    ])
      expect(FRAGMENT).toMatch(new RegExp(`uniform (float|vec2) ${u};`))
    expect(FRAGMENT).toContain(`uniform vec4 u_ripples[${MAX_RIPPLES}];`)
    for (const t of ['u_engraving', 'u_plate'])
      expect(FRAGMENT).toContain(`uniform sampler2D ${t};`)
    expect(FRAGMENT).not.toContain('u_kell')
    expect(FRAGMENT).not.toContain('u_reflect')
    // Only the sea: no beach, and nothing drawn in it.
    expect(FRAGMENT).not.toContain('u_shore')
    expect(FRAGMENT).not.toContain('u_sand')
    expect(FRAGMENT).not.toContain('u_aspect')
    expect(VERTEX).toContain('attribute vec2 a_pos;')
    expect(glsl('#ff8000')).toBe('vec3(1.000, 0.502, 0.000)')
  })
})

describe('what the foot of the page says', () => {
  const T = TIDE_MS
  it('says which way the sea is going, from the same clock as the water', () => {
    expect(saying(0)).toBe('The sea is coming in.')
    expect(saying(T / 8)).toBe('The sea is coming in.')
    expect(saying(T / 2)).toBe('The sea is going out.')
    expect(saying((T * 5) / 8)).toBe('The sea is going out.')
    expect(saying((T * 3) / 4 + 1)).toBe('The sea is coming in.')
    expect(saying(T)).toBe(saying(0))
  })
})
