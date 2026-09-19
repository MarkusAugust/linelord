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
  '.github',
  'workflows',
  'release.yml',
)

const workflow = readFileSync(WORKFLOW, 'utf8')

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

  it('still refuses to run when the tap token is missing', () => {
    // A silent skip would recreate the failure this job exists to prevent:
    // a published release whose formula still points at the previous version.
    expect(workflow).toContain('HOMEBREW_TAP_TOKEN is not set')
    expect(workflow).toMatch(/if \[ -z "\$TAP_TOKEN" \]/)
  })
})
