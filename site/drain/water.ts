/**
 * The water in the O: a whirlpool drawn by a fragment shader, in log-polar
 * space so that it turns faster and pulls harder the nearer it is to the
 * middle, with a dark throat where the Ebb goes out. Nothing here touches the
 * page; `drain.ts` puts it on a canvas.
 */

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
uniform float u_k;

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
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y * 2.0;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Turning: faster toward the middle. Falling: the pattern moves inward in log r.
  float ang = a + 1.6 / (r + 0.25) + u_t * 1.2;
  float fall = log(r + 0.04) * 1.8 + u_t * 0.9;
  vec3 p = vec3(cos(ang) * 1.4, sin(ang) * 1.4, fall);

  float body = fbm(p * 1.7);
  float foam = smoothstep(0.58, 0.78, fbm(p * vec3(3.0, 3.0, 1.2) + 3.1));

  vec3 deep = vec3(0.03, 0.12, 0.20);
  vec3 mid = vec3(0.16, 0.48, 0.68);
  vec3 white = vec3(0.78, 0.91, 0.97);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.8, body));
  col = mix(col, white, foam * smoothstep(0.15, 0.6, r) * 0.9);

  float throat = smoothstep(0.12, 0.38, r);
  col *= 0.15 + 0.85 * throat;

  float alpha = (1.0 - smoothstep(0.62, 0.98, r)) * u_k;
  gl_FragColor = vec4(col * alpha, alpha);
}
`

/**
 * How strongly the water shows: it eases toward 1 while the O is found and
 * back to 0 when it is left, and snaps to rest once it is close enough that
 * the page can stop drawing.
 */
export function approach(k: number, target: number, dt: number): number {
  const next = k + (target - k) * Math.min(1, dt * 5)
  return Math.abs(next - target) < 0.01 ? target : next
}
