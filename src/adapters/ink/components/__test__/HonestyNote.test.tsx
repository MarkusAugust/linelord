import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import { HONESTY_NOTES } from '../../resources/honestyNotes'
import { HonestyNote } from '../HonestyNote'

describe('HonestyNote', () => {
  it('says what the age figures are and are not', () => {
    const { lastFrame } = render(<HonestyNote topic="age" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain(HONESTY_NOTES.age.heading)
    for (const line of HONESTY_NOTES.age.lines) {
      // Ink wraps to the terminal width, so a long line may be broken; the
      // first few words are enough to know it is there.
      expect(frame).toContain(line.split(' ').slice(0, 4).join(' '))
    }
  })

  it('says what the rankings are and are not', () => {
    const { lastFrame } = render(<HonestyNote topic="rankings" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain(HONESTY_NOTES.rankings.heading)
    expect(frame).toContain('not commits')
  })

  it('can leave its heading to the screen around it', () => {
    const { lastFrame } = render(
      <HonestyNote topic="age" showHeading={false} />,
    )

    expect(lastFrame()).not.toContain(HONESTY_NOTES.age.heading)
    expect(lastFrame()).toContain('Age is when a line')
  })

  it('every topic says, in so many words, that this does not measure a person', () => {
    // The one sentence that must survive every rewording. The theming invites
    // reading the numbers as a judgement, and the note is what refuses it.
    for (const topic of Object.keys(HONESTY_NOTES) as Array<
      keyof typeof HONESTY_NOTES
    >) {
      const joined = HONESTY_NOTES[topic].lines.join(' ').toLowerCase()
      expect(joined).toMatch(/does not measure|none of this measures/)
    }
  })
})
