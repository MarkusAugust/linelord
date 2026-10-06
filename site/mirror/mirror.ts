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
import { MONSTERS } from '../descent/core/content'
import { generate } from '../descent/core/level'
import { makeRng } from '../descent/core/rng'
import {
  DIVE_MS,
  dive,
  FRAGMENT,
  HOLD_MS,
  hold,
  live,
  MAX_RIPPLES,
  type Ripple,
  ripple,
  SURFACE_MS,
  surface,
  tide,
  VERTEX,
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
}

interface Water {
  draw: (f: Frame) => void
  textures: (reflect: HTMLCanvasElement, kell: HTMLCanvasElement) => void
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
  const reflectTex = sheet(0, 'u_reflect')
  const kellTex = sheet(1, 'u_kell')
  let textured = 0
  const isLight = light()
  return {
    textures: (reflect, kell) => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, reflectTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        reflect,
      )
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, kellTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, kell)
      textured = 1
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
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
  }
}

/* The water is soft; it is drawn at less than the screen's density, which a
   phone's GPU will thank us for. */
const scale = () => Math.min(window.devicePixelRatio || 1, 1.5) * 0.7

/** The name as the water shows it: upside down, under the line, faint. */
function reflectSheet(w: number, h: number, line: number): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = w
  sheet.height = h
  const ctx = sheet.getContext('2d')
  const heading = document.querySelector('h1')
  if (!ctx || !heading) return sheet
  const style = getComputedStyle(heading)
  const size = Math.min(
    Number.parseFloat(style.fontSize) * scale() * 1.4,
    h * 0.3,
  )
  ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.12}px`
  ctx.fillStyle = style.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.save()
  ctx.translate(w / 2, h - line * 0.55 + size * 0.15)
  ctx.scale(1, -1)
  ctx.fillText('LINELORD', 0, -size * 1.05)
  ctx.restore()
  return sheet
}

const TILE: Record<string, string> = {
  '#': '#6e655a',
  '.': '#4f493f',
  '<': '#f0e6d0',
  '>': '#f0e6d0',
  '+': '#a7794a',
}

/** Drowned Kell as the game draws it: a floor of the Quaysteps, in its own colours. */
function kellSheet(w: number, h: number): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = w
  sheet.height = h
  const ctx = sheet.getContext('2d')
  if (!ctx) return sheet
  const cell = Math.max(8, Math.round(14 * scale()))
  ctx.font = `${cell}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
  ctx.textBaseline = 'top'
  let n = 1
  const floor = generate(1, makeRng(0x4b454c4c), () => n++)
  const across = cell * 0.62
  for (let oy = 0; oy * cell < h; oy += floor.h) {
    for (let ox = 0; ox * across < w; ox += floor.w) {
      floor.tiles.forEach((row, y) => {
        ;[...row].forEach((t, x) => {
          const m = floor.monsters.find((o) => o.x === x && o.y === y)
          const glyph = m ? (MONSTERS[m.kind]?.glyph ?? t) : t
          ctx.fillStyle = m ? '#d8664d' : (TILE[t] ?? '#4f493f')
          ctx.fillText(glyph, (ox + x) * across, (oy + y) * cell)
        })
      })
    }
  }
  return sheet
}

function openGame(): void {
  import(new URL('descent.js', document.baseURI).href)
  const dialog = document.getElementById('descent')
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches

let mirror: ReturnType<typeof setup> | null = null

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

  const fit = () => {
    const box = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width * scale()))
    canvas.height = Math.max(1, Math.round(box.height * scale()))
    if (!surfaceGl) return
    const line = waterline(canvas.height, tide(Date.now()))
    surfaceGl.textures(
      reflectSheet(canvas.width, canvas.height, line),
      kellSheet(canvas.width, canvas.height),
    )
  }

  const dialog = document.getElementById('descent')
  const playing = () => dialog instanceof HTMLDialogElement && dialog.open

  const paint = (now: number) => {
    if (!surfaceGl) return
    rings = live(rings, now)
    const h = hold(since, now)
    surfaceGl.draw({
      t: still ? 0 : now / 1000,
      surface: waterline(canvas.height, tide(Date.now())),
      feather: canvas.height * 0.45,
      ripples: still ? [] : rings,
      now,
      holdAt: at,
      hold: still ? 0 : h,
      dark: 0,
      k: 1,
    })
    bar.style.transform = `scaleX(${h})`
    if (h >= 1 && since !== null) {
      since = null
      go(at)
    }
  }

  const frame = (now: number) => {
    const busy = since !== null || rings.length > 0
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
  const showHint = (evt: { clientX: number; clientY: number }) => {
    if (hinted) return
    hinted = true
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
  el.addEventListener('pointermove', (evt) => {
    const now = performance.now()
    if (since !== null) at = local(evt)
    else if (now - lastMove > 280) {
      lastMove = now
      const [x, y] = local(evt)
      touch(x, y, 0.35)
    }
  })
  el.addEventListener('pointerdown', (evt) => {
    const point = local(evt)
    touch(point[0], point[1], 1)
    showHint(evt)
    press(point)
  })
  for (const name of ['pointerup', 'pointerleave', 'pointercancel'])
    el.addEventListener(name, release)
  el.addEventListener('contextmenu', (evt) => evt.preventDefault())
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
        })
        if (s.done) return leave()
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] })
  }

  fit()
  paint(performance.now())
  wake()

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
