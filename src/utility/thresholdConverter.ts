/**
 * Converts kilobytes to bytes for file size threshold calculations
 * @param thresholdKB - Threshold in kilobytes (can be undefined/null)
 * @param defaultKB - Default threshold in kilobytes if thresholdKB is not provided
 * @returns Object containing both KB and byte values
 */
export function convertThresholdKBToBytes(
  thresholdKB: number | null | undefined,
  defaultKB = 50
) {
  const finalThresholdKB = thresholdKB ?? defaultKB
  const thresholdBytes = finalThresholdKB * 1024

  return {
    thresholdKB: finalThresholdKB,
    thresholdBytes
  }
}
