#!/usr/bin/env node
import { render } from 'ink'
import meow from 'meow'
import React from 'react'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import App from './App'
import { CLI_HELP } from './resources/cliHelp'

const cli = meow(CLI_HELP, {
  importMeta: import.meta,
  autoVersion: false,
  flags: {
    path: {
      type: 'string'
    },

    version: {
      type: 'boolean',
      shortFlag: 'v'
    },
    threshold: {
      type: 'number',
      default: 50,
      shortFlag: 't'
    }
  }
})

// Handle --version flag immediately without starting the app
if (cli.flags.version) {
  const packageJson = require('../package.json')
  console.log(`⚔️  LineLord v${packageJson.version} ⚔️`)
  process.exit(0)
}

// 🔧 Function to expand tilde (~) to home directory
function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace('~', homedir())
  }
  return filepath
}

// 🔧 Smart repository path resolution with tilde expansion
function getRepositoryPath(): string {
  // Priority: CLI argument > --path flag > current directory
  const argPath = cli.input[0]
  const flagPath = cli.flags.path
  const defaultPath = process.cwd()

  const candidatePath = argPath || flagPath || defaultPath

  // 🔧 Expand tilde before resolving path
  const expandedPath = expandTilde(candidatePath)

  // Resolve to absolute path
  const resolvedPath = resolve(expandedPath)

  // Validate that path exists
  if (!existsSync(resolvedPath)) {
    console.error(`❌ Error: Repository path does not exist: ${resolvedPath}`)
    console.error(`💡 Original path: ${candidatePath}`)
    console.error(`💡 Expanded path: ${expandedPath}`)
    process.exit(1)
  }

  return resolvedPath
}

// Normal operation - get repo path from argument or flag, with tilde expansion
const repoPath = getRepositoryPath()
const thresholdKB = cli.flags.threshold

// Pass repoPath to your existing App component
const element = React.createElement(App, {
  repoPath: repoPath,
  thresholdKB: thresholdKB
})

const app = render(element)
const { waitUntilExit } = app

waitUntilExit().then(() => {
  process.exit(0)
})
