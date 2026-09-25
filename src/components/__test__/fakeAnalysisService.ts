import type { AnalysisData } from '../../core/model'
import type { AuthorContribution, FileContribution } from '../../core/ownership'
import type {
  AuthorFileLongevity,
  AuthorLongevity,
  AuthorSurvivalWithIdentity,
} from '../../services/LongevityService'
import type { WarriorSource } from '../../services/WarriorSource'

/**
 * Enough of an AnalysisService for a screen to draw itself from.
 *
 * The screens are tested against fixed answers rather than a seeded database:
 * what is under test is how a number is laid out, not how it is computed, and
 * the services have their own tests for that.
 */
export const GORVEK: AuthorContribution = {
  id: 1,
  name: 'Gorvek the Ironbane',
  email: 'gorvek@ashendale.realm',
  displayName: 'Gorvek the Ironbane',
  totalLines: 700,
  totalFiles: 12,
  percentage: 70,
  title: 'legend',
  rank: 1,
}

export const NIGHTSHROUD: AuthorContribution = {
  id: 2,
  name: 'Sister Nightshroud',
  email: 'nightshroud@alderstone.realm',
  displayName: 'Sister Nightshroud',
  totalLines: 250,
  totalFiles: 5,
  percentage: 25,
  title: 'warrior',
  rank: 2,
}

export const STABLE_BOY: AuthorContribution = {
  id: 3,
  name: 'Ulfric of the Stables',
  email: 'ulfric@alderstone.realm',
  displayName: 'Ulfric of the Stables',
  totalLines: 50,
  totalFiles: 1,
  percentage: 5,
  title: 'stable boy',
  rank: 3,
}

export const GORVEK_FILES: FileContribution[] = [
  {
    filename: 'GitService.ts',
    path: 'src/services/GitService.ts',
    authorLines: 400,
    totalLines: 500,
    percentage: 80,
  },
  {
    filename: 'README.md',
    path: 'README.md',
    authorLines: 300,
    totalLines: 300,
    percentage: 100,
  },
]

/**
 * The three warriors above as an analysis: files and lines that add up to
 * the shares they claim, so the overview and the table draw the same thing
 * the detail says.
 */
export function fakeAnalysis(
  contributions: AuthorContribution[] = [GORVEK, NIGHTSHROUD, STABLE_BOY],
): AnalysisData {
  const files: AnalysisData['files'] = []
  const lines: AnalysisData['lines'] = []
  for (const one of contributions) {
    const perFile = Math.floor(one.totalLines / one.totalFiles)
    for (let index = 0; index < one.totalFiles; index++) {
      const id = files.length + 1
      const count =
        index === one.totalFiles - 1
          ? one.totalLines - perFile * (one.totalFiles - 1)
          : perFile
      files.push({
        id,
        path: `src/${one.displayName.split(' ')[0]?.toLowerCase()}-${index}.ts`,
        extension: '.ts',
        size: count * 10,
        isBinary: false,
        isIgnored: false,
        isLargerThanThreshold: false,
        analysisFailed: false,
        totalLines: count,
      })
      for (let n = 1; n <= count; n++) {
        lines.push({
          id: lines.length + 1,
          fileId: id,
          authorId: one.id,
          lineNumber: n,
          commitHash: null,
          commitTimestamp: null,
        })
      }
    }
  }
  return {
    files: [
      ...files,
      {
        id: files.length + 1,
        path: 'logo.png',
        extension: '.png',
        size: 5,
        isBinary: true,
        isIgnored: false,
        isLargerThanThreshold: false,
        analysisFailed: false,
        totalLines: 0,
      },
    ],
    authors: contributions.map((one) => ({
      id: one.id,
      name: one.name,
      email: one.email,
      displayName: one.displayName,
      canonicalId: one.id,
      isCanonical: true,
      title: one.title,
      rank: one.rank,
      percentage: one.percentage,
    })),
    aliases: [],
    lines,
  }
}

export const stripAnsi = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is what an escape code is
  text.replace(/\[[0-9;]*m/g, '')

/** Let React and Ink get through the microtasks a settled promise queues. */
export const settle = () => new Promise((done) => setTimeout(done, 20))

export const KEY = {
  up: '[A',
  down: '[B',
  enter: '\r',
  escape: '',
}

/** Gorvek's surviving code, as the longevity service would describe it. */
export const GORVEK_AGE: AuthorLongevity = {
  authorId: GORVEK.id,
  name: GORVEK.displayName,
  email: GORVEK.email,
  survivingLines: 700,
  medianAgeDays: 400,
  meanAgeDays: 300,
  p10AgeDays: 30,
  p90AgeDays: 800,
  oldestLine: { timestamp: 0, ageDays: 800, path: 'src/old.ts', lineNumber: 1 },
  newestLine: { timestamp: 0, ageDays: 2, path: 'src/new.ts', lineNumber: 4 },
  ageHistogram: {
    underAWeek: 10,
    weekToMonth: 20,
    oneToThreeMonths: 70,
    threeToTwelveMonths: 200,
    oneToTwoYears: 300,
    overTwoYears: 100,
  },
  activeSpanDays: 798,
}

export const GORVEK_OLDEST: AuthorFileLongevity[] = [
  { path: 'src/old.ts', lines: 27, medianAgeDays: 800 },
  { path: 'tsconfig.json', lines: 3, medianAgeDays: 790 },
]

export const GORVEK_SURVIVAL: AuthorSurvivalWithIdentity = {
  authorId: GORVEK.id,
  name: GORVEK.displayName,
  email: GORVEK.email,
  linesEverWritten: 1000,
  survivingLines: 700,
  survivalRate: 0.7,
  halfLifeDays: 120,
  survivalCurve: [
    { ageDays: 0, fractionAlive: 1 },
    { ageDays: 90, fractionAlive: 0.8 },
    { ageDays: 180, fractionAlive: 0.4 },
  ],
}

export function fakeWarriorSource(
  overrides: Partial<WarriorSource> = {},
): WarriorSource {
  return {
    share: async (id) =>
      [GORVEK, NIGHTSHROUD, STABLE_BOY].find((one) => one.id === id) ?? null,
    files: async (id) => (id === GORVEK.id ? GORVEK_FILES : []),
    age: async (id) => (id === GORVEK.id ? GORVEK_AGE : null),
    oldestFiles: async (id) => (id === GORVEK.id ? GORVEK_OLDEST : []),
    survival: async () => null,
    ...overrides,
  }
}
