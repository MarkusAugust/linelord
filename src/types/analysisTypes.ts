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
