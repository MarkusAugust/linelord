import { describe, expect, it } from 'bun:test'
import { convertThresholdKBToBytes } from '../thresholdConverter'

describe('convertThresholdKBToBytes', () => {
  it('should convert valid KB values to bytes correctly', () => {
    const result = convertThresholdKBToBytes(1)
    expect(result.thresholdKB).toBe(1)
    expect(result.thresholdBytes).toBe(1024)
  })

  it('should convert large KB values correctly', () => {
    const result = convertThresholdKBToBytes(50)
    expect(result.thresholdKB).toBe(50)
    expect(result.thresholdBytes).toBe(51200) // 50 * 1024
  })

  it('should handle zero KB correctly', () => {
    const result = convertThresholdKBToBytes(0)
    expect(result.thresholdKB).toBe(0)
    expect(result.thresholdBytes).toBe(0)
  })

  it('should use default when thresholdKB is undefined', () => {
    const result = convertThresholdKBToBytes(undefined)
    expect(result.thresholdKB).toBe(50) // default
    expect(result.thresholdBytes).toBe(51200) // 50 * 1024
  })

  it('should use default when thresholdKB is null', () => {
    const result = convertThresholdKBToBytes(null)
    expect(result.thresholdKB).toBe(50) // default
    expect(result.thresholdBytes).toBe(51200) // 50 * 1024
  })

  it('should use custom default value', () => {
    const result = convertThresholdKBToBytes(undefined, 100)
    expect(result.thresholdKB).toBe(100)
    expect(result.thresholdBytes).toBe(102400) // 100 * 1024
  })

  it('should handle decimal KB values', () => {
    const result = convertThresholdKBToBytes(1.5)
    expect(result.thresholdKB).toBe(1.5)
    expect(result.thresholdBytes).toBe(1536) // 1.5 * 1024
  })

  it('should preserve exact byte calculations for common values', () => {
    const testCases = [
      { kb: 1, expectedBytes: 1024 },
      { kb: 2, expectedBytes: 2048 },
      { kb: 10, expectedBytes: 10240 },
      { kb: 100, expectedBytes: 102400 },
      { kb: 1000, expectedBytes: 1024000 },
    ]

    for (const { kb, expectedBytes } of testCases) {
      const result = convertThresholdKBToBytes(kb)
      expect(result.thresholdBytes).toBe(expectedBytes)
    }
  })
})
