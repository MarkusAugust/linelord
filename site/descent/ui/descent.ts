/// <reference lib="dom" />
/**
 * <descent-run>: The Descent into Kell, on the demo page.
 *
 * Rocket carries everything that is state shown as text: the readouts, the
 * pack, the counter of a shop, the question being asked and the log, all as
 * templates over local signals. The map is drawn by hand into a <pre>, cell by
 * cell, because it is a picture rather than a document. The rules are in
 * `../core`, and this file only turns keys and taps into commands and a run
 * into something to look at.
 *
 * Rocket comes with the page: the page loads Datastar's Rocket bundle, and
 * this module imports the very same file, by the address the page used, so
 * there is one Datastar on the page and not two.
 */
import { BACKGROUNDS, ITEMS, MONSTERS, TIERS, tierOf } from '../core/content'
import { visible } from '../core/fov'
import {
  act,
  DIRS,
  GREY_LIMIT,
  inHand,
  itemName,
  lightRadius,
  monsterName,
  newGame,
  offerFor,
  offers,
  reveal,
  statsOf,
  verbOf,
  versus,
} from '../core/game'
import {
  HOLD_TITLES,
  standing,
  TIER_LIST,
  tribute,
  withTaken,
  wrackSaid,
} from '../core/holds'
import { at, elevation, index, SHOPS } from '../core/level'
import {
  describe,
  endRun,
  loadKnown,
  loadLedger,
  loadRun,
  loadWorld,
  type Store,
  saveRun,
  takeBones,
} from '../core/memory'
import { greyAt, phase, waterAt } from '../core/tide'
import type { Background, Command, Dir, Game } from '../core/types'
import { opening } from '../lore'

type Signals = Record<string, unknown>
type Handler = (ctx: unknown, ...args: unknown[]) => void

interface Setup {
  $$: Signals
  action: (name: string, fn: Handler) => void
  host: HTMLElement & { descent?: Self }
}

interface Rocket {
  rocket: (
    name: string,
    def: {
      mode: 'light'
      setup: (ctx: Setup) => void
      onFirstRender: (ctx: {
        refs: Record<string, HTMLElement>
        host: HTMLElement & { descent?: Self }
      }) => void
      render: (ctx: {
        html: (s: TemplateStringsArray, ...v: unknown[]) => unknown
      }) => unknown
    },
  ) => void
}

interface Self {
  game: Game | null
  map: HTMLElement | null
  draw: () => void
}

const datastar = document.querySelector<HTMLScriptElement>(
  'script[src*="datastar"]',
)?.src
if (!datastar)
  throw new Error('The descent needs the page to have loaded Datastar.')
const { rocket } = (await import(datastar)) as Rocket

if (!document.querySelector('link[data-descent]')) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('descent.css', import.meta.url).href
  link.dataset.descent = ''
  document.head.append(link)
}

/** The browser's storage, behind the port. Every call may throw; memory.ts catches. */
const store: Store = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'n',
  ArrowDown: 's',
  ArrowLeft: 'w',
  ArrowRight: 'e',
  k: 'n',
  j: 's',
  h: 'w',
  l: 'e',
  y: 'nw',
  u: 'ne',
  b: 'sw',
  n: 'se',
  Home: 'nw',
  PageUp: 'ne',
  End: 'sw',
  PageDown: 'se',
}

const PAD: Record<string, Dir | 'wait'> = {
  '7': 'nw',
  '8': 'n',
  '9': 'ne',
  '4': 'w',
  '5': 'wait',
  '6': 'e',
  '1': 'sw',
  '2': 's',
  '3': 'se',
}

const DIE = (d: number) => (d === 0 ? 'spent' : `d${d}`)

const ENDINGS = {
  escaped: 'You came up.',
  dead: 'You are dead.',
  unasked: 'You are one of the Unasked.',
} as const

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One cell of the map, as a glyph and a class. */
function cell(
  game: Game,
  lit: Set<number>,
  x: number,
  y: number,
): [string, string] {
  const level = game.level
  const i = index(level, x, y)
  const p = game.player
  const shown = lit.has(i)
  if (!shown && !level.seen[i]) return [' ', '']
  const tile = at(level, x, y)
  if (shown) {
    if (p.x === x && p.y === y) return ['@', 'd-you']
    const m = level.monsters.find((o) => o.hp > 0 && o.x === x && o.y === y)
    if (m)
      return [
        MONSTERS[m.kind]?.glyph ?? '?',
        m.peaceful
          ? 'd-calm'
          : MONSTERS[m.kind]?.holder
            ? 'd-holder'
            : m.bones || m.wrack
              ? 'd-bones'
              : 'd-foe',
      ]
    if (tile === 'S') return ['S', 'd-sarn']
  }
  const item = level.items.find((o) => o.x === x && o.y === y)
  const water = waterAt(level, game.tide, x, y)
  const grey = shown && greyAt(level, game.tide, x, y)
  const dim = shown ? '' : ' d-dim'
  const greyClass = grey ? ' d-grey' : ''
  if (item && (shown || item.item.kind === 'ledger'))
    return [
      item.item.kind === 'marks' ? '$' : (ITEMS[item.item.kind]?.glyph ?? '?'),
      `d-item${dim}${greyClass}`,
    ]
  if (tile === 'S') return ['.', `d-floor${dim}`]
  if (water >= 1 && tile !== '#')
    return ['~', `${water >= 2 ? 'd-deep' : 'd-water'}${dim}`]
  if (tile === '#') return ['#', `d-wall${dim}`]
  if (tile === '~') return ['~', 'd-sea']
  if (tile === '+' || tile === "'") return [tile, `d-door${dim}`]
  if (tile === '<' || tile === '>') return [tile, `d-stair${dim}`]
  if (tile === '^') return ['^', `d-roof${dim}${greyClass}`]
  if (tile === '&') return ['&', 'd-gorvek']
  if (tile === 'K' || tile === '_' || tile === 'O')
    return [tile, `d-hall${dim}`]
  if (/[1-7]/.test(tile)) return [tile, 'd-shop']
  const low = level.depth > 0 && elevation(level, x, y) <= 1 ? ' d-low' : ''
  return ['.', `d-floor${low}${dim}${greyClass}`]
}

/** The part of the floor that fits, kept round the player. */
function drawMap(target: HTMLElement, game: Game): void {
  const level = game.level
  const p = game.player
  const lit =
    level.depth === 0
      ? new Set(level.seen.map((_, i) => i))
      : visible(level, p, lightRadius(game))
  const probe = target.dataset.cols ? Number(target.dataset.cols) : level.w
  const cols = Math.min(level.w, probe)
  const rows = Math.min(level.h, 21)
  const left = Math.max(0, Math.min(level.w - cols, p.x - Math.floor(cols / 2)))
  const top = Math.max(0, Math.min(level.h - rows, p.y - Math.floor(rows / 2)))
  const out: string[] = []
  for (let y = top; y < top + rows; y++) {
    let row = ''
    for (let x = left; x < left + cols; x++) {
      const [glyph, cls] = cell(game, lit, x, y)
      row += cls ? `<span class="${cls}">${escapeHtml(glyph)}</span>` : glyph
    }
    out.push(row)
  }
  target.innerHTML = out.join('\n')
}

/** How many map columns fit the box, measured with the font the box uses. */
function fit(target: HTMLElement): void {
  if (
    target.clientWidth === 0 ||
    String(target.clientWidth) === target.dataset.width
  )
    return
  target.dataset.width = String(target.clientWidth)
  const probe = document.createElement('span')
  probe.textContent = 'MMMMMMMMMM'
  target.append(probe)
  const width = probe.getBoundingClientRect().width / 10
  probe.remove()
  const box = target.clientWidth
  target.dataset.cols = String(
    width > 0 && box > 0 ? Math.max(15, Math.floor(box / width)) : 56,
  )
}

rocket('descent-run', {
  mode: 'light',

  setup: ({ $$, action, host }) => {
    const self: Self = { game: null, map: null, draw: () => {} }
    host.descent = self
    let pending: 'name' | 'use' | 'drop' | null = null

    const say = (lines: string[]) => {
      if (lines.length === 0) return
      $$.log = [...(($$.log as string[]) ?? []), ...lines].slice(-8)
      $$.said = lines.join(' ')
    }

    const sync = () => {
      const g = self.game
      if (!g) return
      const p = g.player
      $$.hp = `${p.hp} of ${p.maxHp}`
      $$.hurt = p.hp * 3 < p.maxHp
      $$.will = p.will
      $$.grey = `${'●'.repeat(p.grey)}${'○'.repeat(Math.max(0, GREY_LIMIT - p.grey))}`
      $$.marks = p.marks
      $$.dice = `Lamp ${DIE(g.player.pack.some((i) => i.kind === 'sarn-lamp') ? 8 : p.lamp)} · Water ${DIE(p.water)} · Rope ${DIE(p.rope)}`
      $$.where =
        g.depth === 0
          ? 'Wrackhead'
          : `${TIERS[tierOf(g.depth)].name}, depth ${g.depth}`
      const held = g.world ? withTaken(g.world, g.taken ?? [], p.name) : null
      const titles = held
        ? TIER_LIST.filter((t) => held.holds[t].holder === 'you').map(
            (t) => HOLD_TITLES[t],
          )
        : []
      $$.title = [
        `${p.name} the ${BACKGROUNDS[p.bg].name}, level ${p.level}`,
        ...titles,
      ].join(', ')
      const ph = phase(g.tide)
      $$.tide =
        g.held > 0
          ? 'Held still'
          : {
              low: 'Low water',
              turning: 'The flood is turning',
              flood: 'Flood',
              ebb: 'Going out',
            }[ph]
      $$.wet = ph === 'flood' || ph === 'turning'
      $$.meaning = p.meaning
      $$.pending = pending ?? ''
      $$.pack = p.pack.map((item) => {
        const stats = statsOf(g, item)
        return {
          name: itemName(g, item),
          verb: verbOf(item),
          stats: stats ? `${stats} · ${versus(g, item)}` : '',
        }
      })
      $$.picking =
        pending === 'use'
          ? 'Press the letter of what to use. Esc to cancel.'
          : pending === 'drop'
            ? 'Press the letter of what to drop. Esc to cancel.'
            : ''
      const gear = inHand(g)
      $$.weapon = gear.weapon
        ? `${itemName(g, gear.weapon)} · ${statsOf(g, gear.weapon)}`
        : 'bare hands · 1d2, +0 to hit'
      $$.armour = gear.armour
        ? `${itemName(g, gear.armour)} · ${statsOf(g, gear.armour)}`
        : 'nothing · armour 0'
      $$.prompt = g.prompt
        ? g.prompt.kind === 'tithe'
          ? 'Pay a tenth?'
          : 'Take what Sarn offers?'
        : ''
      const shop = Object.values(SHOPS).find((s) => s.id === g.shop)
      $$.shop = shop?.name ?? ''
      $$.offers = offers(g).map((o) => ({
        key: o.key,
        label: o.label,
        price:
          o.price > 0
            ? `${o.price} marks`
            : o.price < 0
              ? `+${-o.price} marks`
              : '',
        enabled: o.enabled,
        hotkey: o.hotkey,
        detail: o.detail ?? '',
      }))
      const near = g.level.monsters
        .filter(
          (m) =>
            m.hp > 0 && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 1,
        )
        .map((m) => monsterName(g, m))
      $$.legend =
        g.depth === 0
          ? `${Object.entries(SHOPS)
              .map(([d, shop]) => `${d} ${shop.name}`)
              .join(' · ')} · > the Quaysteps`
          : ''
      $$.near = near.length ? `Next to you: ${near.join(', ')}.` : ''
      if (self.map) {
        fit(self.map)
        drawMap(self.map, g)
      }
    }
    self.draw = sync

    const finish = (g: Game, last: string[]) => {
      $$.last = last.slice(-2)
      const { ledger, news } = endRun(store, g, new Date())
      $$.news = news
      $$.standing = standing(loadWorld(store))
      $$.wrack = wrackSaid(loadWorld(store))
      $$.ending = ENDINGS[g.over?.ending ?? 'dead']
      $$.cause = describe(
        ledger[0] ?? {
          name: '',
          bg: '',
          title: '',
          depth: 0,
          turns: 0,
          ending: 'dead',
          cause: '',
          date: '',
        },
      )
      $$.ledger = ledger.map(describe)
      $$.phase = 'over'
    }

    const play = (cmd: Command) => {
      const g = self.game
      if (!g || g.over) return
      const out = act(g, cmd)
      self.game = out.game
      say(out.lines)
      sync()
      if (out.game.over) finish(out.game, out.lines)
      else saveRun(store, out.game)
    }

    const begin = (g: Game, lines: string[]) => {
      reveal(g)
      self.game = g
      $$.log = []
      say(lines)
      $$.phase = 'play'
      sync()
      setTimeout(() => self.map?.parentElement?.focus(), 0)
    }

    $$.phase = 'title'
    $$.opening = [...opening]
    $$.hasRun = loadRun(store) !== null
    $$.ledger = loadLedger(store).map(describe)
    $$.standing = standing(loadWorld(store))
    $$.wrack = wrackSaid(loadWorld(store))
    $$.news = []
    $$.log = []
    $$.said = ''
    $$.backgrounds = (Object.keys(BACKGROUNDS) as Background[]).map((id) => ({
      id,
      name: BACKGROUNDS[id].name,
      what: BACKGROUNDS[id].what,
    }))
    for (const k of [
      'hp',
      'will',
      'grey',
      'marks',
      'dice',
      'where',
      'title',
      'tide',
      'prompt',
      'shop',
      'near',
      'weapon',
      'armour',
      'ending',
      'cause',
      'pending',
    ])
      $$[k] = ''
    $$.legend = ''
    $$.picking = ''
    $$.last = []
    $$.pack = []
    $$.offers = []
    $$.hurt = false
    $$.wet = false
    $$.meaning = false

    action('newRun', () => {
      $$.phase = 'make'
    })
    action('ledgerView', () => {
      $$.ledger = loadLedger(store).map(describe)
      $$.standing = standing(loadWorld(store))
      $$.wrack = wrackSaid(loadWorld(store))
      $$.phase = 'ledger'
    })
    action('back', () => {
      $$.hasRun = loadRun(store) !== null
      $$.phase = 'title'
    })
    action('resume', () => {
      const g = loadRun(store)
      if (g) begin(g, ['You come back to where you were.'])
    })
    action('start', (_, bg) => {
      const world = loadWorld(store)
      const paid = tribute(world)
      const g = newGame({
        name:
          host.querySelector<HTMLInputElement>('.descent__input')?.value ?? '',
        bg: bg as Background,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        known: loadKnown(store),
        bones: takeBones(store),
        world,
      })
      begin(g, [
        'The shingle at Wrackhead. The steps go down into the sea at the far end, where the water has gone out.',
        ...(paid > 0 ? [`What you hold in Kell pays you ${paid} marks.`] : []),
      ])
    })
    action('move', (_, dir) => {
      if (dir === 'wait') return play({ type: 'wait' })
      if (pending === 'name') {
        pending = null
        return play({ type: 'name', dir: dir as Dir })
      }
      play({ type: 'move', dir: dir as Dir })
    })
    action('cmd', (_, type) => {
      if (type === 'name') {
        pending = pending === 'name' ? null : 'name'
        sync()
        say([pending ? 'Name what? Choose a direction.' : 'Never mind.'])
        return
      }
      play({ type } as Command)
    })
    action('use', (_, i) => play({ type: 'use', index: Number(i) }))
    action('drop', (_, i) => play({ type: 'drop', index: Number(i) }))
    action('answer', (_, yes) => play({ type: 'answer', yes: Boolean(yes) }))
    action('buy', (_, key) => play({ type: 'shop', key: String(key) }))
    action('leave', () => play({ type: 'leave' }))
    action('close', () => host.closest('dialog')?.close())

    action('key', (_, raw) => {
      const evt = raw as KeyboardEvent
      if (!host.closest('dialog')?.open || $$.phase !== 'play' || !self.game)
        return
      if (evt.target instanceof HTMLInputElement) return
      const g = self.game
      const key = evt.key
      const letter = /^[a-l]$/.test(key) ? key.charCodeAt(0) - 97 : -1
      if (pending === 'use' || pending === 'drop') {
        const kind = pending
        pending = null
        evt.preventDefault()
        if (letter >= 0) play({ type: kind, index: letter })
        else sync()
        return
      }
      if (g.prompt) {
        if (key === 'y' || key === 'n') {
          evt.preventDefault()
          play({ type: 'answer', yes: key === 'y' })
        }
        return
      }
      if (g.shop) {
        // In a shop the keys are the counter's: a number for what the place
        // has, the pack's letter for what you carry. The arrows still walk out.
        const offer = offerFor(g, key)
        if (offer) {
          evt.preventDefault()
          play({ type: 'shop', key: offer.key })
          return
        }
        if (key === 'Escape') {
          evt.preventDefault()
          play({ type: 'leave' })
          return
        }
      }
      const dir =
        KEYS[key] ?? (evt.location === 3 || !g.shop ? PAD[key] : undefined)
      if (dir) {
        evt.preventDefault()
        if (dir === 'wait') return play({ type: 'wait' })
        if (pending === 'name') {
          pending = null
          return play({ type: 'name', dir })
        }
        return play({ type: 'move', dir })
      }
      const simple: Record<string, Command> = {
        '>': { type: 'stairs' },
        '<': { type: 'stairs' },
        g: { type: 'get' },
        ',': { type: 'get' },
        '.': { type: 'wait' },
        m: { type: 'mean' },
        s: { type: 'stop' },
        r: { type: 'rope' },
      }
      const cmd = simple[key]
      if (cmd) {
        evt.preventDefault()
        return play(cmd)
      }
      if (key === 'N' || key === 'x') {
        evt.preventDefault()
        pending = 'name'
        say(['Name what? Choose a direction.'])
        return sync()
      }
      if (key === 'e' || key === 'd') {
        evt.preventDefault()
        if (g.player.pack.length === 0) {
          say(['You carry nothing.'])
          return
        }
        pending = key === 'e' ? 'use' : 'drop'
        return sync()
      }
      if (key === 'Escape' && pending) {
        evt.preventDefault()
        pending = null
        sync()
      }
    })
  },

  onFirstRender: ({ refs, host }) => {
    const self = host.descent
    if (!self) return
    self.map = refs.map ?? null
    const refit = () => {
      if (!self.map) return
      fit(self.map)
      self.draw()
    }
    refit()
    new ResizeObserver(refit).observe(refs.board ?? host)
    /* Tapping the map takes one step toward wherever you tapped. A cell on a
       phone is too small to aim at, so the whole map is the control. */
    refs.board?.addEventListener('click', (evt) => {
      const g = self.game
      const map = self.map
      if (!g || !map || g.over) return
      const r = map.getBoundingClientRect()
      const cols = Number(map.dataset.cols ?? g.level.w)
      const shownCols = Math.min(g.level.w, cols)
      const shownRows = Math.min(g.level.h, 21)
      const fx = (evt.clientX - r.left) / r.width - 0.5
      const fy = (evt.clientY - r.top) / r.height - 0.5
      const px =
        (g.player.x -
          Math.max(
            0,
            Math.min(
              g.level.w - shownCols,
              g.player.x - Math.floor(shownCols / 2),
            ),
          ) +
          0.5) /
          shownCols -
        0.5
      const py =
        (g.player.y -
          Math.max(
            0,
            Math.min(
              g.level.h - shownRows,
              g.player.y - Math.floor(shownRows / 2),
            ),
          ) +
          0.5) /
          shownRows -
        0.5
      const dx = (fx - px) * shownCols
      const dy = (fy - py) * shownRows
      if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) return
      const sx = Math.abs(dx) > Math.abs(dy) / 2 ? Math.sign(dx) : 0
      const sy = Math.abs(dy) > Math.abs(dx) / 2 ? Math.sign(dy) : 0
      const dir = (Object.entries(DIRS) as [Dir, [number, number]][]).find(
        ([, [x, y]]) => x === sx && y === sy,
      )?.[0]
      if (dir)
        host.querySelector<HTMLButtonElement>(`[data-dir="${dir}"]`)?.click()
    })
  },

  render: ({ html }) => html`
    <div class="descent" data-on:keydown__window="@key(evt)">
      <header class="descent__bar">
        <h2 class="descent__title">The Descent into Kell</h2>
        <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@close()">Close</button>
      </header>

      <section class="descent__intro" data-show="$$phase === 'title'">
        <blockquote class="descent__sarn">
          <template data-for="line in $$opening"><p data-text="line"></p></template>
          <footer>Sarn the Faceless</footer>
        </blockquote>
        <div class="descent__row">
          <button class="descent__btn" type="button" data-on:click="@newRun()">Go down</button>
          <button class="descent__btn" type="button" data-show="$$hasRun" data-on:click="@resume()">Continue</button>
          <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@ledgerView()">The ledger</button>
        </div>
        <p class="descent__note">
          A roguelike in drowned Kell. Ten floors under Wrackhead, a tide that floods the low ground and a
          grey that rises when it goes out. Each depth has a holder; beat one and the hold is yours, until
          someone takes it back. Death is the end of a run, and the ledger keeps every one. Kept in this
          browser only.
        </p>
      </section>

      <section class="descent__make" data-show="$$phase === 'make'">
        <label class="descent__label">Your name
          <input class="descent__input" type="text" maxlength="20" autocomplete="off" placeholder="Nameless" />
        </label>
        <p class="descent__label">Where you come from</p>
        <ul class="descent__choices">
          <template data-for="b in $$backgrounds">
            <li>
              <button class="descent__choice" type="button" data-on:click="@start(b.id)">
                <strong data-text="b.name"></strong>
                <span data-text="b.what"></span>
              </button>
            </li>
          </template>
        </ul>
        <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@back()">Back</button>
      </section>

      <section class="descent__play" data-show="$$phase === 'play'">
        <div class="descent__main">
        <div class="descent__board" data-ref:board tabindex="0" role="application" aria-label="The map. Arrow keys or the number pad move you; see the keys below.">
          <pre class="descent__map" data-ref:map aria-hidden="true"></pre>
        </div>
        <p class="descent__legend" data-show="$$legend !== ''" data-text="$$legend"></p>


        <ol class="descent__log" aria-live="polite">
          <template data-for="line in $$log"><li data-text="line"></li></template>
        </ol>
        <p class="descent__near" data-text="$$near"></p>

        <div class="descent__ask" data-show="$$prompt !== ''">
          <p data-text="$$prompt"></p>
          <button class="descent__btn" type="button" data-on:click="@answer(true)">Yes <kbd>y</kbd></button>
          <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@answer(false)">No <kbd>n</kbd></button>
        </div>

        <div class="descent__shop" data-show="$$shop !== ''">
          <h3 data-text="$$shop"></h3>
          <ol class="descent__offers">
            <template data-for="o, i in $$offers">
              <li>
                <button class="descent__offer" type="button" data-attr:disabled="!o.enabled" data-on:click="@buy(o.key)">
                  <kbd data-text="o.hotkey"></kbd> <span data-text="o.label"></span> <span class="descent__price" data-text="o.price"></span>
                  <span class="descent__detail" data-show="o.detail !== ''" data-text="o.detail"></span>
                </button>
              </li>
            </template>
          </ol>
          <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@leave()">Leave <kbd>Esc</kbd></button>
        </div>

        <details class="descent__keys" open>
          <summary>Keys and map</summary>
          <dl class="descent__keylist">
            <dt>Move</dt><dd><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>h</kbd><kbd>j</kbd><kbd>k</kbd><kbd>l</kbd>, diagonals <kbd>y</kbd><kbd>u</kbd><kbd>b</kbd><kbd>n</kbd> or the number pad</dd>
            <dt>Wait</dt><dd><kbd>.</kbd> or <kbd>5</kbd></dd>
            <dt>Stairs</dt><dd><kbd>&gt;</kbd> on a stair, up or down</dd>
            <dt>Take</dt><dd><kbd>g</kbd> what lies here</dd>
            <dt>Use</dt><dd><kbd>e</kbd> then the letter: wield, wear, drink, read</dd>
            <dt>Drop</dt><dd><kbd>d</kbd> then the letter</dd>
            <dt>Mean it</dt><dd><kbd>m</kbd> the next blow rolls twice, for a grey mark and a point of will</dd>
            <dt>Name</dt><dd><kbd>x</kbd> then a direction, for 2 will (a Novice pays 1)</dd>
            <dt>Stop</dt><dd><kbd>s</kbd> holds the flood for 15 turns, for 3 will</dd>
            <dt>Rope</dt><dd><kbd>r</kbd> climbs to the floor above</dd>
            <dt>Shop</dt><dd>the key on the counter: a number for what is sold, the pack's letter for what you carry; <kbd>Esc</kbd> leaves</dd>
            <dt>Cancel</dt><dd><kbd>Esc</kbd></dd>
          </dl>
          <dl class="descent__keylist descent__maplist">
            <dt><span class="d-you">@</span></dt><dd>you</dd>
            <dt><span class="d-stair">&lt; &gt;</span></dt><dd>stairs up and down</dd>
            <dt><span class="d-foe">p c u n d</span></dt><dd>something that wants you</dd>
            <dt><span class="d-holder">H G S C</span></dt><dd>a holder: Hollin, Grue, Sethra, Corve</dd>
            <dt><span class="d-bones">w</span></dt><dd>your wrack, holding what it carried</dd>
            <dt><span class="d-item">$ ! ) [ * ?</span></dt><dd>marks and things to take</dd>
            <dt><span class="d-low">.</span></dt><dd>low ground, which floods first</dd>
            <dt><span class="d-water">~</span> <span class="d-deep">~</span></dt><dd>water, and water over your head</dd>
            <dt><span class="d-grey">.</span></dt><dd>the grey</dd>
          </dl>
        </details>
        </div>

        <div class="descent__side">
        <dl class="descent__stats">
          <div class="descent__wide"><dt>Where</dt><dd data-text="$$where"></dd></div>
          <div><dt>Tide</dt><dd data-text="$$tide" data-class:is-hot="$$wet"></dd></div>
          <div><dt>Health</dt><dd data-text="$$hp" data-class:is-hot="$$hurt"></dd></div>
          <div><dt>Will</dt><dd data-text="$$will"></dd></div>
          <div><dt>Grey</dt><dd data-text="$$grey"></dd></div>
          <div><dt>Marks</dt><dd data-text="$$marks"></dd></div>
          <div class="descent__wide"><dt>Kit</dt><dd data-text="$$dice"></dd></div>
          <div class="descent__wide"><dt>Who</dt><dd data-text="$$title"></dd></div>
        </dl>
        <div class="descent__controls">
          <div class="descent__pad" role="group" aria-label="Move">
            <button type="button" data-dir="nw" data-on:click="@move('nw')" aria-label="North-west">↖</button>
            <button type="button" data-dir="n" data-on:click="@move('n')" aria-label="North">↑</button>
            <button type="button" data-dir="ne" data-on:click="@move('ne')" aria-label="North-east">↗</button>
            <button type="button" data-dir="w" data-on:click="@move('w')" aria-label="West">←</button>
            <button type="button" data-on:click="@move('wait')" aria-label="Wait a turn">·</button>
            <button type="button" data-dir="e" data-on:click="@move('e')" aria-label="East">→</button>
            <button type="button" data-dir="sw" data-on:click="@move('sw')" aria-label="South-west">↙</button>
            <button type="button" data-dir="s" data-on:click="@move('s')" aria-label="South">↓</button>
            <button type="button" data-dir="se" data-on:click="@move('se')" aria-label="South-east">↘</button>
          </div>
          <div class="descent__acts">
            <button class="descent__btn" type="button" data-on:click="@cmd('get')">Take <kbd>g</kbd></button>
            <button class="descent__btn" type="button" data-on:click="@cmd('stairs')">Stairs <kbd>&gt;</kbd></button>
            <button class="descent__btn" type="button" data-class:is-on="$$meaning" data-on:click="@cmd('mean')">Mean it <kbd>m</kbd></button>
            <button class="descent__btn" type="button" data-class:is-on="$$pending === 'name'" data-on:click="@cmd('name')">Name <kbd>x</kbd></button>
            <button class="descent__btn" type="button" data-on:click="@cmd('stop')">Stop <kbd>s</kbd></button>
            <button class="descent__btn" type="button" data-on:click="@cmd('rope')">Rope up <kbd>r</kbd></button>
          </div>
        </div>

        <section class="descent__pack">
          <h3>Carried <kbd>e</kbd> use · <kbd>d</kbd> drop</h3>
          <dl class="descent__worn">
            <dt>In hand</dt><dd data-text="$$weapon"></dd>
            <dt>Worn</dt><dd data-text="$$armour"></dd>
          </dl>
          <p class="descent__note">Wield or wear something from the pack and what you had goes back into it. Kell's iron never wears, and is a little weaker; new iron wears, and Barr mends it.</p>
          <p class="descent__picking" data-show="$$picking !== ''" data-text="$$picking"></p>
          <ol class="descent__items" data-class:is-picking="$$picking !== ''">
            <template data-for="item, i in $$pack">
              <li>
                <kbd data-text="String.fromCharCode(97 + i)"></kbd>
                <span>
                  <span data-text="item.name"></span>
                  <span class="descent__detail" data-show="item.stats !== ''" data-text="item.stats"></span>
                </span>
                <button class="descent__mini" type="button" data-on:click="@use(i)" data-text="item.verb"></button>
                <button class="descent__mini" type="button" data-on:click="@drop(i)">Drop</button>
              </li>
            </template>
          </ol>
        </section>

        </div>
        <p class="descent__sr" aria-live="assertive" data-text="$$said"></p>
      </section>

      <section class="descent__over" data-show="$$phase === 'over'">
        <blockquote class="descent__sarn">
          <template data-for="line in $$last"><p data-text="line"></p></template>
        </blockquote>
        <h3 class="descent__ending" data-text="$$ending"></h3>
        <p data-text="$$cause"></p>
        <template data-for="line in $$news"><p class="descent__news" data-text="line"></p></template>
        <div class="descent__row">
          <button class="descent__btn" type="button" data-on:click="@newRun()">Go down again</button>
          <button class="descent__btn descent__btn--quiet" type="button" data-on:click="@ledgerView()">The ledger</button>
        </div>
      </section>

      <section class="descent__ledger" data-show="$$phase === 'ledger' || $$phase === 'over'">
        <h3>The ledger</h3>
        <p class="descent__note">Who holds Kell, and for how long. It counts ground and low waters. It is not a measure of worth.</p>
        <ul class="descent__lines descent__standing">
          <template data-for="line in $$standing"><li data-text="line"></li></template>
        </ul>
        <h4 data-show="$$wrack.length > 0">Your wrack</h4>
        <ul class="descent__lines" data-show="$$wrack.length > 0">
          <template data-for="line in $$wrack"><li data-text="line"></li></template>
        </ul>
        <h4>The runs</h4>
        <ol class="descent__lines">
          <template data-for="line in $$ledger"><li data-text="line"></li></template>
        </ol>
        <p class="descent__note" data-show="$$ledger.length === 0">Nobody has gone down yet.</p>
        <button class="descent__btn descent__btn--quiet" type="button" data-show="$$phase === 'ledger'" data-on:click="@back()">Back</button>
      </section>
    </div>
  `,
})
