import type {
  AuthorContribution,
  FileContribution,
  RepositoryStats,
} from '../../services/AnalysisService'
import type { OverviewSource } from '../Overview'

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

export const STATS: RepositoryStats = {
  totalFiles: 20,
  totalAnalyzedFiles: 17,
  totalBinaryFiles: 1,
  totalIgnoredFiles: 1,
  totalLargeFiles: 1,
  totalFailedFiles: 0,
  totalLines: 1000,
  totalAuthors: 3,
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

export function fakeAnalysisService(
  overrides: Partial<OverviewSource> = {},
): OverviewSource {
  return {
    getRepositoryStats: async () => STATS,
    getAuthorContributions: async () => [GORVEK, NIGHTSHROUD, STABLE_BOY],
    getAuthorFileContributions: async (id: number) =>
      id === GORVEK.id ? GORVEK_FILES : [],
    ...overrides,
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
