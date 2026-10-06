import { describe, expect, it } from 'bun:test'
import {
  approach,
  CALM,
  counter,
  DESCENT_MS,
  descent,
  FOUND,
  FRAGMENT,
  glsl,
  inkCentre,
  PALETTE,
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
      'u_masked',
      'u_res',
      'u_counter',
    ])
      expect(FRAGMENT).toMatch(new RegExp(`uniform (float|vec2) ${u};`))
    expect(FRAGMENT).toContain('uniform sampler2D u_mask;')
    expect(VERTEX).toContain('attribute vec2 a_pos;')
  })
})

describe('where the O is', () => {
  it('finds the middle of the ink, not the middle of the box', () => {
    // A box at (100, 50) whose glyph sits with its baseline 40 below the top,
    // ink from 2 right of the pen to 30 right of it, and 36 above the baseline.
    const c = inkCentre(
      { left: 100, top: 50 },
      { left: -2, right: 30, ascent: 36, descent: 0, fontAscent: 40 },
    )
    expect(c.x).toBe(116)
    expect(c.y).toBe(72)
  })

  it('counts ink that hangs left of the pen and below the line', () => {
    const c = inkCentre(
      { left: 0, top: 0 },
      { left: 4, right: 20, ascent: 30, descent: 6, fontAscent: 32 },
    )
    expect(c.x).toBe(8)
    expect(c.y).toBe(20)
  })
})

describe('the hole in the O', () => {
  /** A ring of ink on a w by h grid: alpha 255 on the ring, 0 elsewhere. */
  function ring(
    w: number,
    h: number,
    outer: [number, number],
    inner: [number, number],
  ): Uint8ClampedArray {
    const alpha = new Uint8ClampedArray(w * h)
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = ((x - cx) / outer[0]) ** 2 + ((y - cy) / outer[1]) ** 2
        const i = ((x - cx) / inner[0]) ** 2 + ((y - cy) / inner[1]) ** 2
        if (o <= 1 && i > 1) alpha[y * w + x] = 255
      }
    return alpha
  }

  it('fills the hole from the middle and no further than the ink', () => {
    const alpha = ring(40, 60, [16, 26], [8, 18])
    const hole = counter(alpha, 40, 60)
    if (!hole) throw new Error('no hole found')
    const at = (x: number, y: number) => hole.mask[y * 40 + x] ?? 0
    expect(at(20, 30)).toBe(255)
    expect(at(20, 14)).toBe(255)
    expect(at(2, 30)).toBe(0)
    expect(at(20, 2)).toBe(0)
    expect(at(36, 30)).toBe(0)
    expect(hole.top).toBeGreaterThanOrEqual(11)
    expect(hole.top).toBeLessThanOrEqual(13)
    expect(hole.bottom).toBeGreaterThanOrEqual(46)
    expect(hole.bottom).toBeLessThanOrEqual(48)
  })

  it('finds nothing when the middle is ink, or the hole runs out to the edge', () => {
    const solid = new Uint8ClampedArray(20 * 20).fill(255)
    expect(counter(solid, 20, 20)).toBeNull()
    const open = new Uint8ClampedArray(20 * 20)
    expect(counter(open, 20, 20)).toBeNull()
  })
})

describe('the colour of the water', () => {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

  it('is the page own: ink for the foam, steel for the rim, the paper for the dark', () => {
    expect(PALETTE.dark.foam).toBe('#e8e2d4')
    expect(PALETTE.dark.rim).toBe('#c8a34a')
    expect(PALETTE.night).toBe('#14110d')
    expect(PALETTE.light.rim).toBe('#f4efe4')
  })

  it('has no blue in it: brown and gold, as the drowned coast would be', () => {
    const all = [
      PALETTE.night,
      ...Object.values(PALETTE.dark),
      ...Object.values(PALETTE.light),
    ]
    for (const hex of all) {
      const [r = 0, g = 0, b = 0] = channels(hex)
      expect(b).toBeLessThanOrEqual(r)
      expect(b).toBeLessThanOrEqual(g)
    }
  })

  it('is what the shader draws with', () => {
    expect(FRAGMENT).toContain(glsl(PALETTE.dark.mid))
    expect(FRAGMENT).toContain(glsl(PALETTE.night))
    expect(glsl('#ff8000')).toBe('vec3(1.000, 0.502, 0.000)')
  })
})
