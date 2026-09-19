import { spawn } from 'node:child_process'

export type RepositoryLookup =
  | { found: true; root: string }
  /** There is a working git, but nothing here belongs to a repository. */
  | { found: false; reason: 'not-a-repository' }
  /** git could not be run at all, so nothing can be said about the path. */
  | { found: false; reason: 'git-unavailable' }

/** Run a git command and report whether it ran, separately from how it exited. */
function runGit(
  args: string[],
  cwd?: string,
): Promise<{ spawned: boolean; code: number | null; stdout: string }> {
  return new Promise((settle) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    let stdout = ''
    let settled = false
    const finish = (result: {
      spawned: boolean
      code: number | null
      stdout: string
    }) => {
      // `error` and `close` can both fire. Once the two outcomes mean
      // different things to the caller, whichever arrives first has to win
      // rather than being quietly overwritten by the other.
      if (settled) return
      settled = true
      settle(result)
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.once('error', () =>
      finish({ spawned: false, code: null, stdout: '' }),
    )
    child.once('close', (code) => finish({ spawned: true, code, stdout }))
  })
}

/**
 * The root of the git repository containing `startPath`.
 *
 * Resolving to the root rather than taking the given path at face value fixes
 * two things at once. A directory that is not a repository used to run a full
 * analysis that found nothing -- zero files, zero lines, zero authors,
 * presented as though that were the answer. And a subdirectory produced a
 * partial analysis labelled as the repository's: `git ls-tree` honours the
 * current directory's prefix, so running inside `src/` listed only what was
 * under `src/` while the screen still said "Repository:" and reported totals.
 *
 * A failure to spawn is not assumed to mean git is missing -- a cwd that does
 * not exist fails the same way -- so that case is confirmed by asking git for
 * its version before blaming the installation for the user's path, or the
 * user's path for the installation.
 */
export async function findRepositoryRoot(
  startPath: string,
): Promise<RepositoryLookup> {
  const revParse = await runGit(['rev-parse', '--show-toplevel'], startPath)

  if (revParse.spawned && revParse.code === 0 && revParse.stdout.trim()) {
    return { found: true, root: revParse.stdout.trim() }
  }

  if (!revParse.spawned) {
    const version = await runGit(['--version'])
    if (!version.spawned) {
      return { found: false, reason: 'git-unavailable' }
    }
  }

  return { found: false, reason: 'not-a-repository' }
}
