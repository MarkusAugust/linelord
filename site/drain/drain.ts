/// <reference lib="dom" />
/**
 * Puts the water in the O. Loaded the first time the pointer or the focus
 * finds the O, so the page carries none of this until then. Without WebGL,
 * or for someone who asked for less motion, it does nothing and the
 * stylesheet's own ring stays.
 */
import { approach, FRAGMENT, VERTEX } from './water'

function shader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, source)
  gl.compileShader(s)
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
}

function start(button: HTMLElement): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'drain__water'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  })
  if (!gl) return
  const vs = shader(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook; the rule goes by the name.
  gl.useProgram(program)

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const pos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  const res = gl.getUniformLocation(program, 'u_res')
  const time = gl.getUniformLocation(program, 'u_t')
  const strength = gl.getUniformLocation(program, 'u_k')

  button.prepend(canvas)
  button.classList.add('has-water')

  const fit = () => {
    const box = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(box.width * scale))
    canvas.height = Math.max(1, Math.round(box.height * scale))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  fit()
  new ResizeObserver(fit).observe(canvas)

  let k = 0
  let target = button.matches(':hover, :focus-visible') ? 1 : 0
  let last = performance.now()
  let running = false

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    k = approach(k, target, dt)
    gl.uniform2f(res, canvas.width, canvas.height)
    gl.uniform1f(time, now / 1000)
    gl.uniform1f(strength, k)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (k === 0 && target === 0) {
      running = false
      return
    }
    requestAnimationFrame(frame)
  }
  const wake = (to: number) => {
    target = to
    if (running) return
    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }

  button.addEventListener('pointerenter', () => wake(1))
  button.addEventListener('pointerleave', () =>
    wake(button.matches(':focus-visible') ? 1 : 0),
  )
  button.addEventListener('focus', () => wake(1))
  button.addEventListener('blur', () => wake(button.matches(':hover') ? 1 : 0))
  if (target === 1) wake(1)
}

const button = document.querySelector<HTMLElement>('.drain')
if (
  button &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !button.classList.contains('has-water')
)
  start(button)
