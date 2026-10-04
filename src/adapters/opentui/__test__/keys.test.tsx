import { afterEach, describe, expect, it } from 'bun:test'
import { useScreenKeys } from '../keys'
import { type Driven, drive } from './harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

function Lonely() {
  useScreenKeys({ hint: 'nobody is listening' })
  return <text>drawn without a frame</text>
}

describe('useScreenKeys', () => {
  it('does nothing, and breaks nothing, outside a frame', async () => {
    screen = await drive(<Lonely />, { width: 40, height: 3 })
    expect(screen.frame()).toContain('drawn without a frame')
  })
})
