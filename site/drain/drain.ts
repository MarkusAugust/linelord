/// <reference lib="dom" />
/**
 * The O of the name: a pool of water in the hole of the letter, and the way
 * down into the game through it.
 *
 * Loaded with the page. The pool sloshes while the O is on screen; when the
 * pointer or the focus finds the O it stirs; pressed, it spins up into a
 * whirlpool that grows over the whole page, the page goes dark, and the game
 * opens out of the dark. As the game opens the O is put back to rest and the
 * whirlpool over the page is taken away, so closing the game finds the pool
 * as it was.
 *
 * Without WebGL the O is marked `no-water`, the stylesheet's ring is shown on
 * hover and a press opens the game directly. For someone who asked for less
 * motion the pool is drawn once and does not move, and a press opens the game
 * directly.
 */
import {
  approach,
  CALM,
  DESCENT_MS,
  descent,
  FOUND,
  FRAGMENT,
  type Look,
  SPUN,
  VERTEX,
} from './water'

interface Frame {
  center: [number, number]
  radius: number
  t: number
  k: number
  look: Look
  dark: number
}

/** A canvas with the water's shader on it, or null where WebGL will not do it. */
function water(canvas: HTMLCanvasElement): ((f: Frame) => void) | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  })
  if (!gl) return null
  const compile = (type: number, source: string) => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, source)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook; the rule goes by the name.
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const pos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  const at = (name: string) => gl.getUniformLocation(program, name)
  const u = {
    center: at('u_center'),
    radius: at('u_radius'),
    t: at('u_t'),
    k: at('u_k'),
    stir: at('u_stir'),
    edge: at('u_edge'),
    squash: at('u_squash'),
    dark: at('u_dark'),
  }
  return (f) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(u.center, f.center[0], f.center[1])
    gl.uniform1f(u.radius, f.radius)
    gl.uniform1f(u.t, f.t)
    gl.uniform1f(u.k, f.k)
    gl.uniform1f(u.stir, f.look.stir)
    gl.uniform1f(u.edge, f.look.edge)
    gl.uniform1f(u.squash, f.look.squash)
    gl.uniform1f(u.dark, f.dark)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

const scale = () => Math.min(window.devicePixelRatio || 1, 2)

const mix = (a: Look, b: Look, t: number): Look => ({
  stir: a.stir + (b.stir - a.stir) * t,
  edge: a.edge + (b.edge - a.edge) * t,
  squash: a.squash + (b.squash - a.squash) * t,
})

/** Opens the game: the same thing `>` does on the page. */
function openGame(): void {
  import(new URL('descent.js', document.baseURI).href)
  const dialog = document.getElementById('descent')
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

function start(button: HTMLElement): void {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.createElement('canvas')
  canvas.className = 'drain__water'
  canvas.setAttribute('aria-hidden', 'true')
  const draw = water(canvas)
  if (!draw) {
    button.classList.add('no-water')
    button.addEventListener('click', openGame)
    return
  }
  button.prepend(canvas)
  button.classList.add('has-water')

  const fit = () => {
    const box = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width * scale()))
    canvas.height = Math.max(1, Math.round(box.height * scale()))
  }
  fit()

  let found = 0
  let wanted = 0
  let onScreen = true
  let going: number | null = null
  let running = false
  let last = performance.now()

  /* While the game is open the O is under it, and nothing is drawn. */
  const dialog = document.getElementById('descent')
  const playing = () =>
    going === null && dialog instanceof HTMLDialogElement && dialog.open

  const paint = (now: number, look: Look) =>
    draw({
      center: [canvas.width / 2, canvas.height / 2],
      radius: canvas.width / 2,
      t: now / 1000,
      k: 1,
      look,
      dark: 0,
    })

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    found = approach(found, wanted, dt)
    const look =
      going === null
        ? mix(CALM, FOUND, found)
        : mix(FOUND, SPUN, descent(now - going).stir)
    paint(now, look)
    if (still || !onScreen || playing()) {
      running = false
      return
    }
    requestAnimationFrame(frame)
  }
  const wake = () => {
    if (running || still) return
    running = true
    last = performance.now()
    requestAnimationFrame(frame)
  }

  new ResizeObserver(() => {
    fit()
    if (still) paint(0, CALM)
  }).observe(canvas)
  new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
    if (onScreen) wake()
  }).observe(button)

  const notice = (on: boolean) => () => {
    wanted = on || button.matches(':hover, :focus-visible') ? 1 : 0
    wake()
  }
  dialog?.addEventListener('close', () => {
    going = null
    found = 0
    wanted = 0
    wake()
  })

  button.addEventListener('pointerenter', notice(true))
  button.addEventListener('pointerleave', notice(false))
  button.addEventListener('focus', notice(true))
  button.addEventListener('blur', notice(false))

  /* The way down. The whirlpool leaves the O for a canvas over the whole
     page, grows until the page is gone, and the game opens out of the dark.
     Then everything is put back: the O at rest, the canvas over the page
     taken away. */
  button.addEventListener('click', () => {
    if (going !== null) return
    if (still) return openGame()
    import(new URL('descent.js', document.baseURI).href)
    going = performance.now()
    wake()

    const veil = document.createElement('canvas')
    veil.className = 'drain__veil'
    veil.setAttribute('aria-hidden', 'true')
    const pour = water(veil)
    if (!pour) {
      going = null
      return openGame()
    }
    document.body.append(veil)
    veil.width = Math.round(window.innerWidth * scale())
    veil.height = Math.round(window.innerHeight * scale())
    const box = canvas.getBoundingClientRect()
    const cx = (box.left + box.width / 2) * scale()
    const cy = (window.innerHeight - (box.top + box.height / 2)) * scale()
    const from = (box.width / 2) * scale()
    const to = Math.hypot(veil.width, veil.height) * 1.3

    const began = going
    let opened = 0
    let gone = false

    /* The game opens and the O comes back to rest, once, whether the last
       frame got there or the clock did: a tab in the background draws no
       frames, and the game must open all the same. */
    const finish = (now: number) => {
      if (opened) return
      opened = now
      openGame()
      going = null
      found = 0
      wanted = button.matches(':hover, :focus-visible') ? 1 : 0
      if (document.visibilityState === 'hidden') leave()
    }
    const leave = () => {
      if (gone) return
      gone = true
      veil.remove()
    }
    setTimeout(() => finish(performance.now()), DESCENT_MS + 250)
    setTimeout(leave, DESCENT_MS + 1000)

    const step = (now: number) => {
      if (gone) return
      const d = descent(now - began)
      pour({
        center: [cx, cy],
        radius: from + (to - from) * d.grow,
        t: now / 1000,
        k: opened ? Math.max(0, 1 - (now - opened) / 400) : 1,
        look: { ...SPUN, edge: 0.98 + d.dark },
        dark: d.dark,
      })
      if (d.done) finish(now)
      if (opened && now - opened >= 400) return leave()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })

  if (still) paint(0, CALM)
  else wake()
}

const button = document.querySelector<HTMLElement>('.drain')
if (
  button &&
  !button.classList.contains('has-water') &&
  !button.classList.contains('no-water')
)
  start(button)
