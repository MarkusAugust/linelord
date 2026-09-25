import { describe, expect, it } from 'bun:test'
import { isIgnoredByPattern, toGlobPatterns } from '../ignoreFiles'

/**
 * The ignore list grew as a mixture of exact filenames, directory markers,
 * real globs and bare fragments, matched by a substring test that could not
 * tell them apart. These pin the translation of each shape.
 */
describe('toGlobPatterns', () => {
  it('anchors a directory marker to a whole path segment', () => {
    expect(toGlobPatterns('dist/')).toEqual(['**/dist/**'])
    expect(toGlobPatterns('db/migrate/')).toEqual(['**/db/migrate/**'])
  })

  it('leaves a pattern that is already a path glob alone', () => {
    expect(toGlobPatterns('**/migrations/**')).toEqual(['**/migrations/**'])
  })

  it('matches a filename fragment anywhere inside the name', () => {
    expect(toGlobPatterns('.min.js')).toEqual(['**/*.min.js*'])
    expect(toGlobPatterns('_generated')).toEqual(['**/*_generated*'])
  })

  it('applies a bare wildcard to the filename, at any depth', () => {
    expect(toGlobPatterns('*.swp')).toEqual(['**/*.swp'])
    expect(toGlobPatterns('[Dd]ebug/')).toEqual(['**/[Dd]ebug/**'])
  })

  it('covers both readings of a bare path, which may be file or directory', () => {
    expect(toGlobPatterns('fastlane/screenshots')).toEqual([
      '**/fastlane/screenshots',
      '**/fastlane/screenshots/**',
    ])
  })

  it('treats plain text as an exact filename at any depth', () => {
    expect(toGlobPatterns('package-lock.json')).toEqual([
      '**/package-lock.json',
    ])
  })
})

describe('isIgnoredByPattern', () => {
  it('excludes generated code that is checked in', () => {
    for (const path of [
      'package-lock.json',
      'bun.lock',
      'dist/bundle.js',
      'build/output.js',
      'src/app.min.js',
      'node_modules/left-pad/index.js',
      '.vscode/settings.json',
      'nested/deep/dist/chunk.js',
    ]) {
      expect(isIgnoredByPattern(path)).toBe(true)
    }
  })

  it('keeps source directories whose names merely contain an ignored one', () => {
    // Every one of these was silently excluded by the substring fallback.
    for (const path of [
      'rebuild/index.ts',
      'src/checkout/cart.ts',
      'src/robin/hood.ts',
      'src/layout/Layout.tsx',
      'app/about/page.tsx',
      'src/library/index.ts',
      'src/environment/config.ts',
    ]) {
      expect(isIgnoredByPattern(path)).toBe(false)
    }
  })

  it('distinguishes a compiled test binary from a test source file', () => {
    expect(isIgnoredByPattern('cmd/server.test')).toBe(true)
    expect(isIgnoredByPattern('src/thing.test.ts')).toBe(false)
    expect(isIgnoredByPattern('src/thing.spec.ts')).toBe(false)
  })

  it('matches dot directories, which need the dot option to be seen at all', () => {
    expect(isIgnoredByPattern('.next/server/page.js')).toBe(true)
    expect(isIgnoredByPattern('.idea/workspace.xml')).toBe(true)
  })

  it('leaves ordinary source untouched', () => {
    for (const path of [
      'src/index.ts',
      'src/services/GitService.ts',
      'README.md',
      'scripts/verify_formula.py',
    ]) {
      expect(isIgnoredByPattern(path)).toBe(false)
    }
  })
})
