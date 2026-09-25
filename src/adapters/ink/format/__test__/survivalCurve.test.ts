import { describe, expect, it } from 'bun:test'
import type { SurvivalPoint } from '../../../../core/survival'
import { curveSpanDays, renderSurvivalCurve } from '../survivalCurve'

const point = (ageDays: number, fractionAlive: number): SurvivalPoint => ({
  ageDays,
  fractionAlive,
})

describe('renderSurvivalCurve', () => {
  it('draws a full block for all of it and a space for none', () => {
    expect(renderSurvivalCurve([point(0, 1), point(30, 0)])).toBe('█ ')
  })

  it('falls as the curve does', () => {
    const drawn = renderSurvivalCurve([
      point(0, 1),
      point(30, 0.6),
      point(60, 0.2),
    ])

    expect(drawn).toHaveLength(3)
    expect(drawn[0]).toBe('█')
    expect(drawn.charCodeAt(1)).toBeGreaterThan(drawn.charCodeAt(2))
  })

  it('never shows a little where there is none', () => {
    // The shortest block would say some of the work is left. None is.
    expect(renderSurvivalCurve([point(0, 0)])).toBe(' ')
  })

  it('shows a little where there is a little', () => {
    expect(renderSurvivalCurve([point(0, 0.01)])).toBe('▁')
  })

  it('thins a long curve to the width, taking the lowest of each column', () => {
    // A summary must not be able to look better than what it summarises.
    const curve = Array.from({ length: 40 }, (_, index) =>
      point(index * 30, index === 5 ? 0 : 1),
    )

    const drawn = renderSurvivalCurve(curve, 8)

    expect(drawn).toHaveLength(8)
    expect(drawn).toContain(' ')
  })

  it('has nothing to draw for no curve', () => {
    expect(renderSurvivalCurve([])).toBe('')
  })
})

describe('curveSpanDays', () => {
  it('reports how far the curve reaches', () => {
    expect(curveSpanDays([point(0, 1), point(90, 0.5)])).toBe(90)
  })

  it('reaches nowhere when there is no curve', () => {
    expect(curveSpanDays([])).toBe(0)
  })
})
