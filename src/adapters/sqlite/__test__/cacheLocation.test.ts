import { describe, expect, it } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  cacheFileName,
  resolveCacheDirectory,
  resolveCachePath,
} from '../cacheLocation'

describe('resolveCacheDirectory', () => {
  it('honours XDG_CACHE_HOME when it is an absolute path', () => {
    expect(resolveCacheDirectory({ XDG_CACHE_HOME: '/var/tmp/xdg' })).toBe(
      '/var/tmp/xdg/linelord',
    )
  })

  it('falls back to ~/.cache when XDG_CACHE_HOME is unset or empty', () => {
    const expected = join(homedir(), '.cache', 'linelord')

    expect(resolveCacheDirectory({})).toBe(expected)
    expect(resolveCacheDirectory({ XDG_CACHE_HOME: '' })).toBe(expected)
  })

  it('ignores a relative XDG_CACHE_HOME rather than resolving it', () => {
    // The specification calls a relative value invalid. Resolving it against
    // the working directory would leave caches scattered through whichever
    // directory the user happened to run from.
    expect(resolveCacheDirectory({ XDG_CACHE_HOME: '.cache' })).toBe(
      join(homedir(), '.cache', 'linelord'),
    )
  })
})

describe('cacheFileName', () => {
  it('gives the same repository the same file every time', () => {
    expect(cacheFileName('/home/someone/code/api')).toBe(
      cacheFileName('/home/someone/code/api'),
    )
  })

  it('keeps two projects with the same name apart', () => {
    // Keyed on the path, not the directory name, or every `api` checkout on a
    // machine would read each other's analysis.
    expect(cacheFileName('/home/someone/work/api')).not.toBe(
      cacheFileName('/home/someone/personal/api'),
    )
  })

  it('produces a short, filesystem-safe name', () => {
    expect(cacheFileName('/home/someone/code/api')).toMatch(
      /^[0-9a-f]{16}\.db$/,
    )
  })
})

describe('resolveCachePath', () => {
  it('puts the repository file inside the cache directory', () => {
    const path = resolveCachePath('/home/someone/code/api', {
      XDG_CACHE_HOME: '/var/tmp/xdg',
    })

    expect(path).toBe(
      join('/var/tmp/xdg/linelord', cacheFileName('/home/someone/code/api')),
    )
  })
})
