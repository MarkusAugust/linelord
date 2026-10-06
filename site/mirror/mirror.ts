/// <reference lib="dom" />
/**
 * The sea at the foot of the page. Fetched when the water comes into view,
 * and by `>` or `?descend`, which call `descend()`.
 *
 * Three pieces: the mirror itself, drawn into the bottom of the page; the
 * hands on it (pointer, finger, keyboard); and the way down and back up, drawn
 * on a canvas over the whole window for the second it lasts and then removed.
 * Nothing is drawn while the water is off screen or the game is open.
 */
import { pools } from '../descent/lore'
import {
  crosses,
  DIVE_MS,
  dive,
  FRAGMENT,
  HOLD_MS,
  hold,
  jarnDrawn,
  LINE_AT,
  live,
  MAX_RIPPLES,
  type Ripple,
  ripple,
  SURFACE_MS,
  saying,
  surface,
  tide,
  VERTEX,
  washed,
  waterline,
} from './water'

interface Frame {
  t: number
  surface: number
  feather: number
  ripples: Ripple[]
  now: number
  holdAt: [number, number]
  hold: number
  dark: number
  k: number
  /** 1 for the beach above the water, 0 for the water alone (the passages). */
  shore: number
}

interface Water {
  draw: (f: Frame) => void
  /** The engraving's ink and the steel it is cut into. */
  images: (ink: HTMLCanvasElement, plate: HTMLImageElement) => void
  /** The lines drawn in the sand, redrawn whenever one of them changes. */
  sand: (lines: HTMLCanvasElement) => void
}

/** Whether the page is light, read off the colour it actually has. */
function light(): number {
  const [r = 0, g = 0, b = 0] = (
    getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? []
  ).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? 1 : 0
}

/** The water's shader on a canvas, or null where WebGL will not do it. */
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
    res: at('u_res'),
    t: at('u_t'),
    surface: at('u_surface'),
    feather: at('u_feather'),
    ripples: at('u_ripples'),
    holdAt: at('u_hold_at'),
    hold: at('u_hold'),
    dark: at('u_dark'),
    light: at('u_light'),
    k: at('u_k'),
    textures: at('u_textures'),
    shore: at('u_shore'),
    aspect: at('u_aspect'),
  }
  const sheet = (unit: number, name: string) => {
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4),
    )
    gl.uniform1i(at(name), unit)
    return tex
  }
  const inkTex = sheet(0, 'u_engraving')
  const plateTex = sheet(1, 'u_plate')
  const sandTex = sheet(2, 'u_sand')
  /* The plate repeats; the engraving is drawn once, clamped at its edges. Both
     are drawn smaller than they are made, and get mipmaps so the fine lines
     do not shimmer. */
  const tiled = (
    unit: number,
    tex: WebGLTexture | null,
    image: TexImageSource,
    clampT: boolean,
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      clampT ? gl.CLAMP_TO_EDGE : gl.REPEAT,
    )
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      clampT ? gl.CLAMP_TO_EDGE : gl.REPEAT,
    )
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    )
    gl.generateMipmap(gl.TEXTURE_2D)
  }
  let textured = 0
  const isLight = light()
  return {
    images: (ink, plate) => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      tiled(0, inkTex, ink, true)
      tiled(1, plateTex, plate, false)
      textured = 1
    },
    sand: (lines) => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, sandTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lines)
    },
    draw: (f) => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(u.res, canvas.width, canvas.height)
      gl.uniform1f(u.t, f.t)
      gl.uniform1f(u.surface, f.surface)
      gl.uniform1f(u.feather, f.feather)
      const rings = new Float32Array(MAX_RIPPLES * 4).fill(-1)
      f.ripples.forEach((r, i) => {
        rings.set([r.x, r.y, (f.now - r.born) / 1000, r.strength], i * 4)
      })
      gl.uniform4fv(u.ripples, rings)
      gl.uniform2f(u.holdAt, f.holdAt[0], f.holdAt[1])
      gl.uniform1f(u.hold, f.hold)
      gl.uniform1f(u.dark, f.dark)
      gl.uniform1f(u.light, isLight)
      gl.uniform1f(u.k, f.k)
      gl.uniform1f(u.textures, textured)
      gl.uniform1f(u.shore, f.shore)
      gl.uniform1f(u.aspect, INK_W / INK_H)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
  }
}

/* The water is soft; it is drawn at less than the screen's density, which a
   phone's GPU will thank us for. */
const scale = () => Math.min(window.devicePixelRatio || 1, 1.5) * 0.7

const INK_W = 2048
const INK_H = 512

/** Fetches an image the page carries beside this module. */
function picture(name: string): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => done(image)
    image.onerror = fail
    image.src = new URL(name, document.baseURI).href
  })
}

/**
 * The engraving as the shader reads it: ink in the red channel (1 where the
 * burin cut), stretched to a power of two so it can repeat along the beach,
 * and the thin rule at its foot cut off. It is drawn once across the width,
 * so it never repeats.
 */
function inkSheet(image: HTMLImageElement): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = INK_W
  sheet.height = INK_H
  const ctx = sheet.getContext('2d', { willReadFrequently: true })
  if (!ctx) return sheet
  const keep = image.naturalHeight * 0.965
  ctx.drawImage(image, 0, 0, image.naturalWidth, keep, 0, 0, INK_W, INK_H)
  const data = ctx.getImageData(0, 0, INK_W, INK_H)
  const px = data.data
  const lum = (i: number) =>
    0.299 * (px[i] ?? 255) +
    0.587 * (px[i + 1] ?? 255) +
    0.114 * (px[i + 2] ?? 255)
  const out = new Uint8ClampedArray(px.length)
  for (let y = 0; y < INK_H; y++) {
    for (let x = 0; x < INK_W; x++) {
      const i = (y * INK_W + x) * 4
      const v = 255 - lum(i)
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
  }
  ctx.putImageData(new ImageData(out, INK_W, INK_H), 0, 0)
  return sheet
}

/** A stroke cut into the plate: the shader lights it as it lights the engraving. */
function groove(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  width: number,
): void {
  if (points.length < 2) return
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
  ctx.lineWidth = width
  ctx.stroke()
}

/** Jarn's line along the beach, as far as he has drawn it, and yours. */
function sandSheet(
  w: number,
  h: number,
  drawn: number,
  mine: readonly (readonly [number, number])[] | null,
): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = w
  sheet.height = h
  const ctx = sheet.getContext('2d')
  if (!ctx) return sheet
  const width = Math.max(2, h * 0.012)
  const y0 = h - LINE_AT * h
  const his: [number, number][] = []
  for (let x = w * 0.02; x <= w * 0.02 + w * 0.96 * drawn; x += 4)
    his.push([
      x,
      y0 + Math.sin(x * 0.013) * h * 0.012 + Math.sin(x * 0.041) * h * 0.005,
    ])
  groove(ctx, his, width)
  if (mine)
    groove(
      ctx,
      mine.map(([x, y]) => [x * w, h - y * h] as [number, number]),
      width * 0.85,
    )
  return sheet
}

const store = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k)
    } catch {
      // No storage: the line in the sand lasts as long as the page.
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // As above: kept for this page only.
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      // As above.
    }
  },
}

interface Mine {
  points: [number, number][]
  at: number
  crossed: boolean
}

function readMine(): Mine | null {
  try {
    const raw = store.get('shore.line')
    const v = raw ? (JSON.parse(raw) as Mine) : null
    return v && Array.isArray(v.points) && typeof v.at === 'number' ? v : null
  } catch {
    // A line that cannot be read was never drawn.
    return null
  }
}

function openGame(): void {
  import(new URL('descent.js', document.baseURI).href)
  const dialog = document.getElementById('descent')
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches

let mirror: ReturnType<typeof setup> | null = null

/* Fetched once, shared by the plate at the foot of the page and the one over
   the window on the way down and up. */
const plates: Promise<[HTMLCanvasElement, HTMLImageElement]> = Promise.all([
  picture('engraving.webp').then(inkSheet),
  picture('plate.webp'),
])

function setup(el: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.className = 'mirror__water'
  canvas.setAttribute('aria-hidden', 'true')
  const hint = document.createElement('span')
  hint.className = 'mirror__hint'
  hint.textContent = 'Hold.'
  hint.setAttribute('aria-hidden', 'true')
  const bar = document.createElement('span')
  bar.className = 'mirror__progress'
  bar.setAttribute('aria-hidden', 'true')
  const surfaceGl = water(canvas)
  el.prepend(canvas)
  el.append(hint, bar)
  el.classList.add(surfaceGl ? 'has-water' : 'no-water')

  let rings: Ripple[] = []
  let since: number | null = null
  let at: [number, number] = [0, 0]
  let onScreen = true
  let running = false
  let going = false
  let hinted = false
  let lastFrame = 0
  let mine = readMine()
  let drawing: [number, number][] | null = null
  const revealFrom = performance.now()
  let lastDrawn = -1
  /* The lines in the sand: Jarn's, drawn out along the beach the first time
     the shore is seen, and as the tide allows; and yours, until a flood has
     been over it. */
  const lines = (now: number, force = false) => {
    if (!surfaceGl) return
    if (
      mine &&
      washed(mine.at, Date.now(), Math.min(...mine.points.map(([, y]) => y)))
    ) {
      mine = null
      store.remove('shore.line')
    }
    const reveal = still ? 1 : Math.min(1, (now - revealFrom) / 2500)
    const drawn =
      Math.round(Math.min(jarnDrawn(Date.now()), reveal) * 200) / 200
    if (!force && drawn === lastDrawn && !drawing) return
    lastDrawn = drawn
    const points = drawing ?? mine?.points ?? null
    surfaceGl.sand(sandSheet(canvas.width, canvas.height, drawn, points))
  }

  const fit = () => {
    const box = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width * scale()))
    canvas.height = Math.max(1, Math.round(box.height * scale()))
    if (!surfaceGl) return
    lines(performance.now(), true)
  }

  /* The engraving and the plate come after the water: until they have, the
     plate shows plain, and then the cut appears in it. */
  plates.then(([ink, plate]) => {
    surfaceGl?.images(ink, plate)
    paint(performance.now())
  })

  const dialog = document.getElementById('descent')
  const playing = () => dialog instanceof HTMLDialogElement && dialog.open

  const paint = (now: number) => {
    if (!surfaceGl) return
    rings = live(rings, now)
    const h = hold(since, now)
    surfaceGl.draw({
      t: still ? 0 : now / 1000,
      surface: waterline(canvas.height, tide(Date.now())),
      feather: canvas.height * 0.4,
      ripples: still ? [] : rings,
      now,
      holdAt: at,
      hold: still ? 0 : h,
      dark: 0,
      k: 1,
      shore: 1,
    })
    lines(now)
    bar.style.transform = `scaleX(${h})`
    if (h >= 1 && since !== null) {
      since = null
      go(at)
    }
  }

  const frame = (now: number) => {
    const busy =
      since !== null ||
      rings.length > 0 ||
      drawing !== null ||
      now - revealFrom < 2600
    // At rest the swell is slow, and half the frames do for it.
    if (busy || now - lastFrame > 32) {
      lastFrame = now
      paint(now)
    }
    if (still && since === null) {
      running = false
      return
    }
    if (!onScreen || playing() || going) {
      running = false
      return
    }
    requestAnimationFrame(frame)
  }
  const wake = () => {
    if (running) return
    running = true
    requestAnimationFrame(frame)
  }

  new ResizeObserver(() => {
    fit()
    paint(performance.now())
  }).observe(el)
  new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
    if (onScreen) wake()
  }).observe(el)

  const local = (evt: {
    clientX: number
    clientY: number
  }): [number, number] => {
    const box = canvas.getBoundingClientRect()
    return [
      (evt.clientX - box.left) * scale(),
      (box.bottom - evt.clientY) * scale(),
    ]
  }
  const touch = (x: number, y: number, strength: number) => {
    rings = live(
      [...rings, ripple(x, y, performance.now(), strength)],
      performance.now(),
    )
    wake()
  }
  const showHint = (
    evt: { clientX: number; clientY: number },
    text = 'Hold.',
    always = false,
  ) => {
    if (hinted && !always) return
    hinted = true
    hint.textContent = text
    const box = el.getBoundingClientRect()
    hint.style.left = `${evt.clientX - box.left}px`
    hint.style.top = `${evt.clientY - box.top}px`
    hint.classList.add('is-shown')
    setTimeout(() => hint.classList.remove('is-shown'), 1800)
  }
  const press = (point: [number, number]) => {
    if (going) return
    at = point
    const mine = performance.now()
    since = mine
    import(new URL('descent.js', document.baseURI).href)
    wake()
    // The clock finishes the hold even where no frame is drawn to see it.
    setTimeout(() => {
      if (since !== mine) return
      since = null
      go(at)
    }, HOLD_MS)
  }
  const release = () => {
    if (since === null) return
    since = null
    bar.style.transform = 'scaleX(0)'
    touch(at[0], at[1], 0.6)
  }

  let lastMove = 0
  /* Above the water's edge is sand, and a finger there draws a line. */
  const onSand = (point: [number, number]) =>
    point[1] > waterline(canvas.height, tide(Date.now())) + canvas.height * 0.02
  const norm = ([x, y]: [number, number]): [number, number] => [
    x / canvas.width,
    y / canvas.height,
  ]
  const finishLine = (evt: { clientX: number; clientY: number }) => {
    const points = drawing
    drawing = null
    if (!points || points.length < 3) return lines(performance.now(), true)
    const crossed = crosses(points, LINE_AT)
    mine = { points, at: Date.now(), crossed }
    store.set('shore.line', JSON.stringify(mine))
    if (crossed) {
      store.set('descent.challenger', String(Date.now()))
      showHint(evt, pools.jarn[0] ?? 'Did you mean to?', true)
    }
    lines(performance.now(), true)
    say()
  }

  /* A finger that starts in the sand is drawing, not scrolling: the page
     stays put for that one touch. Anywhere else it scrolls as ever. */
  el.addEventListener(
    'touchstart',
    (evt) => {
      const t = evt.touches[0]
      if (t && !still && onSand(local(t))) evt.preventDefault()
    },
    { passive: false },
  )

  el.addEventListener('pointermove', (evt) => {
    const now = performance.now()
    if (drawing) {
      const point = norm(local(evt))
      const last = drawing[drawing.length - 1]
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.004)
        drawing.push(point)
      return
    }
    if (since !== null) at = local(evt)
    else if (now - lastMove > 280) {
      lastMove = now
      const [x, y] = local(evt)
      touch(x, y, 0.35)
    }
  })
  el.addEventListener('pointerdown', (evt) => {
    const point = local(evt)
    if (onSand(point) && !still) {
      drawing = [norm(point)]
      wake()
      return
    }
    touch(point[0], point[1], 1)
    showHint(evt)
    press(point)
  })
  for (const name of ['pointerup', 'pointerleave', 'pointercancel'])
    el.addEventListener(name, (evt) => {
      if (drawing) return finishLine(evt as PointerEvent)
      release()
    })
  el.addEventListener('contextmenu', (evt) => evt.preventDefault())
  /* A press with a mouse or a finger does not focus the water, so closing the
     game gives the focus back to where it was rather than leaving a ring round
     the sea. From the keyboard the water had the focus, and gets it back. */
  el.addEventListener('mousedown', (evt) => evt.preventDefault())
  el.addEventListener('keydown', (evt) => {
    if ((evt.key !== 'Enter' && evt.key !== ' ') || evt.repeat) return
    evt.preventDefault()
    const point: [number, number] = [
      canvas.width / 2,
      waterline(canvas.height, 0.5) * 0.6,
    ]
    touch(point[0], point[1], 1)
    press(point)
  })
  el.addEventListener('keyup', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') release()
  })

  /* Down: a canvas over the whole window, the water rising over the page
     from where the mirror is, the dark closing, and the game opening. */
  let wentFrom: [number, number] = [0, 0]
  const go = (point: [number, number]) => {
    if (going) return
    going = true
    const box = canvas.getBoundingClientRect()
    wentFrom = [box.left + point[0] / scale(), box.bottom - point[1] / scale()]
    if (still || !surfaceGl) {
      openGame()
      going = false
      return
    }
    const veil = document.createElement('canvas')
    veil.className = 'mirror__veil'
    veil.setAttribute('aria-hidden', 'true')
    const pour = water(veil)
    if (pour) plates.then(([ink, plate]) => pour.images(ink, plate))
    if (!pour) {
      openGame()
      going = false
      return
    }
    document.body.append(veil)
    veil.width = Math.round(window.innerWidth * scale())
    veil.height = Math.round(window.innerHeight * scale())
    const top = Math.min(
      window.innerHeight,
      box.bottom - waterline(box.height, tide(Date.now())),
    )
    const from = (window.innerHeight - top) * scale()
    const to = veil.height * 1.6
    const holdAt: [number, number] = [
      wentFrom[0] * scale(),
      (window.innerHeight - wentFrom[1]) * scale(),
    ]
    const began = performance.now()
    let opened = false
    const finish = () => {
      if (opened) return
      opened = true
      openGame()
      veil.remove()
      going = false
    }
    setTimeout(finish, DIVE_MS + 300)
    const step = (now: number) => {
      if (opened) return
      const d = dive(now - began)
      pour.draw({
        t: now / 1000,
        surface: from + (to - from) * d.rise,
        feather: veil.height * 0.25,
        ripples: [],
        now,
        holdAt,
        hold: 1 - d.rise * 0.6,
        dark: d.dark,
        k: 1,
        shore: 0,
      })
      if (d.done) return finish()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  /* Up: when the game closes after a dive, the window comes back to the
     water, the dark lifts and the water falls back off the page, and the
     place you went in rings. */
  let under = false
  if (dialog) {
    new MutationObserver(() => {
      if (dialog.hasAttribute('open')) {
        under = true
        return
      }
      if (!under) return
      under = false
      el.scrollIntoView({ block: 'end', behavior: 'instant' })
      const box = canvas.getBoundingClientRect()
      const ring = () => {
        const [x, y] = [
          (wentFrom[0] - box.left) * scale(),
          (box.bottom - wentFrom[1]) * scale(),
        ]
        touch(x, y, 1)
        touch(x, y, 0.6)
        wake()
      }
      if (still || !surfaceGl) return ring()
      const veil = document.createElement('canvas')
      veil.className = 'mirror__veil'
      veil.setAttribute('aria-hidden', 'true')
      const pour = water(veil)
      if (pour) plates.then(([ink, plate]) => pour.images(ink, plate))
      if (!pour) return ring()
      document.body.append(veil)
      veil.width = Math.round(window.innerWidth * scale())
      veil.height = Math.round(window.innerHeight * scale())
      const top = box.bottom - waterline(box.height, tide(Date.now()))
      const to = (window.innerHeight - top) * scale()
      const from = veil.height * 1.6
      const began = performance.now()
      let gone = false
      const leave = () => {
        if (gone) return
        gone = true
        veil.remove()
        ring()
      }
      setTimeout(leave, SURFACE_MS + 300)
      const step = (now: number) => {
        if (gone) return
        const s = surface(now - began)
        pour.draw({
          t: now / 1000,
          surface: from + (to - from) * s.fall,
          feather: veil.height * 0.25,
          ripples: [],
          now,
          holdAt: [-9999, -9999],
          hold: 0,
          dark: s.dark,
          k: 1 - s.fall * 0.999,
          shore: 0,
        })
        if (s.done) return leave()
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] })
  }

  /* The line above the water says what the shore is doing, by the same clock. */
  function say() {
    const caption = document.querySelector('.ebb')
    if (caption) caption.textContent = saying(Date.now(), mine)
  }

  fit()
  paint(performance.now())
  wake()

  say()
  setInterval(() => {
    say()
    lines(performance.now())
  }, 60_000)

  return {
    /** Down from wherever the page is: through the middle of the water. */
    descend: () => go([canvas.width / 2, canvas.height * 0.3]),
  }
}

const el = document.querySelector<HTMLElement>('.mirror')
if (
  el &&
  !el.classList.contains('has-water') &&
  !el.classList.contains('no-water')
)
  mirror = setup(el)

/** Go down: what `>` and `?descend` do. Opens the game directly if the water is not there. */
export function descend(): void {
  if (mirror) mirror.descend()
  else openGame()
}
