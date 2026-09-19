#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from 'ink'
import meow from 'meow'
import React from 'react'
import App from './App'
import { resolveCachePath } from './db/cacheLocation'
import { removeAllCaches, removeCacheFor } from './db/cacheMaintenance'
import { CLI_HELP } from './resources/cliHelp'
import { LineLordService } from './services/LineLordService'
import { expandTilde, validateThresholdKB } from './utility/cliValidation'
import { findRepositoryRoot } from './utility/gitRepository'
import { writeMailmap } from './utility/mailmap'

const cli = meow(CLI_HELP, {
  importMeta: import.meta,
  autoVersion: false,
  flags: {
    path: {
      type: 'string',
      // The help text and the README have both promised -p since the first
      // release. Without it meow drops the flag rather than rejecting it, and
      // LineLord analyses the current directory while reporting the path it
      // was handed -- or, with --clear-cache, forgets the wrong repository.
      shortFlag: 'p',
    },

    version: {
      type: 'boolean',
      shortFlag: 'v',
    },
    threshold: {
      type: 'number',
      default: 50,
      shortFlag: 't',
    },
    noCache: {
      type: 'boolean',
      default: false,
    },
    refresh: {
      type: 'boolean',
      default: false,
    },
    clearCache: {
      type: 'boolean',
      default: false,
    },
    clearAllCaches: {
      type: 'boolean',
      default: false,
    },
    fuzzyAuthors: {
      type: 'boolean',
      default: false,
    },
    writeMailmap: {
      type: 'boolean',
      default: false,
    },
    ignoreRev: {
      type: 'string',
      // Repeatable: a repository may have been reformatted more than once,
      // and naming them one run at a time would mean choosing between them.
      isMultiple: true,
    },
  },
})

// Handle --version flag immediately without starting the app
if (cli.flags.version) {
  const packageJson = require('../package.json')
  console.log(`⚔️  LineLord v${packageJson.version} ⚔️`)
  process.exit(0)
}

/**
 * Everything below runs before Ink is rendered, so writing to stderr here is
 * safe -- it is the only place in the program where that is true.
 */
function exitWithError(message: string, ...hints: string[]): never {
  console.error(`❌ ${message}`)
  for (const hint of hints) {
    console.error(`💡 ${hint}`)
  }
  process.exit(1)
}

// Clearing every cache has nothing to do with any particular repository, so
// it runs before the repository is resolved at all. Behind that check it was
// unreachable from an ordinary directory: someone tidying up from their home
// folder was told their home folder is not a git repository.
if (cli.flags.clearAllCaches) {
  const forgotten = removeAllCaches()
  console.log(
    forgotten === 0
      ? '⚔️  No repositories were cached.'
      : `⚔️  Forgot the stored analysis of ${forgotten} repositor${forgotten === 1 ? 'y' : 'ies'}.`,
  )
  process.exit(0)
}

// Priority: CLI argument > --path flag > current directory
const candidatePath = cli.input[0] || cli.flags.path || process.cwd()
const expandedPath = expandTilde(candidatePath)
const resolvedPath = resolve(expandedPath)

if (!existsSync(resolvedPath)) {
  exitWithError(
    `Repository path does not exist: ${resolvedPath}`,
    `Original path: ${candidatePath}`,
    `Expanded path: ${expandedPath}`,
  )
}

// Resolve to the repository root. Analysing the given path directly meant a
// directory that was not a repository produced an empty analysis rather than
// an error, and a subdirectory produced a partial one labelled as the whole
// repository.
const lookup = await findRepositoryRoot(resolvedPath)

if (!lookup.found) {
  // Two different problems with two different fixes, so they get two
  // different messages rather than one that hedges between them.
  if (lookup.reason === 'git-unavailable') {
    exitWithError(
      'git could not be run.',
      'LineLord reads history by running git, so git has to be installed and on your PATH.',
      'Check with: git --version',
    )
  }

  exitWithError(
    `Not a git repository: ${resolvedPath}`,
    'LineLord reads history with git blame, so it needs a repository to read.',
    'Run it inside one, or pass a path: linelord /path/to/repo',
  )
}

const repoPath = lookup.root

const thresholdCheck = validateThresholdKB(cli.flags.threshold)

if (!thresholdCheck.ok) {
  exitWithError(
    thresholdCheck.message,
    'Example: linelord --threshold 200  (analyse files up to 200 KB)',
  )
}

const thresholdKB = thresholdCheck.thresholdKB
const thresholdBytes = thresholdKB * 1024

// This one does concern a particular repository, so it stays behind the
// resolution that establishes which.
if (cli.flags.clearCache) {
  const had = removeCacheFor(resolveCachePath(repoPath))
  console.log(
    had
      ? `⚔️  Forgot the stored analysis of ${repoPath}.`
      : `⚔️  Nothing was stored for ${repoPath}.`,
  )
  process.exit(0)
}

// Writing a .mailmap without opening the interface, for a script or for
// someone who already knows what they want. The same job is on the menu once
// LineLord has started; both run the guessing as a question -- the analysis
// itself stays strict, so this neither merges anybody nor disturbs the stored
// analysis the next ordinary run will reuse.
if (cli.flags.writeMailmap) {
  const service = new LineLordService(repoPath, thresholdBytes, {
    useCache: !cli.flags.noCache,
    refresh: cli.flags.refresh,
    ignoreRevisions: cli.flags.ignoreRev,
  })
  await service.initialize()

  const merges = service.getIdentityMerges()
  const result = await writeMailmap(repoPath, merges)

  if (result.added.length === 0 && result.alreadyPresent.length === 0) {
    console.log('⚔️  Nothing to write: every contributor has one address.')
  } else {
    for (const line of result.added) console.log(`  + ${line}`)
    for (const line of result.alreadyPresent) console.log(`  = ${line}`)
    console.log(
      result.added.length === 0
        ? `⚔️  ${result.path} already says all of this.`
        : `⚔️  Wrote ${result.added.length} line${result.added.length === 1 ? '' : 's'} to ${result.path}.`,
    )
    console.log(
      '💡 These are guesses. Read them, delete the wrong ones, and they will',
    )
    console.log('   never have to be guessed again.')
  }

  process.exit(0)
}

const element = React.createElement(App, {
  repoPath: repoPath,
  thresholdKB: thresholdKB,
  useCache: !cli.flags.noCache,
  refresh: cli.flags.refresh,
  authorPolicy: cli.flags.fuzzyAuthors ? 'loose' : 'strict',
  ignoreRevisions: cli.flags.ignoreRev,
})

const app = render(element)
const { waitUntilExit } = app

waitUntilExit().then(() => {
  process.exit(0)
})
