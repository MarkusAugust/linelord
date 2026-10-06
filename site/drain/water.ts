/**
 * The water in the O, and the way down through it.
 *
 * One fragment shader draws all of it. At rest it is a small pool in the hole
 * of the letter, sloshing. Found by the pointer or the focus, it stirs. Pressed,
 * it becomes a whirlpool in log-polar space, turning faster and pulling harder
 * toward a dark throat, and on a canvas over the whole page it grows until the
 * page is gone into it. Nothing here touches the page; `drain.ts` does.
 */

export const VERTEX = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

/**
 * The water's colours, from the page's own: the paper it lies on, the ink for
 * its foam, the steel for the light on its surface. Brown and gold, the colour
 * of a drowned coast, and never blue. `light` is for the page's light theme.
 */
export const PALETTE = {
  dark: { deep: '#2a1f10', mid: '#7a5e28', foam: '#e8e2d4', rim: '#c8a34a' },
  light: { deep: '#5a4420', mid: '#9c7a36', foam: '#fbf6ea', rim: '#f4efe4' },
  night: '#14110d',
} as const

/** A colour as GLSL writes it. */
export function glsl(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) =>
    (Number.parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3),
  )
  return `vec3(${r}, ${g}, ${b})`
}

export const FRAGMENT = `
precision mediump float;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_t;
uniform float u_k;
uniform float u_stir;
uniform float u_edge;
uniform float u_squash;
uniform float u_dark;
uniform float u_level;
uniform float u_wave;
uniform float u_light;
uniform sampler2D u_mask;
uniform float u_masked;
uniform vec2 u_res;
uniform vec2 u_counter;

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
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 d = (gl_FragCoord.xy - u_center) / u_radius;
  d.x *= u_squash;
  float r = length(d);
  float a = atan(d.y, d.x);

  // At rest: a surface that rocks a little, with light moving on it.
  vec3 q = vec3(d * 2.4 + vec2(sin(u_t * 0.5) * 0.25, cos(u_t * 0.37) * 0.18), u_t * 0.2);
  float calm = fbm(q);
  float glint = smoothstep(0.6, 0.78, fbm(q * 2.6 + 1.7));

  // Going out: turning faster toward the middle, falling inward in log r.
  float ang = a + (1.6 / (r + 0.25) + u_t * 1.2) * u_stir;
  float fall = log(r + 0.04) * 1.8 + u_t * 0.9 * u_stir;
  vec3 p = vec3(cos(ang) * 1.4, sin(ang) * 1.4, fall);
  float swirl = fbm(p * 1.7);
  float foam = smoothstep(0.58, 0.78, fbm(p * vec3(3.0, 3.0, 1.2) + 3.1));

  float body = mix(calm, swirl, u_stir);
  float white = mix(glint * 0.55, foam * smoothstep(0.15, 0.6, r) * 0.9, u_stir);

  vec3 deep = mix(${glsl(PALETTE.dark.deep)}, ${glsl(PALETTE.light.deep)}, u_light);
  vec3 mid = mix(${glsl(PALETTE.dark.mid)}, ${glsl(PALETTE.light.mid)}, u_light);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.8, body));
  col = mix(col, mix(${glsl(PALETTE.dark.foam)}, ${glsl(PALETTE.light.foam)}, u_light), white);
  col *= mix(1.0, 0.15 + 0.85 * smoothstep(0.12, 0.38, r), u_stir);

  // The surface. At rest the water lies in the bottom of the hole of the O,
  // filling its real shape (u_mask) up to a level that is a share of the
  // hole's height (u_counter: its bottom and top, in pixels), under a line
  // that rocks. Spun up, it fills a disc and there is no surface left.
  float inside = 1.0 - smoothstep(u_edge * 0.82, u_edge, r);
  float hole = u_masked > 0.5 ? texture2D(u_mask, gl_FragCoord.xy / u_res).a : inside;
  float tall = max(1.0, u_counter.y - u_counter.x);
  float across = (gl_FragCoord.x - u_center.x) / tall;
  float wave = (sin(across * 22.0 + u_t * 2.4) * 0.018 + sin(across * 9.0 - u_t * 1.5) * 0.022) * u_wave * tall;
  float surface = u_counter.x + tall * u_level + wave;
  float px = max(1.0, tall * 0.012);
  float below = 1.0 - smoothstep(surface - px, surface + px, gl_FragCoord.y);
  float rim = (1.0 - smoothstep(0.0, px * 1.6, abs(gl_FragCoord.y - surface))) * hole * (1.0 - u_stir);
  float pool = mix(hole * below, inside, u_stir);
  col = mix(col, mix(${glsl(PALETTE.dark.rim)}, ${glsl(PALETTE.light.rim)}, u_light), rim * 0.85);
  col = mix(col, ${glsl(PALETTE.night)}, u_dark);

  float alpha = max(pool, rim * 0.9) * u_k * mix(1.0, 0.85, u_light * (1.0 - u_dark));
  gl_FragColor = vec4(col * alpha, alpha);
}
`

/** How the water looks: how much it turns, how far it reaches, how round it is. */
export interface Look {
  stir: number
  edge: number
  squash: number
  /** How full the O is, from empty to the brim, at rest. */
  level: number
  /** How much the surface rocks. */
  wave: number
}

/** At rest, in the hole of the O, which is taller than it is wide. */
export const CALM: Look = {
  stir: 0,
  edge: 0.17,
  squash: 1.35,
  level: 0.42,
  wave: 1,
}

/** Found by the pointer or the focus: it notices. */
export const FOUND: Look = {
  stir: 0.16,
  edge: 0.18,
  squash: 1.33,
  level: 0.58,
  wave: 2.4,
}

/** Spun up, just before it leaves the O. */
export const SPUN: Look = {
  stir: 1,
  edge: 0.98,
  squash: 1,
  level: 1,
  wave: 0,
}

/** How long the way down takes, from the press to the dark. */
export const DESCENT_MS = 1300

const clamp = (x: number) => Math.min(1, Math.max(0, x))

/**
 * Where the way down is, `ms` after the press: the O spins up (`stir`), the
 * whirlpool grows from the O until it covers the page (`grow`, eased in so it
 * starts slow and takes the page fast), and the dark closes over it (`dark`).
 */
export function descent(ms: number): {
  stir: number
  grow: number
  dark: number
  done: boolean
} {
  const grow = clamp((ms - 300) / 1000)
  return {
    stir: clamp(ms / 400),
    grow: grow * grow * grow,
    dark: clamp((ms - 900) / 400),
    done: ms >= DESCENT_MS,
  }
}

/**
 * Eases toward a target and snaps to it once close enough that the page can
 * stop drawing.
 */
export function approach(k: number, target: number, dt: number): number {
  const next = k + (target - k) * Math.min(1, dt * 5)
  return Math.abs(next - target) < 0.01 ? target : next
}

/** Where a line of text begins: the top-left of its content area. */
export interface TextBox {
  left: number
  top: number
}

/**
 * A glyph's ink, as `measureText` gives it: `left` and `right` from the pen
 * (left is positive when the ink hangs left of it), `ascent` and `descent` of
 * the ink from the baseline, and `fontAscent` of the font from the top of the
 * content area to the baseline.
 */
export interface Ink {
  left: number
  right: number
  ascent: number
  descent: number
  fontAscent: number
}

/**
 * The middle of the ink of a glyph, in the same space as `box`. The water is
 * centred here rather than on the button, whose box carries the heading's
 * letter-spacing and whatever line-height the browser gives a button.
 */
export function inkCentre(box: TextBox, ink: Ink): { x: number; y: number } {
  const baseline = box.top + ink.fontAscent
  return {
    x: box.left + (ink.right - ink.left) / 2,
    y: baseline + (ink.descent - ink.ascent) / 2,
  }
}

/**
 * The hole in a glyph, found by filling outward from the middle of an image
 * of it until the ink stops the fill. `alpha` is the glyph's coverage, one
 * byte per pixel, rows from the top. The mask keeps the ink's own soft edge
 * (255 where the hole is clear, less where the ink begins to cover it), so the
 * water meets the letter without a jagged line. `top` and `bottom` are the
 * rows the hole spans. A glyph whose middle is ink, or whose hole runs out to
 * the edge of the image, has no hole to fill.
 */
export function counter(
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
): { mask: Uint8Array; top: number; bottom: number } | null {
  const ink = (i: number) => (alpha[i] ?? 255) >= 128
  const start = Math.floor(h / 2) * w + Math.floor(w / 2)
  if (ink(start)) return null
  const mask = new Uint8Array(w * h)
  const seen = new Uint8Array(w * h)
  const queue = [start]
  seen[start] = 1
  let top = h
  let bottom = -1
  while (queue.length > 0) {
    const i = queue.pop() ?? 0
    const x = i % w
    const y = (i - x) / w
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return null
    mask[i] = 255 - (alpha[i] ?? 0)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (seen[n]) continue
      seen[n] = 1
      if (ink(n)) {
        // The ink's soft edge belongs to the hole as far as it is not ink.
        mask[n] = Math.max(mask[n] ?? 0, 255 - (alpha[n] ?? 255))
        continue
      }
      queue.push(n)
    }
  }
  return { mask, top, bottom }
}
