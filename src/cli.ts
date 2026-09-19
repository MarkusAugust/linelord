#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from 'ink'
import meow from 'meow'
import React from 'react'
import App from './App'
import { CLI_HELP } from './resources/cliHelp'
import { expandTilde, validateThresholdKB } from './utility/cliValidation'
import { findRepositoryRoot } from './utility/gitRepository'

const cli = meow(CLI_HELP, {
  importMeta: import.meta,
  autoVersion: false,
  flags: {
    path: {
      type: 'string',
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
const repoPath = await findRepositoryRoot(resolvedPath)

if (!repoPath) {
  exitWithError(
    `Not a git repository: ${resolvedPath}`,
    'LineLord reads history with git blame, so it needs a repository to read.',
    'Run it inside one, or pass a path: linelord /path/to/repo',
  )
}

const thresholdCheck = validateThresholdKB(cli.flags.threshold)

if (!thresholdCheck.ok) {
  exitWithError(
    thresholdCheck.message,
    'Example: linelord --threshold 200  (analyse files up to 200 KB)',
  )
}

const thresholdKB = thresholdCheck.thresholdKB

// Pass repoPath to your existing App component
const element = React.createElement(App, {
  repoPath: repoPath,
  thresholdKB: thresholdKB,
})

const app = render(element)
const { waitUntilExit } = app

waitUntilExit().then(() => {
  process.exit(0)
})
