import {
  type AuthorFileLongevity,
  type AuthorLongevity,
  type AuthorSurvivalWithIdentity,
  ageOfAuthors,
  filesByAge,
  type HistoryReading,
  survivalByAuthor,
} from '../core/longevity'
import type { AnalysisData } from '../core/model'
import {
  type AuthorContribution,
  authorContributions,
  type FileContribution,
  fileContributions,
} from '../core/ownership'

/**
 * Everything the warrior screen wants to know about one person.
 *
 * An interface rather than the functions themselves, so that the screen can
 * be drawn from fixed answers in a test, and so that the three screens that
 * open a warrior -- the overview, the longevity table and the rankings --
 * hand over the same thing.
 */
export interface WarriorSource {
  /** Their share of the analysed revision, or null if they hold nothing in it. */
  share(authorId: number): Promise<AuthorContribution | null>
  /** The files they hold the most lines in, largest first. */
  files(authorId: number): Promise<FileContribution[]>
  /** How old what they hold is, or null if they hold no dated line. */
  age(authorId: number): Promise<AuthorLongevity | null>
  /** The files where their oldest code sits. */
  oldestFiles(authorId: number): Promise<AuthorFileLongevity[]>
  /**
   * What the history walk found about them, or null when there is no history
   * about the revision being analysed. A history about some other revision
   * is refused rather than drawn, the same as the longevity table does.
   */
  survival(authorId: number): Promise<AuthorSurvivalWithIdentity | null>
}

export function warriorSourceFor(options: {
  /** The analysis as values, which everything here is read off. */
  data: AnalysisData
  history: HistoryReading
  /**
   * The revision the analysis describes, which the history must match. Null
   * when the analysis named none, and then no history can be about it.
   */
  analysedRevision: string | null
  now?: Date
}): WarriorSource {
  const now = options.now ?? new Date()

  return {
    async share(authorId) {
      return (
        authorContributions(options.data).find((one) => one.id === authorId) ??
        null
      )
    },

    async files(authorId) {
      return fileContributions(options.data, authorId)
    },

    async age(authorId) {
      return (
        ageOfAuthors(options.data, now).find(
          (one) => one.authorId === authorId,
        ) ?? null
      )
    },

    async oldestFiles(authorId) {
      return filesByAge(options.data, authorId, now)
    },

    async survival(authorId) {
      if (
        options.analysedRevision === null ||
        options.history.describes !== options.analysedRevision
      ) {
        return null
      }
      return (
        survivalByAuthor(options.history.history, options.data.authors).find(
          (one) => one.authorId === authorId,
        ) ?? null
      )
    },
  }
}
