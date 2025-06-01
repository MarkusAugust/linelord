import picocolors from 'picocolors'

type ColorOptions = 'green' | 'cyan' | 'blue'

// Render a simple progress bar with picocolors - with robust error handling
export const renderSimplePercentageBar = (
  percent: number,
  width = 15,
  color: ColorOptions = 'green'
) => {
  // Validate inputs to prevent errors
  const safePercent =
    Number.isFinite(percent) && !Number.isNaN(percent) ? percent : 0

  let safeWidth = width
  if (
    !Number.isFinite(safeWidth) ||
    Number.isNaN(safeWidth) ||
    safeWidth <= 0
  ) {
    safeWidth = 15
  }

  // Clamp percent to valid range (0-100)
  const clampedPercent = Math.max(0, Math.min(100, safePercent))
  const filled = Math.round((safeWidth * clampedPercent) / 100)
  const empty = safeWidth - filled

  // Additional safety check to ensure non-negative values
  const safeeFilled = Math.max(0, filled)
  const safeEmpty = Math.max(0, empty)

  return (
    (color === 'cyan'
      ? picocolors.cyan('█'.repeat(safeeFilled))
      : color === 'blue'
      ? picocolors.blue('█'.repeat(safeeFilled))
      : picocolors.green('█'.repeat(safeeFilled))) +
    picocolors.gray('░'.repeat(safeEmpty))
  )
}
