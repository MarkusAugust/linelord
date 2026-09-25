// Shared analysis step types used across the application
export type AnalysisStep =
  | 'initializing'
  | 'scanning'
  | 'analyzing'
  | 'complete'

// Type guard to check if a string is a valid AnalysisStep
export const isAnalysisStep = (step: string): step is AnalysisStep => {
  return ['initializing', 'scanning', 'analyzing', 'complete'].includes(step)
}

// Helper to get display name for each step
export const getStepDisplayName = (step: AnalysisStep): string => {
  switch (step) {
    case 'initializing':
      return 'Initializing'
    case 'scanning':
      return 'Scanning Files'
    case 'analyzing':
      return 'Analyzing Data'
    case 'complete':
      return 'Complete'
    default:
      return 'Unknown'
  }
}

// Analysis state interface that can be reused
export interface BaseAnalysisState {
  isLoading: boolean
  step: AnalysisStep
  progress: number
  processedFiles?: number
  totalFiles?: number
  error: string | null
}

// Gorvek's brutal barbarian warrior metrics.
//
// Every field counts lines that are still alive in HEAD. None of them counts
// commits, and none of them says anything about when in the day or week the
// work happened -- see the note on honesty in BarbarianAnalysisService.
export interface BarbarianWarriorMetrics {
  /** Lines this warrior owns in HEAD. Zero means they hold no ground at all. */
  survivingLines: number
  /** Surviving lines that sit in large or legacy-looking files. */
  battleScars: number
  /** Files where this warrior owns more than half the surviving lines. */
  territoryConquered: number
  /** Files where every surviving line is theirs. */
  soloQuestVictories: number
  /** Distinct file extensions they have surviving lines in. */
  weaponMastery: number
  /** Surviving lines last touched more than a year ago. */
  ancientCodeSurvival: number
  /** Days on which more than 100 of their surviving lines were last touched. */
  massiveBattles: number
  /** Distinct days on which any of their surviving lines were last touched. */
  totalCampaigns: number
}

export interface BarbarianRanking {
  authorId: number
  name: string
  email: string
  displayName: string
  metrics: BarbarianWarriorMetrics
  gorvekScore: number
  /**
   * The title the line-share ranking gave them, the same one every other
   * screen shows. There used to be a second distribution here, by Gorvek
   * score, so one person wore two titles depending on the screen.
   */
  title: string | null
  specialAchievements: string[]
  /** Zero-based position in the ranking. */
  rank: number
}
