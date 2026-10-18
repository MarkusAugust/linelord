import { describe, expect, it } from 'bun:test'
import { report, spread, weigh } from '../bot/balance'
import { choose, playRun, wayTo } from '../bot/bot'
import { act, newGame } from '../core/game'
import type { Game } from '../core/types'
import { gameOn, put } from './helpers'

/** Let the bot play until `until` holds, or give up. */
function play(game: Game, until: (g: Game) => boolean, limit = 400): Game {
  let g = game
  for (let i = 0; i < limit && !until(g) && !g.over; i++)
    g = act(g, choose(g)).game
  return g
}

describe('the bot', () => {
  it('finds the first step of the way round a wall, and says when there is none', () => {
    const g = gameOn(['#######', '#@#...#', '#...#.#', '#######'], 1)
    expect(wayTo(g, (x, y) => x === 3 && y === 1)).toBe('se')
    expect(wayTo(g, (x, y) => x === 9 && y === 9)).toBeNull()
  })

  it('pays the order and refuses Sarn', () => {
    const g = gameOn(['#####', '#@..#', '#####'], 1)
    g.prompt = { kind: 'tithe', monster: 1 }
    expect(choose(g)).toEqual({ type: 'answer', yes: true })
    g.prompt = { kind: 'gift', gift: 'purse' }
    expect(choose(g)).toEqual({ type: 'answer', yes: false })
  })

  it('buys salt on the shingle before it goes down', () => {
    const g = play(
      newGame({ name: 'Bot', bg: 'ashborn', seed: 1 }),
      (x) => x.depth === 1,
    )
    expect(g.depth).toBe(1)
    expect(g.player.pack.filter((i) => i.kind === 'salt').length).toBe(4)
  })

  it('takes up better iron, fights what stands next to it, and washes when it bleeds', () => {
    const g = gameOn(['#########', '#<.@...>#', '#########'], 1)
    g.player.pack.push({ kind: 'axe', old: true })
    expect(choose(g)).toEqual({ type: 'use', index: 2 })
    g.player.pack.pop()
    put(g, 'picker', 4, 1)
    expect(choose(g)).toEqual({ type: 'move', dir: 'e' })
    g.player.hp = 2
    expect(choose(g)).toEqual({ type: 'use', index: 0 })
  })

  it('hits what has hold of it, and rests when nothing is near', () => {
    const g = gameOn(['#########', '#<.@...>#', '#########'], 3)
    const m = put(g, 'drawn', 2, 1)
    g.player.held = m.id
    expect(choose(g)).toEqual({ type: 'move', dir: 'w' })
    g.player.held = null
    m.hp = 0
    g.player.hp = g.player.maxHp - 3
    expect(choose(g)).toEqual({ type: 'wait' })
  })

  it('goes back up when the salt is gone and the blood is low', () => {
    const g = gameOn(['#########', '#<..@..>#', '#########'], 2)
    g.player.pack = []
    g.player.hp = 3
    put(g, 'picker', 7, 1).awake = true
    expect(choose(g)).toEqual({ type: 'move', dir: 'w' })
  })

  it('carries the ledger to the roof, and waits there for low water', () => {
    const g = gameOn(['#######', '#<.@.^#', '#######'], 10)
    g.player.pack.push({ kind: 'ledger' })
    expect(choose(g)).toEqual({ type: 'move', dir: 'e' })
    g.player.x = 5
    expect(choose(g)).toEqual({ type: 'wait' })
  })

  it('plays a whole run the same way twice', () => {
    const one = playRun('wrecker', 3)
    expect(playRun('wrecker', 3)).toEqual(one)
    expect(one.deepest).toBeGreaterThan(0)
    expect(one.cause).not.toMatch(/depth \d/)
  })

  it('says it is stuck when it runs out of turns', () => {
    expect(playRun('novice', 1, 5)).toMatchObject({
      ending: 'stuck',
      cause: 'stuck',
    })
  })
})

describe('weighing the descent', () => {
  it('counts the runs that reached each depth, and what ended them', () => {
    const s = spread('ashborn', [
      {
        bg: 'ashborn',
        seed: 1,
        ending: 'dead',
        cause: 'drowned',
        deepest: 3,
        turns: 10,
        level: 2,
      },
      {
        bg: 'ashborn',
        seed: 2,
        ending: 'dead',
        cause: 'drowned',
        deepest: 1,
        turns: 30,
        level: 1,
      },
      {
        bg: 'ashborn',
        seed: 3,
        ending: 'escaped',
        cause: 'came up through the roof',
        deepest: 10,
        turns: 20,
        level: 9,
      },
    ])
    expect(s.reached.slice(0, 5)).toEqual([3, 3, 2, 2, 1])
    expect(s.escaped).toBe(1)
    expect(s.causes[0]).toEqual(['drowned', 2])
    expect(s.medianTurns).toBe(20)
  })

  it('prints a row for each background and the causes under it', () => {
    const text = report(weigh(1, ['novice']))
    expect(text).toContain('reached')
    expect(text).toMatch(/^Novice +100%/m)
    expect(text).toContain('Novice, 1 runs')
  })
})
