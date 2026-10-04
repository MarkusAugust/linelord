import { describe, expect, it } from 'bun:test'
import {
  ACHIEVEMENTS,
  LEGACY_EXTENSIONS,
  LEGACY_FILE_SIZE_BYTES,
  LEGACY_PATH_WORDS,
  MASSIVE_BATTLE_LINES,
  SCORE_WEIGHTS,
} from '../../../core/barbarian'
import { EPIC_TITLES, getDistributedTitles } from '../../../core/rankedTitles'
import { type Block, GUIDE } from '../guide'
import { MEASURE_NAMES } from '../parts'

/** Everything a chapter says, as one string. */
function said(title: string): string {
  const chapter = GUIDE.find((one) => one.title === title)
  if (!chapter) throw new Error(`no chapter "${title}"`)
  return chapter.blocks
    .map((block: Block) => {
      switch (block.kind) {
        case 'pairs':
          return block.pairs.map((pair) => pair.join(' ')).join('\n')
        case 'code':
          return block.lines.join('\n')
        default:
          return block.text
      }
    })
    .join('\n')
}

describe("The Warrior's Guide on the rankings", () => {
  const rankings = said('The rankings, measure by measure')

  it('names every measure the rankings show', () => {
    for (const { label } of Object.values(MEASURE_NAMES)) {
      expect(rankings).toContain(label)
    }
  })

  it('gives the legacy-file rules exactly as the code applies them', () => {
    expect(rankings).toContain(
      `over ${LEGACY_FILE_SIZE_BYTES.toLocaleString('en-GB')} bytes`,
    )
    expect(rankings).toContain(`ending in ${[...LEGACY_EXTENSIONS].join(' ')}`)
    expect(rankings).toContain(
      LEGACY_PATH_WORDS.map((word) => `"${word}"`).join(', '),
    )
    // A substring match, so "old" is found in "golden.ts" and "folder/".
    expect(rankings).toContain('even inside a word')
    // Files over the threshold have no lines, so the size rule only reaches
    // files between the two.
    expect(rankings).toContain('--threshold')
  })

  it('gives the massive-battle threshold, here and in the help', () => {
    expect(rankings).toContain(`more than ${MASSIVE_BATTLE_LINES} of their`)
    expect(MEASURE_NAMES.massiveBattles.explanation).toContain(
      `over ${MASSIVE_BATTLE_LINES}`,
    )
  })

  it('says which wholes are not the whole realm', () => {
    // Battle Scars and Ancient Code stand against the realm's own
    // legacy-looking and ancient lines, not against every line.
    expect(rankings).toContain(
      'Battle Scars against every line in a legacy-looking file',
    )
    expect(rankings).toContain(
      'Ancient Code against every line older than a year',
    )
  })

  it('fits its examples in the chapter pane', () => {
    for (const chapter of GUIDE) {
      for (const block of chapter.blocks) {
        if (block.kind === 'code')
          for (const line of block.lines)
            expect(line.length).toBeLessThanOrEqual(64)
        if (block.kind === 'pairs')
          for (const [term] of block.pairs)
            expect(term.length).toBeLessThanOrEqual(30)
      }
    }
  })
})

describe("The Warrior's Guide on the Gorvek score", () => {
  const score = said('The Gorvek score')
  const w = SCORE_WEIGHTS

  it('gives each weight where it applies', () => {
    expect(score).toContain(
      `Territory × ${w.territoryConquered} + Solo × ${w.soloQuestVictories} + ln(Types) × ${w.weaponMastery}`,
    )
    expect(score).toContain(
      `Ancient × ${w.ancientCodeSurvival} + Scars × ${w.battleScars}`,
    )
    expect(score).toContain(
      `Massive × ${w.massiveBattles} + ln(Campaigns) × ${w.totalCampaigns}`,
    )
    expect(score).toContain(
      `+ ${w.balancedOver20} if the weakest of the three is over 20, + ${w.balancedOver50} more over 50`,
    )
    expect(score).toContain(
      `+ ${w.dominantOver100} if the strongest is over 100`,
    )
  })

  it('says it decides the order, and what it is not', () => {
    expect(score).toContain('decides the order')
    expect(score).toContain('not a measure of')
  })
})

describe("The Warrior's Guide on achievements and titles", () => {
  const honours = said('Achievements and titles')

  it('names every achievement by name, with the measure that earns it', () => {
    const named = [
      ['Slayer of Legacy Dragons', 'Battle Scars'],
      ['Conqueror of Domains', 'Territory Conquered'],
      ['Lone Wolf Warrior', 'Solo Quests'],
      ['Master of Many Weapons', 'Weapon Mastery'],
      ['Guardian of Ancient Code', 'Ancient Code'],
      ['Breaker of Mountains', 'Massive Battles'],
      ['Veteran of a Hundred Battles', 'Campaigns'],
    ]
    expect(ACHIEVEMENTS).toHaveLength(named.length)
    for (const [name, measure] of named)
      expect(honours).toContain(`${name} the most ${measure}`)
  })

  it('says how titles are given, with what the last place is actually called', () => {
    for (const title of EPIC_TITLES) expect(honours).toContain(title)
    expect(honours).toContain('the last place is always a peasant')
    for (const size of [5, 16, 60]) {
      expect(honours).toContain(
        `${size} warriors, the last is ${getDistributedTitles(size).at(-1)}`,
      )
    }
  })
})

describe("The Warrior's Guide on Code Longevity", () => {
  const longevity = said('Reading Code Longevity')

  it('explains the columns, and says survival is not one', () => {
    for (const term of ['Median', 'Spread', 'Half-life', 'New → old'])
      expect(longevity).toContain(term)
    expect(longevity).toContain('not a column')
  })

  it('gives every reason a half-life is a dash', () => {
    expect(longevity).toContain('> 1y 5m')
    expect(longevity).toContain('was not walked')
    expect(longevity).toContain('another revision')
  })
})
