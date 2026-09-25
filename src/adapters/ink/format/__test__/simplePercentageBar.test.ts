import { describe, expect, it } from 'bun:test'
import { renderSimplePercentageBar } from '../simplePercentageBar'

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

/** Strip ANSI colour so the bar's shape can be asserted on directly. */
const plain = (value: string) => value.replace(ANSI, '')

const FILLED = '█'
const EMPTY = '░'

describe('renderSimplePercentageBar', () => {
  it('fills the share of the bar the percentage asks for', () => {
    expect(plain(renderSimplePercentageBar(0, 10))).toBe(EMPTY.repeat(10))
    expect(plain(renderSimplePercentageBar(50, 10))).toBe(
      FILLED.repeat(5) + EMPTY.repeat(5),
    )
    expect(plain(renderSimplePercentageBar(100, 10))).toBe(FILLED.repeat(10))
  })

  it('always renders exactly the requested width', () => {
    for (const percent of [0, 1, 33.3, 50, 66.7, 99.9, 100]) {
      expect(plain(renderSimplePercentageBar(percent, 15))).toHaveLength(15)
    }
  })

  it('clamps percentages outside 0-100 instead of overflowing the bar', () => {
    expect(plain(renderSimplePercentageBar(150, 10))).toBe(FILLED.repeat(10))
    expect(plain(renderSimplePercentageBar(-40, 10))).toBe(EMPTY.repeat(10))
  })

  it('falls back to the default width when given a nonsensical one', () => {
    expect(plain(renderSimplePercentageBar(100, 0))).toHaveLength(15)
    expect(plain(renderSimplePercentageBar(100, -5))).toHaveLength(15)
    expect(plain(renderSimplePercentageBar(100, Number.NaN))).toHaveLength(15)
    expect(
      plain(renderSimplePercentageBar(100, Number.POSITIVE_INFINITY)),
    ).toHaveLength(15)
  })

  it('treats any non-finite percentage as zero rather than crashing', () => {
    // Infinity is not finite, so it falls back to 0 like NaN does -- it is not
    // clamped up to 100.
    expect(plain(renderSimplePercentageBar(Number.NaN, 10))).toBe(
      EMPTY.repeat(10),
    )
    expect(plain(renderSimplePercentageBar(Number.POSITIVE_INFINITY, 10))).toBe(
      EMPTY.repeat(10),
    )
    expect(plain(renderSimplePercentageBar(Number.NEGATIVE_INFINITY, 10))).toBe(
      EMPTY.repeat(10),
    )
  })

  it('renders the same shape whichever colour is asked for', () => {
    // picocolors emits no escape codes when stdout is not a terminal, as it is
    // not under the test runner, so only the shape can be asserted here.
    for (const color of ['green', 'cyan', 'blue'] as const) {
      expect(plain(renderSimplePercentageBar(50, 10, color))).toBe(
        FILLED.repeat(5) + EMPTY.repeat(5),
      )
    }
  })
})
