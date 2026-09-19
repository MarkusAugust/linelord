import { spawn } from 'node:child_process'

/**
 * The root of the git repository containing `startPath`, or null if there is
 * none.
 *
 * Resolving to the root rather than taking the given path at face value fixes
 * two things at once. A directory that is not a repository at all used to run
 * a full analysis that found nothing -- zero files, zero lines, zero authors,
 * presented as though that were the answer. And a subdirectory produced a
 * partial analysis labelled as the repository's: `git ls-tree` honours the
 * current directory's prefix, so running inside `src/` listed only what was
 * under `src/` while the screen still said "Repository:" and reported totals.
 */
export function findRepositoryRoot(startPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', '--show-toplevel'], {
      cwd: startPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    // A missing git binary is reported the same way as a missing repository:
    // either way there is nothing here this tool can analyse.
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      resolve(code === 0 && stdout.trim() ? stdout.trim() : null)
    })
  })
}
