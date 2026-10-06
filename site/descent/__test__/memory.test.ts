import { describe, expect, it } from 'bun:test'
import { newGame } from '../core/game'
import {
  describe as describeLine,
  endRun,
  LEDGER_SIZE,
  ledgerLine,
  loadBones,
  loadKnown,
  loadLedger,
  loadRun,
  type Store,
  saveRun,
  takeBones,
} from '../core/memory'

function memoryStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      data.set(k, v)
    },
    remove: (k) => {
      data.delete(k)
    },
  }
}

/** A store that refuses everything, like a private window. */
const refusing: Store = {
  get: () => {
    throw new Error('denied')
  },
  set: () => {
    throw new Error('denied')
  },
  remove: () => {
    throw new Error('denied')
  },
}

const DAY = new Date('2026-10-06T12:00:00Z')

function finished(ending: 'escaped' | 'dead' | 'unasked', cause: string) {
  const g = newGame({ name: 'Hild', bg: 'wrecker', seed: 1 })
  g.turn = 412
  g.player.deepest = 7
  g.known = ['picker']
  g.over = { ending, cause }
  return g
}

describe('the memory of the descent', () => {
  it('keeps a run and the names learned in it, and gives them back', () => {
    const store = memoryStore()
    const g = newGame({ name: 'Hild', bg: 'ashborn', seed: 4 })
    g.known = ['vial-grey']
    saveRun(store, g)
    expect(loadRun(store)?.player.name).toBe('Hild')
    expect(loadKnown(store)).toEqual(['vial-grey'])
  })

  it('writes a finished run into the ledger, newest first, and clears the run', () => {
    const store = memoryStore()
    saveRun(store, finished('dead', 'x'))
    endRun(store, finished('dead', 'killed by a Picker at depth 3'), DAY)
    const ledger = endRun(store, finished('escaped', 'came up'), DAY)
    expect(ledger).toHaveLength(2)
    expect(ledger[0]?.ending).toBe('escaped')
    expect(loadLedger(store)).toEqual(ledger)
    expect(loadRun(store)).toBeNull()
    expect(loadKnown(store)).toEqual(['picker'])
  })

  it('keeps no more than the ledger holds', () => {
    const store = memoryStore()
    for (let i = 0; i < LEDGER_SIZE + 5; i++) endRun(store, finished('dead', 'x'), DAY)
    expect(loadLedger(store)).toHaveLength(LEDGER_SIZE)
  })

  it('leaves one of the Unasked behind for the next run, to be met once', () => {
    const store = memoryStore()
    const g = finished('unasked', 'became one of the Unasked at depth 4')
    g.player.weapon = 'axe'
    endRun(store, g, DAY)
    expect(loadBones(store)).toEqual({ name: 'Hild', weapon: 'axe' })
    expect(takeBones(store)).toEqual({ name: 'Hild', weapon: 'axe' })
    expect(takeBones(store)).toBeNull()
  })

  it('writes a ledger line the way the ledger would', () => {
    const line = ledgerLine(finished('dead', 'killed by a Picker at depth 3'), DAY)
    expect(line).toEqual({
      name: 'Hild',
      bg: 'wrecker',
      title: 'Shingle-rat',
      depth: 7,
      turns: 412,
      ending: 'dead',
      cause: 'killed by a Picker at depth 3',
      date: '2026-10-06',
    })
    expect(describeLine(line)).toBe('Hild, Shingle-rat, held depth 7 for 412 turns, and was killed by a Picker.')
    expect(describeLine({ ...line, ending: 'escaped' })).toContain('came up through the roof with the ledger')
    expect(describeLine({ ...line, ending: 'unasked' })).toContain('became one of the Unasked')
    expect(describeLine({ ...line, cause: 'drowned at depth 2' })).toContain('and drowned.')
    const unfinished = newGame({ name: 'Hild', bg: 'ashborn', seed: 1 })
    expect(ledgerLine(unfinished, DAY).ending).toBe('dead')
  })

  it('reads nothing it does not recognise', () => {
    const store = memoryStore()
    store.set('descent.ledger', '{"not": "a ledger"}')
    store.set('descent.known', 'not json')
    store.set('descent.run', '[]')
    store.set('descent.bones', '7')
    expect(loadLedger(store)).toEqual([])
    expect(loadKnown(store)).toEqual([])
    expect(loadRun(store)).toBeNull()
    expect(loadBones(store)).toBeNull()
  })

  it('plays on without a memory when the store refuses', () => {
    const g = finished('unasked', 'x')
    expect(() => saveRun(refusing, g)).not.toThrow()
    expect(endRun(refusing, g, DAY)).toHaveLength(1)
    expect(loadRun(refusing)).toBeNull()
    expect(takeBones(refusing)).toBeNull()
    const half: Store = { ...memoryStore(), remove: refusing.remove }
    half.set('descent.bones', JSON.stringify({ name: 'Ulf', weapon: null }))
    expect(takeBones(half)?.name).toBe('Ulf')
  })
})
