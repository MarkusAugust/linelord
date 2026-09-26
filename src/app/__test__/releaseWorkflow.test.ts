import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Shape guards on the release workflow.
 *
 * The tap-update job holds a token that can write to another repository. It
 * once also ran Python checked out from that same repository, which meant the
 * release pipeline executed code it does not control while holding the
 * credential that code could abuse. These assertions are cheap, need no YAML
 * parser, and fail if that arrangement comes back.
 */

const WORKFLOW = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'release.yml',
)

const workflow = readFileSync(WORKFLOW, 'utf8')

/** The build jobs, up to where the release job starts. */
const buildJob = workflow.slice(
  workflow.indexOf('  build:'),
  workflow.indexOf('  release:'),
)

/** The release job, up to where the tap job starts. */
const releaseJob = workflow.slice(
  workflow.indexOf('  release:'),
  workflow.indexOf('  update-homebrew-tap:'),
)

describe('release workflow', () => {
  it('runs only scripts from this repository, never the tap checkout', () => {
    // The tap is checked out to ./tap, and nothing executable may come from
    // there. Asserting on the whole file rather than on parsed `run:` blocks
    // is both simpler and stricter: there is no legitimate reason for this
    // path to appear anywhere in the workflow.
    expect(workflow).not.toContain('tap/scripts/')

    // And the scripts it does run must be the ones this repository ships.
    expect(workflow).toContain('linelord/scripts/update_formula.py')
    expect(workflow).toContain('linelord/scripts/verify_formula.py')
  })

  it('does not leave the tap token in the checkout it can read', () => {
    // actions/checkout writes the token into .git/config unless told not to,
    // which puts it within reach of anything else running in the job.
    const tapCheckout = workflow.slice(
      workflow.indexOf('repository: MarkusAugust/homebrew-linelord'),
    )
    const nextStep = tapCheckout.indexOf('\n      - name:')
    const block = nextStep === -1 ? tapCheckout : tapCheckout.slice(0, nextStep)

    expect(block).toContain('persist-credentials: false')
  })

  it('grants write permission per job rather than to the whole workflow', () => {
    const header = workflow.slice(0, workflow.indexOf('jobs:'))

    expect(header).toContain('permissions:\n  contents: read')
    expect(header).not.toContain('contents: write')
  })

  it('keeps the write permission the release step needs', () => {
    // The assertion above only says the write is not workflow-wide. On its
    // own it is satisfied by removing the permission altogether, which would
    // leave action-gh-release unable to publish -- a failure that only shows
    // up when a tag is pushed. Pin the job that legitimately needs it.
    expect(releaseJob).toContain('permissions:\n      contents: write')
  })

  it('runs no dependency or build code in the job that holds the write token', () => {
    // The release job downloads what the build jobs made and publishes it.
    // Installing dependencies executes lifecycle scripts from the dependency
    // tree, and a checkout is a repository that code could write into; the
    // job that can create a release does neither.
    expect(releaseJob).not.toContain('bun install')
    expect(releaseJob).not.toContain('actions/checkout')
    expect(releaseJob).toContain('actions/download-artifact')
    expect(buildJob).toContain('permissions:\n      contents: read')
    expect(buildJob).not.toContain('contents: write')
  })

  it('does not persist credentials where dependency and build code runs', () => {
    // The build jobs install dependencies and build. A persisted token would
    // sit in .git/config throughout, and nothing there pushes with git.
    // Found by the step rather than by how the action is referenced, and
    // anchored on `uses:` so a mention in a comment is not mistaken for it.
    const at = buildJob.search(/uses:\s*actions\/checkout@\S+/)
    expect(at).toBeGreaterThan(-1)
    const checkout = buildJob.slice(at)
    const nextStep = checkout.indexOf('\n      - name:')
    const block = nextStep === -1 ? checkout : checkout.slice(0, nextStep)

    expect(block).toContain('persist-credentials: false')
  })

  it('builds each platform on a runner of that platform', () => {
    // A Linux binary that has never been run on Linux before it is published
    // is a binary nobody has tested. Each runner builds its own and executes
    // the one it can; the release job checks that all four arrived.
    expect(buildJob).toContain('runs-on: macos-latest')
    expect(buildJob).toContain('runs-on: ubuntu-24.04')
    expect(buildJob).toContain('release:macos')
    expect(buildJob).toContain('release:linux')
    expect(buildJob).toContain('./linelord-macos-arm64 --version')
    expect(buildJob).toContain('./linelord-linux-x64 --version')
    for (const target of [
      'linelord-macos-arm64',
      'linelord-macos-intel',
      'linelord-linux-x64',
      'linelord-linux-arm64',
    ]) {
      expect(releaseJob).toContain(target)
    }
  })

  it('still refuses to run when the tap token is missing', () => {
    // A silent skip would recreate the failure this job exists to prevent:
    // a published release whose formula still points at the previous version.
    expect(workflow).toContain('HOMEBREW_TAP_TOKEN is not set')
    expect(workflow).toMatch(/if \[ -z "\$TAP_TOKEN" \]/)
  })
})

describe('cli argument handling', () => {
  const cli = readFileSync(join(import.meta.dir, '..', 'cli.ts'), 'utf8')

  it('clears every cache before deciding which repository is meant', () => {
    // --clear-all-caches concerns no repository in particular. Behind the
    // repository checks it was unreachable from an ordinary directory:
    // someone tidying up from their home folder was told their home folder is
    // not a git repository. A shape guard, because cli.ts runs its work at the
    // top level where the test runner cannot reach it.
    const clearAll = cli.indexOf('cli.flags.clearAllCaches')
    const resolvesRepository = cli.indexOf('ports.git.locate(resolvedPath)')

    expect(clearAll).toBeGreaterThan(-1)
    expect(resolvesRepository).toBeGreaterThan(-1)
    expect(clearAll).toBeLessThan(resolvesRepository)
  })

  it('clears one repository only after establishing which', () => {
    const clearOne = cli.indexOf('cli.flags.clearCache')
    const resolvesRepository = cli.indexOf('ports.git.locate(resolvedPath)')

    expect(clearOne).toBeGreaterThan(resolvesRepository)
  })
})
