/**
 * A file name in two parts, for laying out in columns.
 *
 * The extension is what follows the last dot, except that a leading dot is
 * part of the name: `.gitignore` has no extension, and `.eslintrc.json` is
 * `.eslintrc` with `json`.
 */
export function parseFileName(filename: string): {
  baseName: string
  extension: string
} {
  if (filename.startsWith('.')) {
    const remainingName = filename.slice(1)
    const dotIndex = remainingName.indexOf('.')

    if (dotIndex === -1) {
      return { baseName: filename, extension: '' }
    }
    return {
      baseName: filename.slice(0, dotIndex + 1),
      extension: remainingName.slice(dotIndex + 1),
    }
  }

  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return { baseName: filename, extension: '' }
  }
  return {
    baseName: filename.slice(0, lastDotIndex),
    extension: filename.slice(lastDotIndex + 1),
  }
}
