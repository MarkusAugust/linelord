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
export const LINE_AT = 0.6

/** The tide level at which the water reaches a height `y` (a share from the bottom). */
export function coverLevel(y: number): number {
  return (y - 0.5) / 0.18
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
  return height * (0.5 + 0.18 * level)
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
 * The water's colours, from the page's own: brown and gold, the ink for the
 * foam, the steel for the light on it, the paper for the dark. Never blue;
 * the blue belongs to the water in the game.
 */
export const PALETTE = {
  dark: {
    deep: '#1e170d',
    mid: '#5c4720',
    foam: '#e8e2d4',
    rim: '#c8a34a',
    sand: '#40352a',
    wet: '#2b2318',
  },
  light: {
    deep: '#4a3818',
    mid: '#8a6d30',
    foam: '#fbf6ea',
    rim: '#f4efe4',
    sand: '#e2d6bc',
    wet: '#c4b391',
  },
  night: '#14110d',
} as const

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
uniform sampler2D u_kell;
uniform sampler2D u_sand;
uniform float u_shore;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  // The edge of the sea moves a little along the beach, as the wash does.
  float wash = (sin(p.x * 0.018 + u_t * 0.7) * 2.5 + sin(p.x * 0.051 - u_t * 1.1) * 1.5) * u_shore;
  float depth = u_surface + wash - p.y;
  float water = u_shore > 0.5
    ? smoothstep(-1.5, 2.5, depth)
    : smoothstep(-u_feather * 0.15, u_feather, depth);

  // A slow swell, stretched along the water as swells are.
  vec2 q = p / u_res.y;
  float swell = fbm(vec3(q * vec2(2.2, 7.0) + vec2(u_t * 0.03, 0.0), u_t * 0.08));
  vec2 bend = vec2(sin(p.y * 0.07 + u_t * 1.3) * 2.5, (swell - 0.5) * 6.0);

  // Rings: a wave front moving out from where the water was touched, dying
  // as it goes. Where they rise or fall steeply the surface breaks.
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
    bend += off / max(d, 1.0) * w * 7.0;
  }

  // The whirlpool where you hold: it turns the water round the point and
  // opens a dark throat in it.
  vec2 h = p - u_hold_at;
  float hr = length(h);
  float pull = u_hold * exp(-hr / (120.0 + 260.0 * u_hold));
  bend += vec2(-h.y, h.x) / max(hr, 1.0) * pull * 26.0;
  float broken = clamp(abs(lift) * 1.5 + pull * 1.4, 0.0, 1.0);

  vec2 uv = clamp((p + bend) / u_res, 0.0, 1.0);
  vec4 kell = texture2D(u_kell, uv) * u_textures;

  vec3 deep = mix(${glsl(PALETTE.dark.deep)}, ${glsl(PALETTE.light.deep)}, u_light);
  vec3 mid = mix(${glsl(PALETTE.dark.mid)}, ${glsl(PALETTE.light.mid)}, u_light);
  vec3 rim = mix(${glsl(PALETTE.dark.rim)}, ${glsl(PALETTE.light.rim)}, u_light);
  vec3 foam = mix(${glsl(PALETTE.dark.foam)}, ${glsl(PALETTE.light.foam)}, u_light);

  vec3 col = mix(deep, mid, smoothstep(0.3, 0.75, swell) * 0.7);
  col *= mix(1.0, 0.6, clamp(depth / u_res.y, 0.0, 1.0));
  col = mix(col, kell.rgb, kell.a * broken);
  col += rim * max(lift, 0.0) * 0.35;
  col = mix(col, rim, smoothstep(u_feather * 0.05, 0.0, abs(depth)) * 0.25);
  col *= 1.0 - u_hold * exp(-hr / 70.0) * 0.9;

  // The beach above the water: wet and dark at the edge, drier and fading
  // into the page further up, with the lines drawn in it.
  float above = -depth;
  vec3 dry = mix(${glsl(PALETTE.dark.sand)}, ${glsl(PALETTE.light.sand)}, u_light);
  vec3 damp = mix(${glsl(PALETTE.dark.wet)}, ${glsl(PALETTE.light.wet)}, u_light);
  vec3 sand = mix(damp, dry, smoothstep(0.0, u_feather * 0.6, above));
  sand *= 0.94 + 0.12 * noise(vec3(p * 0.9, 0.0));
  vec4 drawn = texture2D(u_sand, p / u_res);
  sand = mix(sand, drawn.rgb, drawn.a);
  float beach = (1.0 - smoothstep(u_feather * 0.45, u_feather, above)) * u_shore;
  col = mix(sand, col, water);
  col = mix(col, rim, smoothstep(3.0, 0.0, abs(depth)) * 0.35 * u_shore);
  col = mix(col, ${glsl(PALETTE.night)}, u_dark);

  float a = max(max(water, beach), u_dark) * u_k;
  gl_FragColor = vec4(col * a, a);
}
`
