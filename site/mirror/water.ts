/**
 * The sea at the foot of the page, and the way down through it.
 *
 * The page fades into dark water, which stands higher or lower with a tide
 * that runs on the clock. Touched, it rings, and where the rings break the surface the drowned
 * city shows underneath. Held, the rings turn into a whirlpool, and held long
 * enough the water rises over the whole page and the game comes up out of the
 * dark. Closed, the dark goes and the water falls back off the page.
 *
 * Everything here is numbers and text; `mirror.ts` puts it on the page.
 */

import { pools } from '../descent/lore'

/** High water to high water: twelve hours and twenty-five minutes. */
export const TIDE_MS = (12 * 60 + 25) * 60 * 1000

/** How high the tide stands at this moment, from 0 at low water to 1 at high. */
export function tide(now: number): number {
  return 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / TIDE_MS)
}

const rising = (now: number) => Math.cos((2 * Math.PI * now) / TIDE_MS) > 0

/**
 * Where Jarn's line lies in the sand, as a share of the canvas's height from
 * the bottom: above the water at the ebb, under it at the flood.
 */
export const LINE_AT = 0.69

/** The tide level at which the water reaches a height `y` (a share from the bottom). */
export function coverLevel(y: number): number {
  return (y - 0.62) / 0.1
}

/**
 * How much of Jarn's line there is: none while the water is over it, all of
 * it while the flood is still coming up to it, and more and more as the sea
 * goes out and he walks the beach drawing it again.
 */
export function jarnDrawn(now: number): number {
  const level = tide(now)
  const cover = coverLevel(LINE_AT)
  if (level >= cover) return 0
  if (rising(now)) return 1
  return Math.min(1, (cover - level) / 0.12)
}

/** Whether a flood has come over height `y` between `at` and `now`. */
export function washed(at: number, now: number, y: number): boolean {
  const need = coverLevel(y)
  if (need > 1) return false
  if (now - at >= TIDE_MS) return true
  for (let i = 0; i <= 240; i++)
    if (tide(at + ((now - at) * i) / 240) >= need) return true
  return false
}

/** Whether a stroke goes from one side of a line at height `y` to the other. */
export function crosses(
  points: readonly (readonly [number, number])[],
  y: number,
): boolean {
  return points.some(([, py]) => py < y) && points.some(([, py]) => py > y)
}

const shore = (start: string, fallback: string) =>
  pools.shore.find((line) => line.startsWith(start)) ?? fallback

/**
 * What the foot of the page says: your line, if you have drawn across his;
 * otherwise what the shore is doing, by the same clock as the water.
 */
export function saying(now: number, mine: { crossed: boolean } | null): string {
  if (mine?.crossed) return shore('Your line', "Your line, across Jarn's.")
  const level = tide(now)
  if (level >= 0.85) return shore('The sea takes', 'The sea takes the line.')
  if (level <= 0.15)
    return shore('The Linelord', 'The Linelord draws a line in the sand.')
  return rising(now) ? 'The sea is coming in.' : 'The sea is going out.'
}

/**
 * Where the water's top stands on a canvas `height` pixels tall, counted from
 * the bottom: a little higher at the flood, a little lower at the ebb. Above
 * it the water fades into the page.
 */
export function waterline(height: number, level: number): number {
  return height * (0.62 + 0.1 * level)
}

/** A ring on the water: where it started, when, and how hard. */
export interface Ripple {
  x: number
  y: number
  born: number
  strength: number
}

export const MAX_RIPPLES = 8
export const RING_MS = 3200

export const ripple = (
  x: number,
  y: number,
  born: number,
  strength: number,
): Ripple => ({
  x,
  y,
  born,
  strength,
})

/** The rings still moving, newest last, no more than the shader takes. */
export function live(rings: readonly Ripple[], now: number): Ripple[] {
  return rings.filter((r) => now - r.born < RING_MS).slice(-MAX_RIPPLES)
}

/** How long you hold before the water takes you. */
export const HOLD_MS = 1500

/** How far into the hold you are, 0 to 1; `since` is null when nobody holds. */
export function hold(since: number | null, now: number): number {
  if (since === null) return 0
  return Math.min(1, Math.max(0, (now - since) / HOLD_MS))
}

const clamp = (x: number) => Math.min(1, Math.max(0, x))

export const DIVE_MS = 1300
export const SURFACE_MS = 1100

/**
 * Going down, `ms` after the hold is complete: the water rises over the page
 * (`rise`, eased in, so it starts slow and takes the page fast), then the dark
 * closes (`dark`), then the game opens (`done`).
 */
export function dive(ms: number): {
  rise: number
  dark: number
  done: boolean
} {
  const r = clamp(ms / 900)
  return {
    rise: r * r,
    dark: clamp((ms - 800) / 500),
    done: ms >= DIVE_MS,
  }
}

/**
 * Coming up, `ms` after the game has closed: the dark lifts first, then the
 * water falls back off the page (`fall`, eased out, fast then settling).
 */
export function surface(ms: number): {
  fall: number
  dark: number
  done: boolean
} {
  const f = clamp((ms - 300) / 800)
  return {
    fall: 1 - (1 - f) * (1 - f),
    dark: 1 - clamp(ms / 500),
    done: ms >= SURFACE_MS,
  }
}

/**
 * The plate's colours, from the page's own: the steel gold for the light that
 * catches the grooves, the paper for the dark, and on a light page the paper
 * for the plate and a brown ink for the cut. No blue; that is the game's.
 */
export const PALETTE = {
  gold: '#c8a34a',
  night: '#14110d',
  paper: '#f4efe4',
  ink: '#3a2d18',
  dim: '#8a6d1f',
} as const

/** Where the shore is in the engraving: the share of its height from the top. */
export const SHORE_ROW = 0.34

/**
 * The row of the engraving (a share of its height from the top) to draw at
 * height `y` of a canvas `h` tall, counted from the bottom, when the water's
 * top stands at `surface`: the engraving's own shore lands on the waterline,
 * and the tide moves the whole engraving up and down with it.
 */
export function engravingRow(y: number, h: number, surface: number): number {
  return SHORE_ROW + (surface - y) / h
}

/** A colour as GLSL writes it. */
export function glsl(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) =>
    (Number.parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3),
  )
  return `vec3(${r}, ${g}, ${b})`
}

export const VERTEX = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

export const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_t;
uniform float u_surface;
uniform float u_feather;
uniform vec4 u_ripples[${MAX_RIPPLES}];
uniform vec2 u_hold_at;
uniform float u_hold;
uniform float u_dark;
uniform float u_light;
uniform float u_k;
uniform float u_textures;
uniform float u_shore;
uniform float u_aspect;
uniform sampler2D u_engraving;
uniform sampler2D u_plate;
uniform sampler2D u_sand;

// The engraving's ink at a point: 1 where the burin cut, 0 where it did not.
float ink(vec2 uv) {
  return texture2D(u_engraving, uv).r;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float h = u_res.y;

  // Which row of the engraving this is. On the page the engraving's shore
  // stands on the waterline; in the passages the sea fills everything below
  // the rising surface.
  float row = u_shore > 0.5
    ? ${SHORE_ROW.toFixed(3)} + (u_surface - p.y) / h
    : 0.45 + clamp((u_surface - p.y) / (h * 1.6), 0.0, 0.5);
  float sea = u_shore > 0.5 ? smoothstep(${(SHORE_ROW - 0.03).toFixed(3)}, ${(SHORE_ROW + 0.04).toFixed(3)}, row) : 1.0;
  vec2 uv = vec2(p.x / (h * u_aspect), row);

  // Only the sea moves: its lines drift along and rise and fall, more near
  // the eye than out toward the shore.
  float near = clamp((row - ${SHORE_ROW.toFixed(3)}) / 0.6, 0.0, 1.0);
  vec2 drift = vec2(
    u_t * 0.004 + sin(row * 40.0 + u_t * 0.7) * 0.004 * near,
    sin(uv.x * 18.0 + u_t * 0.9) * 0.006 * (0.3 + near)
  ) * sea;

  // Rings and the whirlpool bend the cut lines where the water is touched.
  vec2 bend = vec2(0.0);
  float lift = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = u_ripples[i];
    if (r.z < 0.0) continue;
    vec2 off = p - r.xy;
    float d = length(off);
    float front = r.z * 240.0;
    float band = smoothstep(front + 40.0, front, d) * smoothstep(front - 160.0, front - 20.0, d);
    float w = sin((d - front) * 0.08) * band * exp(-r.z * 1.2) * r.w;
    lift += w;
    bend += off / max(d, 1.0) * w * 8.0;
  }
  vec2 hv = p - u_hold_at;
  float hr = length(hv);
  float pull = u_hold * exp(-hr / (120.0 + 260.0 * u_hold));
  bend += vec2(-hv.y, hv.x) / max(hr, 1.0) * pull * 30.0;
  uv += drift + bend / h * sea;
  uv.y = clamp(uv.y, 0.002, 0.998);

  // The cut, and its slope, from which the light is worked out.
  float px = 1.0 / (h * u_aspect);
  float g = ink(uv) * u_textures;
  vec4 drawn = texture2D(u_sand, p / u_res);
  float lineCut = drawn.a * (1.0 - sea) * u_shore;
  g = max(g, lineCut);
  float gx = ink(uv + vec2(px, 0.0)) - ink(uv - vec2(px, 0.0));
  float gy = ink(uv + vec2(0.0, px)) - ink(uv - vec2(0.0, px));
  vec3 n = normalize(vec3(gx * 2.2, -gy * 2.2, 1.0));

  // A light passing slowly over the plate.
  vec3 light = normalize(vec3(cos(u_t * 0.12) * 0.7, 0.55 + sin(u_t * 0.09) * 0.2, 0.7));
  float lit = max(dot(n, light), 0.0);
  float shine = pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);

  vec3 steel = texture2D(u_plate, p / 640.0).rgb;
  vec3 plate = mix(steel * 0.8, mix(${glsl(PALETTE.paper)}, steel * 1.7, 0.18), u_light);
  vec3 cut = mix(plate * 0.22, ${glsl(PALETTE.ink)}, u_light);
  vec3 col = mix(plate, cut, g * 0.92);
  col *= 0.82 + 0.32 * lit;
  col += mix(${glsl(PALETTE.gold)}, ${glsl(PALETTE.dim)}, u_light) * shine * (0.25 + g) * 1.3;
  col += ${glsl(PALETTE.gold)} * max(lift, 0.0) * 0.25 * sea;
  col *= 1.0 - u_hold * exp(-hr / 70.0) * 0.9;
  col = mix(col, ${glsl(PALETTE.night)}, u_dark);

  // The plate fades into the page above the shore's stipple.
  float plateIn = u_shore > 0.5
    ? smoothstep(0.03, 0.2, row)
    : smoothstep(-u_feather * 0.15, u_feather, u_surface - p.y);
  float a = max(plateIn, u_dark) * u_k;
  gl_FragColor = vec4(col * a, a);
}
`
