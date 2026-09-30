/**
 * Builds the demo repository the site is analysed from.
 *
 * The repository is generated rather than committed. A `.git` directory cannot
 * be nested inside this one without a bundle or a submodule, and neither would
 * solve the reason the generator exists: the commit dates are resolved against
 * the moment of the build, so what the site reports about code age stays true
 * however long ago the fixture was designed.
 */

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTestRepo } from '../../src/__test__/helpers/createTestRepo'
import { DEMO_HISTORY, type DemoCommit, resolveDemoHistory } from './history'

export interface BuildDemoRepoOptions {
  /** Where to build it. The directory must not already be a repository. */
  root: string
  /** Reference date the commit ages are measured back from. */
  now?: Date
  history?: readonly DemoCommit[]
}

export interface DemoRepo {
  /** Absolute path to the built repository. */
  path: string
  /** Full hashes of the commits named in `.git-blame-ignore-revs`. */
  ignoredRevs: string[]
}

const IGNORE_REVS_FILE = '.git-blame-ignore-revs'

/** Days after the newest commit in the history that the ignore-revs file lands. */
const IGNORE_REVS_WRITTEN_AFTER = 4

export async function buildDemoRepo(
  options: BuildDemoRepoOptions,
): Promise<DemoRepo> {
  const { root, now = new Date(), history = DEMO_HISTORY } = options

  if (existsSync(join(root, '.git'))) {
    throw new Error(
      `${root} already holds a git repository; remove it before rebuilding the demo`,
    )
  }

  const resolved = resolveDemoHistory(now, history)
  const repo = await createTestRepo({ root, initialBranch: 'master' })

  const ignoredRevs: string[] = []
  let newest = resolved[0]?.date ?? now

  for (const commit of resolved) {
    const sha = await repo.commit({
      message: commit.message,
      author: commit.author,
      date: commit.date,
      write: commit.write,
      remove: commit.remove,
    })
    if (commit.reformatting) {
      ignoredRevs.push(sha)
    }
    if (commit.date.getTime() > newest.getTime()) {
      newest = commit.date
    }
  }

  // Written last because a hash cannot be recorded before the commit it names
  // exists. The date is pushed past the newest commit so the history still
  // reads forwards.
  if (ignoredRevs.length > 0) {
    const contents = [
      '# Reformatting, not authorship. LineLord and git blame both read this.',
      ...ignoredRevs,
      '',
    ].join('\n')
    await writeFile(join(root, IGNORE_REVS_FILE), contents)
    await repo.commit({
      message: 'Name the reformatting, so blame looks past it',
      author: resolved[0]?.author,
      date: new Date(
        newest.getTime() + IGNORE_REVS_WRITTEN_AFTER * 24 * 60 * 60 * 1000,
      ),
    })
  }

  return { path: repo.path, ignoredRevs }
}
