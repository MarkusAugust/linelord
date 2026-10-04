import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Driven, shell } from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

let root = ''
let plain = ''
let repo = ''
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'linelord-path-'))
  plain = join(root, 'plain')
  repo = join(root, 'kell')
  await mkdir(plain)
  await mkdir(join(repo, '.git'), { recursive: true })
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('PathInput', () => {
  it('comes first when no repository was given, and shows what it will use', async () => {
    screen = await shell({ repoPath: null })
    expect(screen.frame()).toContain('CHOOSE A REALM')
    expect(screen.frame()).toContain(`Will use: ${process.cwd()}`)

    await screen.type('/tmp/kell')
    expect(screen.frame()).toMatch(/Path\s+\/tmp\/kell█/)
    expect(screen.frame()).toContain('Will use: /tmp/kell')
  })

  it('takes j and q as letters, not as keys', async () => {
    let quits = 0
    screen = await shell({
      repoPath: null,
      onQuit: () => {
        quits += 1
      },
    })
    await screen.type('jq')
    expect(screen.frame()).toMatch(/Path\s+jq█/)
    expect(quits).toBe(0)
  })

  it('rubs out with backspace, and clears with Ctrl-u', async () => {
    screen = await shell({ repoPath: null })
    await screen.type('abc')
    await screen.press('backspace')
    expect(screen.frame()).toMatch(/Path\s+ab█/)
    await screen.press('ctrl-u')
    expect(screen.frame()).toMatch(/Path\s+█/)
  })

  it('refuses a directory that does not exist', async () => {
    screen = await shell({ repoPath: null })
    await screen.type(join(root, 'nowhere'))
    await screen.press('enter')
    expect(screen.frame()).toContain('No such directory')
  })

  it('refuses a directory that is no repository', async () => {
    screen = await shell({ repoPath: null })
    await screen.type(plain)
    await screen.press('enter')
    expect(screen.frame()).toContain('Not a git repository')
  })

  it('marches on a repository, and opens the main hall', async () => {
    const chosen: string[] = []
    screen = await shell({
      repoPath: null,
      onRepoChosen: (path) => chosen.push(path),
    })
    await screen.type(repo)
    await screen.press('enter')
    expect(chosen).toEqual([repo])
  })

  it('leaves the realm on Esc when there is nothing to go back to', async () => {
    let quits = 0
    screen = await shell({
      repoPath: null,
      onQuit: () => {
        quits += 1
      },
    })
    await screen.press('esc')
    expect(quits).toBe(1)
  })

  it('goes back to the menu on Esc when opened from it', async () => {
    screen = await shell()
    await screen.press('6')
    expect(screen.frame()).toContain('CHOOSE A REALM')
    await screen.press('esc')
    expect(screen.frame()).toContain('THE MAIN HALL')
  })
})

describe('PathInput, pasting and leaving', () => {
  it('takes a pasted path as if it were typed', async () => {
    screen = await shell({ repoPath: null })
    await screen.paste(repo)
    expect(screen.frame()).toContain(`Will use: ${repo}`)
  })

  it('leaves the realm on Ctrl-C, though every other key is typed', async () => {
    const driven = await shell({ repoPath: null })
    screen = driven
    await driven.press('ctrl-c')
    expect(driven.quits()).toBe(1)
  })
})
