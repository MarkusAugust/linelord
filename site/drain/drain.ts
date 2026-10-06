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
  counter,
  DESCENT_MS,
  descent,
  FOUND,
  FRAGMENT,
  inkCentre,
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
  /** The hole's bottom and top, in the canvas's pixels from the bottom. */
  counter: [number, number]
  /** Whether the hole's shape has been given (`mask`), or a disc stands in. */
  masked: boolean
}

interface Water {
  draw: (f: Frame) => void
  /** The shape of the hole, one byte per pixel, rows from the bottom. */
  mask: (data: Uint8Array, w: number, h: number) => void
}

/** A canvas with the water's shader on it, or null where WebGL will not do it. */
function water(canvas: HTMLCanvasElement): Water | null {
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
    level: at('u_level'),
    wave: at('u_wave'),
    light: at('u_light'),
    masked: at('u_masked'),
    res: at('u_res'),
    counter: at('u_counter'),
    mask: at('u_mask'),
  }
  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.ALPHA,
    1,
    1,
    0,
    gl.ALPHA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0]),
  )
  gl.uniform1i(u.mask, 0)
  const mask = (data: Uint8Array, w: number, h: number) => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.ALPHA,
      w,
      h,
      0,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      data,
    )
  }
  const draw = (f: Frame) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(u.center, f.center[0], f.center[1])
    gl.uniform1f(u.radius, f.radius)
    gl.uniform1f(u.t, f.t)
    gl.uniform1f(u.k, f.k)
    gl.uniform1f(u.stir, f.look.stir)
    gl.uniform1f(u.edge, f.look.edge)
    gl.uniform1f(u.squash, f.look.squash)
    gl.uniform1f(u.dark, f.dark)
    gl.uniform1f(u.level, f.look.level)
    gl.uniform1f(u.wave, f.look.wave)
    gl.uniform1f(u.light, light())
    gl.uniform1f(u.masked, f.masked ? 1 : 0)
    gl.uniform2f(u.res, canvas.width, canvas.height)
    gl.uniform2f(u.counter, f.counter[0], f.counter[1])
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  return { draw, mask }
}

const scale = () => Math.min(window.devicePixelRatio || 1, 2)

/* The O's canvas is small, so it can afford the screen's full density: a phone
   at 3x would otherwise show the water soft. */
const fine = () => Math.min(window.devicePixelRatio || 1, 3)

const pen = document.createElement('canvas').getContext('2d')

/**
 * Puts the canvas over the middle of the O's ink: measured off the letter as
 * the browser draws it, so that it lands in the same place whatever the font,
 * the zoom, or the way a browser lays out a button.
 */
interface Shape {
  font: (px: number) => string
  size: number
  glyph: string
}

function place(button: HTMLElement, canvas: HTMLCanvasElement): Shape | null {
  const text = Array.from(button.childNodes).find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
  )
  if (!text || !pen) return null
  const range = document.createRange()
  range.selectNodeContents(text)
  const line = range.getBoundingClientRect()
  const own = button.getBoundingClientRect()
  const style = getComputedStyle(button)
  const font = (px: number) =>
    `${style.fontStyle} ${style.fontWeight} ${px}px ${style.fontFamily}`
  pen.font = font(Number.parseFloat(style.fontSize))
  const glyph =
    style.textTransform === 'uppercase'
      ? (text.textContent ?? '').trim().toUpperCase()
      : (text.textContent ?? '').trim()
  const m = pen.measureText(glyph)
  const c = inkCentre(
    { left: line.left, top: line.top },
    {
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
      fontAscent: m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent,
    },
  )
  const size = Number.parseFloat(style.fontSize) * 2.6
  canvas.style.left = `${c.x - own.left - size / 2}px`
  canvas.style.top = `${c.y - own.top - size / 2}px`
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  canvas.style.transform = 'none'
  return { font, size: Number.parseFloat(style.fontSize), glyph }
}

/**
 * The hole of the O as the water canvas sees it: the letter drawn unseen at
 * the canvas's own scale, centred on its ink as the canvas is, and filled from
 * the middle. Rows are turned over for WebGL, which counts from the bottom.
 */
function hollow(shape: Shape, w: number, h: number) {
  const sheet = document.createElement('canvas')
  sheet.width = w
  sheet.height = h
  const ctx = sheet.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.font = shape.font(shape.size * fine())
  const m = ctx.measureText(shape.glyph)
  const x = w / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
  const y = h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  ctx.fillText(shape.glyph, x, y)
  const rgba = ctx.getImageData(0, 0, w, h).data
  const alpha = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = rgba[i * 4 + 3] ?? 0
  const hole = counter(alpha, w, h)
  if (!hole) return null
  const turned = new Uint8Array(w * h)
  for (let row = 0; row < h; row++)
    turned.set(hole.mask.subarray(row * w, row * w + w), (h - 1 - row) * w)
  return {
    mask: turned,
    bottom: h - 1 - hole.bottom,
    top: h - 1 - hole.top,
  }
}

const mix = (a: Look, b: Look, t: number): Look => ({
  stir: a.stir + (b.stir - a.stir) * t,
  edge: a.edge + (b.edge - a.edge) * t,
  squash: a.squash + (b.squash - a.squash) * t,
  level: a.level + (b.level - a.level) * t,
  wave: a.wave + (b.wave - a.wave) * t,
})

/* Whether the page is light, read off the colour it actually has rather than
   guessed from its rules, and read again when the theme can have changed. The
   water is lighter on a light page. */
const measure = () => {
  const [r = 0, g = 0, b = 0] = (
    getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? []
  ).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? 1 : 0
}
let lightNow = 0
const light = () => lightNow
const remeasure = () => {
  lightNow = measure()
}

/** Opens the game: the same thing `>` does on the page. */
function openGame(): void {
  import(new URL('descent.js', document.baseURI).href)
  const dialog = document.getElementById('descent')
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

/**
 * When the game closes the browser gives focus back to whatever had it when
 * the game opened. From the keyboard that is the O, which is right. A mouse or
 * a finger would also focus the O on the press, and the ring and the stirring
 * water would then still be there when the game closes; so a press does not
 * take the focus, and it goes back to where it was.
 */
function settle(button: HTMLElement): void {
  button.addEventListener('mousedown', (evt) => evt.preventDefault())
}

function start(button: HTMLElement): void {
  settle(button)
  remeasure()
  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    remeasure,
  )
  new MutationObserver(remeasure).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
  })
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const canvas = document.createElement('canvas')
  canvas.className = 'drain__water'
  canvas.setAttribute('aria-hidden', 'true')
  const surface = water(canvas)
  if (!surface) {
    button.classList.add('no-water')
    button.addEventListener('click', openGame)
    return
  }
  button.prepend(canvas)
  button.classList.add('has-water')

  /* The hole's place in the canvas, and whether its shape is known; until it
     is, a small disc in the middle stands in for it. */
  let hole: { counter: [number, number]; masked: boolean } = {
    counter: [0, 0],
    masked: false,
  }
  const fit = () => {
    const shape = place(button, canvas)
    const box = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width * fine()))
    canvas.height = Math.max(1, Math.round(box.height * fine()))
    const shaped = shape ? hollow(shape, canvas.width, canvas.height) : null
    if (shaped) {
      surface.mask(shaped.mask, canvas.width, canvas.height)
      hole = { counter: [shaped.bottom, shaped.top], masked: true }
    } else {
      const reach = (canvas.width / 2) * CALM.edge
      hole = {
        counter: [canvas.height / 2 - reach, canvas.height / 2 + reach],
        masked: false,
      }
    }
  }
  fit()
  document.fonts?.ready.then(fit)

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
    surface.draw({
      center: [canvas.width / 2, canvas.height / 2],
      radius: canvas.width / 2,
      t: now / 1000,
      k: 1,
      look,
      dark: 0,
      counter: hole.counter,
      masked: hole.masked,
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
  }).observe(button)
  new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
    if (onScreen) wake()
  }).observe(button)

  const notice = (on: boolean) => () => {
    wanted = on || button.matches(':hover, :focus-visible') ? 1 : 0
    wake()
  }
  /* The game closing, seen on the dialog's own attribute: the close event
     is not delivered everywhere it should be, and the pool must wake. */
  if (dialog)
    new MutationObserver(() => {
      if (dialog.hasAttribute('open')) return
      going = null
      found = 0
      wanted = button.matches(':hover, :focus-visible') ? 1 : 0
      wake()
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] })

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
    const pour = water(veil)?.draw
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
        counter: [0, 0],
        masked: false,
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
