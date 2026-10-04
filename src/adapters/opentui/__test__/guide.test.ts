import { describe, expect, it } from 'bun:test'
import {
  ACHIEVEMENTS,
  LEGACY_EXTENSIONS,
  LEGACY_FILE_SIZE_BYTES,
  LEGACY_PATH_WORDS,
  MASSIVE_BATTLE_LINES,
  SCORE_WEIGHTS,
} from '../../../core/barbarian'
import { type Block, GUIDE } from '../guide'
import { MEASURE_NAMES } from '../parts'
import { steady } from '../theme'

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

  it('names every measure the rankings show, with the rule that counts it', () => {
    for (const { label } of Object.values(MEASURE_NAMES)) {
      expect(rankings).toContain(label)
    }
  })

  it('says what makes a file legacy-looking, from the rule itself', () => {
    expect(rankings).toContain(
      `${LEGACY_FILE_SIZE_BYTES.toLocaleString('en-GB')} bytes`,
    )
    for (const extension of LEGACY_EXTENSIONS)
      expect(rankings).toContain(extension)
    for (const word of LEGACY_PATH_WORDS)
      expect(rankings).toContain(`"${word}"`)
  })

  it('says how many lines make a massive battle, and what a year is measured from', () => {
    expect(rankings).toContain(`more than ${MASSIVE_BATTLE_LINES}`)
    expect(rankings).toContain('a year before the survey')
  })

  it('explains the bars and the places', () => {
    expect(rankings).toContain('of …')
    expect(rankings).toContain('2nd of 16')
  })
})

describe("The Warrior's Guide on the Gorvek score", () => {
  const score = said('The Gorvek score')

  it('gives every weight the score is worked out with', () => {
    for (const weight of Object.values(SCORE_WEIGHTS)) {
      expect(score).toContain(String(weight))
    }
  })

  it('says it decides the order, and what it is not', () => {
    expect(score).toContain('decides the order')
    expect(score).toContain('not a measure of')
  })
})

describe("The Warrior's Guide on achievements and titles", () => {
  const honours = said('Achievements and titles')

  it('names every achievement and the measure that earns it', () => {
    for (const { title, metric } of ACHIEVEMENTS) {
      expect(honours).toContain(steady(title).replace(/^\S+\s+/, ''))
      expect(honours).toContain(MEASURE_NAMES[metric].label)
    }
  })

  it('says titles follow the share of lines, and are given relative to the others', () => {
    expect(honours).toContain('legend')
    expect(honours).toContain('peasant')
    expect(honours).toContain('top fifth')
  })
})

describe("The Warrior's Guide on Code Longevity", () => {
  const longevity = said('Reading Code Longevity')

  it('explains every column, and the three things a half-life can say', () => {
    for (const term of [
      'Median',
      'Spread',
      'Half-life',
      'New → old',
      'Survival',
    ]) {
      expect(longevity).toContain(term)
    }
    expect(longevity).toContain('> 1y 5m')
    expect(longevity).toContain('—')
  })
})
