import { afterEach, describe, expect, it } from 'bun:test'
import { BattleRecord, Heading, MeasureRow } from '../parts'
import { type Driven, drive, fixtureRealm, NASK } from './harness'

let screen: Driven | undefined
afterEach(() => {
  screen?.done()
  screen = undefined
})

function lineWith(frame: string, text: string): string {
  return frame.split('\n').find((line) => line.includes(text)) ?? ''
}

describe('MeasureRow', () => {
  it('reads as so many of the whole, its part as a number and a bar, and the place', async () => {
    screen = await drive(
      <box>
        <MeasureRow
          label="Ancient Code"
          value={11481}
          whole={31400}
          unit="lines"
          place={{ place: 2, of: 16, shared: false }}
          barWidth={10}
        />
      </box>,
    )
    expect(lineWith(screen.frame(), 'Ancient Code')).toMatch(
      /11,481 of 31,400 lines\s+36\.6% ███▋\s+2nd of 16/,
    )
  })

  it('marks a shared place with =', async () => {
    screen = await drive(
      <box>
        <MeasureRow
          label="Solo Quests"
          value={1}
          whole={5}
          unit="files"
          place={{ place: 1, of: 4, shared: true }}
          barWidth={10}
        />
      </box>,
    )
    expect(lineWith(screen.frame(), 'Solo Quests')).toMatch(
      /1 of 5 files\s+20\.0% ██\s+=1st of 4/,
    )
  })

  it('gives no place to a measure the warrior has none of', async () => {
    screen = await drive(
      <box>
        <MeasureRow
          label="Massive Battles"
          value={0}
          whole={2}
          unit="days"
          place={{ place: 1, of: 4, shared: true }}
          barWidth={10}
        />
      </box>,
    )
    const line = lineWith(screen.frame(), 'Massive Battles')
    expect(line).toMatch(/0 of 2 days\s+0\.0%/)
    expect(line).not.toContain('of 4')
  })

  it('says nothing of a part when the whole is empty', async () => {
    screen = await drive(
      <box>
        <MeasureRow
          label="Battle Scars"
          value={0}
          whole={0}
          unit="lines"
          place={null}
          barWidth={10}
        />
      </box>,
    )
    expect(lineWith(screen.frame(), 'Battle Scars')).toMatch(/0 of 0 lines\s+—/)
  })
})

describe('BattleRecord', () => {
  it('draws every measure of a warrior against the realm', async () => {
    const realm = fixtureRealm()
    const nask = realm.rankings.find((one) => one.authorId === NASK.id)
    if (!nask) throw new Error('Nask should be ranked')
    screen = await drive(
      <box style={{ flexDirection: 'column' }}>
        <BattleRecord
          warrior={nask}
          rankings={realm.rankings}
          totals={realm.totals}
          barWidth={10}
        />
      </box>,
    )
    const frame = screen.frame()

    expect(lineWith(frame, 'Lines in HEAD')).toMatch(
      /1 of 17 lines\s+5\.9% .*\s4th of 4/,
    )
    expect(lineWith(frame, 'Battle Scars')).toMatch(/0 of 6 lines/)
    expect(lineWith(frame, 'Battle Scars')).not.toContain('of 4')
    expect(lineWith(frame, 'Territory Conquered')).toMatch(
      /1 of 5 files .*=2nd of 4/,
    )
    expect(lineWith(frame, 'Weapon Mastery')).toMatch(
      /1 of 3 file types .*=1st of 4/,
    )
    expect(lineWith(frame, 'Campaigns')).toMatch(/1 of 2 days\s+50\.0%/)
  })
})

describe('Heading', () => {
  it('draws its words', async () => {
    screen = await drive(
      <box>
        <Heading>🏆 LEGENDARY ACHIEVEMENTS</Heading>
      </box>,
    )
    expect(screen.frame()).toContain('🏆 LEGENDARY ACHIEVEMENTS')
  })
})
