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

  vec3 deep = vec3(0.03, 0.12, 0.20);
  vec3 mid = vec3(0.16, 0.48, 0.68);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.8, body));
  col = mix(col, vec3(0.78, 0.91, 0.97), white);
  col *= mix(1.0, 0.15 + 0.85 * smoothstep(0.12, 0.38, r), u_stir);
  col = mix(col, vec3(0.01, 0.02, 0.03), u_dark);

  float alpha = (1.0 - smoothstep(u_edge * 0.82, u_edge, r)) * u_k;
  gl_FragColor = vec4(col * alpha, alpha);
}
`

/** How the water looks: how much it turns, how far it reaches, how round it is. */
export interface Look {
  stir: number
  edge: number
  squash: number
}

/** At rest, in the hole of the O, which is taller than it is wide. */
export const CALM: Look = { stir: 0, edge: 0.2, squash: 1.35 }

/** Found by the pointer or the focus: it notices. */
export const FOUND: Look = { stir: 0.16, edge: 0.24, squash: 1.3 }

/** Spun up, just before it leaves the O. */
export const SPUN: Look = { stir: 1, edge: 0.98, squash: 1 }

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
