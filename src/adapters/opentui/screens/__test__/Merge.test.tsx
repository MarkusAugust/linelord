import { afterEach, describe, expect, it } from 'bun:test'
import {
  type Driven,
  fixtureRealm,
  GORVEK,
  memoryFiles,
  SARN,
  SUGGESTION,
  shell,
} from '../../__test__/harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

const REPO = '/realm/bonereach'
const MAILMAP = `${REPO}/.mailmap`

describe('Merge', () => {
  it('starts from the overview with the warrior under the cursor marked', async () => {
    const files = memoryFiles()
    screen = await shell({
      files,
      repoPath: REPO,
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })

    await screen.press('m')
    const frame = screen.frame()
    expect(frame).toContain('MERGE WARRIORS')
    expect(frame).toMatch(new RegExp(`\\[x\\] ${GORVEK.name}`))
    expect(frame).toMatch(new RegExp(`\\[ \\] ${SARN.name}`))
    expect(frame).toContain('Mark two or more, then Enter')
  })

  it('refuses to go on with fewer than two marked', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
    })

    await screen.press(' ', 'enter')
    expect(screen.frame()).toContain('Mark two or more with space first')
    expect(screen.frame()).not.toContain('shown as?')
  })

  it('marks and unmarks with space', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
    })

    await screen.press(' ')
    expect(screen.frame()).toMatch(new RegExp(`\\[x\\] ${GORVEK.name}`))
    await screen.press(' ')
    expect(screen.frame()).toMatch(new RegExp(`\\[ \\] ${GORVEK.name}`))
  })

  it('writes nothing before w, exactly the previewed line on w, and then reads the realm again', async () => {
    const files = memoryFiles()
    let reread = 0
    screen = await shell({
      files,
      repoPath: REPO,
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
      onReanalyse: () => {
        reread += 1
      },
    })

    // Mark Gorvek and Sarn, keep Sarn.
    await screen.press(' ', 'j', ' ')
    expect(screen.frame()).toContain('2 marked · Enter to merge them')
    await screen.press('enter')
    expect(screen.frame()).toContain('shown as?')
    await screen.press('j', 'enter')

    const line = `${SARN.name} <${SARN.email}> <${GORVEK.email}>`
    expect(screen.frame()).toContain('These lines are added to .mailmap:')
    expect(screen.frame()).toContain(line)
    expect(screen.frame()).toContain('Nothing is written until you press w')
    expect(files.files).toEqual({})

    await screen.press('w')
    expect(files.files[MAILMAP]).toBe(`${line}\n`)
    const written = screen.frame()
    expect(written).toContain(`+ ${line}`)
    expect(written).toContain('To change this later, edit that file:')
    expect(written).toContain('delete the lines added here')
    expect(written).toContain('commit it')

    expect(reread).toBe(0)
    await screen.press('enter')
    expect(reread).toBe(1)
    expect(screen.frame()).toContain('REPOSITORY OVERVIEW')
  })

  it('takes a suggestion, keeping the identity the guess would keep unless told otherwise', async () => {
    const files = memoryFiles()
    screen = await shell({
      files,
      repoPath: REPO,
      realm: { status: 'ready', realm: fixtureRealm({ merges: [SUGGESTION] }) },
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
    })
    expect(screen.frame()).toContain('Suggested, because they look alike')
    expect(screen.frame()).toContain('← gorvek@privat.realm')

    await screen.press('enter')
    const keep = screen.frame()
    expect(keep).toContain('shown as?')
    expect(keep).toMatch(new RegExp(`› ${GORVEK.name} <${GORVEK.email}>`))

    await screen.press('enter')
    expect(screen.frame()).toContain(
      `${GORVEK.name} <${GORVEK.email}> <gorvek@privat.realm>`,
    )

    // Back, and choose the other one instead.
    await screen.press('esc', 'j', 'enter')
    expect(screen.frame()).toContain(
      `Gorvek <gorvek@privat.realm> <${GORVEK.email}>`,
    )
  })

  it('says so when the file cannot be written, and merges nothing', async () => {
    screen = await shell({
      files: {
        readText: async () => null,
        appendText: async () => {
          throw new Error('EACCES: permission denied')
        },
      },
      repoPath: REPO,
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
    })

    await screen.press(' ', 'j', ' ', 'enter', 'enter', 'w')
    expect(screen.frame()).toContain('Could not merge them: EACCES')
    expect(screen.frame()).toContain('Nothing was merged.')

    await screen.press('esc')
    expect(screen.frame()).toContain('THE MAIN HALL')
  })

  it('steps back with Esc through every step, and finally leaves', async () => {
    screen = await shell({
      initialScreens: [{ kind: 'menu' }, { kind: 'overview' }],
    })
    await screen.press('m', 'j', ' ', 'enter', 'enter')
    expect(screen.frame()).toContain('These lines are added')

    await screen.press('esc')
    expect(screen.frame()).toContain('shown as?')
    await screen.press('esc')
    expect(screen.frame()).toContain('2 marked')
    await screen.press('esc')
    expect(screen.frame()).toContain('REPOSITORY OVERVIEW')
  })

  it('is reached from the menu', async () => {
    screen = await shell()
    await screen.press('4')
    expect(screen.frame()).toContain('Merge warriors who are one person')
  })
})

describe('Merge, while the file is being written', () => {
  /** A file system whose append waits until the test lets it go. */
  function slowFiles() {
    const files = memoryFiles()
    let release = () => {}
    let appends = 0
    const appendText = files.appendText
    files.appendText = async (path, text) => {
      appends += 1
      await new Promise<void>((done) => {
        release = done
      })
      await appendText(path, text)
    }
    return { files, release: () => release(), appends: () => appends }
  }

  async function toPreview(files: ReturnType<typeof memoryFiles>) {
    const driven = await shell({
      files,
      repoPath: REPO,
      initialScreens: [{ kind: 'menu' }, { kind: 'merge' }],
    })
    await driven.press(' ', 'j', ' ', 'enter', 'enter')
    return driven
  }

  it('stays until the write is done, so the realm is read again after it', async () => {
    // Leaving mid-write used to close the screen while the write went on:
    // .mailmap changed and nothing read the realm again.
    const slow = slowFiles()
    const driven = await toPreview(slow.files)
    screen = driven
    await driven.press('w', 'esc')
    expect(driven.frame()).toContain('MERGE WARRIORS')
    expect(driven.frame()).toContain('Writing')

    slow.release()
    await driven.press('j')
    expect(driven.frame()).toContain('To change this later')
    await driven.press('enter')
    expect(driven.reread()).toBe(1)
  })

  it('writes once however often w is pressed', async () => {
    const slow = slowFiles()
    const driven = await toPreview(slow.files)
    screen = driven
    await driven.press('w', 'w', 'w')
    slow.release()
    await driven.press('j')
    expect(slow.appends()).toBe(1)
    expect(slow.files.files[MAILMAP]?.trim().split('\n')).toHaveLength(1)
  })
})
