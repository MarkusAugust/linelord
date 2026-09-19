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

/**
 * Whether `ancestor` is reachable from `descendant`.
 *
 * This is the question that separates an incremental update from a full
 * re-analysis. If the revision a cache was built from is an ancestor of the
 * current one, history only grew: everything the cache knows about files
 * nobody touched is still exactly right, because blame on an untouched file
 * gives the same answer at both. If it is not -- a rebase, a force-push, a
 * branch switch, a reset -- history changed shape instead, and nothing can be
 * concluded about what survived.
 */
export async function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await runGit(
    ['merge-base', '--is-ancestor', ancestor, descendant],
    cwd,
  )
  // Exit 0 means yes, 1 means no, anything else -- an unknown revision, most
  // likely -- is not an answer, and the caller must fall back to a full run.
  return result.spawned && result.code === 0
}

/**
 * Every path touched by any commit in `from..to`.
 *
 * Deliberately not `git diff from to`, which answers a different question:
 * what is *different* between the endpoints. A file changed in one commit and
 * restored in a later one is identical at both ends and absent from the diff --
 * but blame now attributes those lines to the commit that restored them, so
 * the cached answer is wrong while the file content says nothing happened.
 * Asking which files any commit touched cannot miss that.
 *
 * The union with the diff is belt and braces: it catches paths that left the
 * tree entirely, which the log of touched files reports under their old name.
 *
 * --diff-merges=first-parent so that a file changed only while resolving a
 * merge conflict is still reported.
 */
export async function pathsTouchedBetween(
  cwd: string,
  from: string,
  to: string,
): Promise<string[]> {
  const [log, diff] = await Promise.all([
    runGit(
      [
        'log',
        '--format=',
        '--name-only',
        '--diff-merges=first-parent',
        '-z',
        `${from}..${to}`,
      ],
      cwd,
    ),
    runGit(['diff', '--name-only', '-z', from, to], cwd),
  ])

  if (!log.spawned || log.code !== 0 || !diff.spawned || diff.code !== 0) {
    throw new Error(
      `Could not list the paths touched between ${from} and ${to}`,
    )
  }

  const paths = new Set<string>()
  for (const output of [log.stdout, diff.stdout]) {
    for (const path of output.split('\0')) {
      if (path) paths.add(path)
    }
  }
  return [...paths]
}

/**
 * The commit HEAD currently points at, or null in a repository with no commits.
 *
 * Needed before the analysis starts, because whether the analysis runs at all
 * depends on comparing this against what a cache was built from.
 */
export async function resolveHead(cwd: string): Promise<string | null> {
  const result = await runGit(['rev-parse', 'HEAD'], cwd)
  if (!result.spawned || result.code !== 0) return null
  return result.stdout.trim() || null
}
