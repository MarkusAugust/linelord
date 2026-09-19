import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where analysis caches live, following the XDG base directory specification.
 *
 * `$XDG_CACHE_HOME` when it is set to an absolute path, and `~/.cache`
 * otherwise, which is what the specification says to fall back to. A relative
 * value is ignored rather than resolved against the working directory: the
 * specification calls such a value invalid, and honouring it would scatter
 * caches through whichever directory the user happened to be standing in.
 */
export function resolveCacheDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.XDG_CACHE_HOME
  const base = configured?.startsWith('/')
    ? configured
    : join(homedir(), '.cache')

  return join(base, 'linelord')
}

/**
 * The cache file for one repository.
 *
 * Keyed on a hash of the repository root rather than on its name, because two
 * checkouts of the same project, or two unrelated projects that happen to be
 * called `api`, must not share a cache. The root comes from
 * `git rev-parse --show-toplevel`, so a path given as a subdirectory, through
 * a symlink, or with a trailing slash all arrive here as the same string.
 *
 * The hash is truncated: 16 hex characters is 64 bits, which makes a collision
 * between two repositories on one machine not worth planning for, and keeps
 * the filename readable when someone goes looking.
 */
export function cacheFileName(repositoryRoot: string): string {
  const digest = createHash('sha256').update(repositoryRoot).digest('hex')
  return `${digest.slice(0, 16)}.db`
}

/** The full path to one repository's cache. */
export function resolveCachePath(
  repositoryRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveCacheDirectory(env), cacheFileName(repositoryRoot))
}
