import { describe, expect, it } from 'bun:test'
import type { AnalysisStep } from '../../analysisStep'
import {
  barbarianAnalyzingMessages,
  barbarianCompleteMessages,
  barbarianInitializingMessages,
  barbarianScanningMessages,
  getRandomBarbarianMessage,
} from '../barbarianAnalysisMessages'
import { barbarianQuotes } from '../barbarianQuotes'
import { gallowmarkQuotes } from '../gallowmarkQuotes'

describe('the quotes from the Gallowmark canon', () => {
  it('fills every pool with non-empty, distinct lines', () => {
    for (const [pool, lines] of Object.entries(gallowmarkQuotes)) {
      expect(lines.length, pool).toBeGreaterThan(0)
      expect(new Set(lines).size, pool).toBe(lines.length)
      for (const line of lines) expect(line.trim(), pool).toBe(line)
    }
  })

  it('is what the screens read', () => {
    expect(barbarianQuotes).toBe(gallowmarkQuotes.farewell)
    expect(barbarianInitializingMessages).toBe(gallowmarkQuotes.initializing)
    expect(barbarianScanningMessages).toBe(gallowmarkQuotes.scanning)
    expect(barbarianAnalyzingMessages).toBe(gallowmarkQuotes.analyzing)
    expect(barbarianCompleteMessages).toBe(gallowmarkQuotes.complete)
  })

  it("answers every analysis step from that step's pool", () => {
    const steps: AnalysisStep[] = [
      'initializing',
      'scanning',
      'analyzing',
      'complete',
    ]
    for (const step of steps) {
      expect(gallowmarkQuotes[step]).toContain(getRandomBarbarianMessage(step))
    }
  })
})
