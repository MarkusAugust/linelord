import type { AnalysisStep } from '../analysisStep'
import { gallowmarkQuotes } from './gallowmarkQuotes'

// The pools live in the Gallowmark canon; see gallowmarkQuotes.ts.
export const barbarianInitializingMessages = gallowmarkQuotes.initializing
export const barbarianScanningMessages = gallowmarkQuotes.scanning
export const barbarianAnalyzingMessages = gallowmarkQuotes.analyzing
export const barbarianCompleteMessages = gallowmarkQuotes.complete

// Function to get random message for each state
export const getRandomBarbarianMessage = (step: AnalysisStep): string => {
  switch (step) {
    case 'initializing':
      return (
        barbarianInitializingMessages[
          Math.floor(Math.random() * barbarianInitializingMessages.length)
        ] || 'By the old gods, we begin...'
      )
    case 'scanning':
      return (
        barbarianScanningMessages[
          Math.floor(Math.random() * barbarianScanningMessages.length)
        ] || 'Crushing enemies...'
      )
    case 'analyzing':
      return (
        barbarianAnalyzingMessages[
          Math.floor(Math.random() * barbarianAnalyzingMessages.length)
        ] || 'Counting spoils...'
      )
    case 'complete':
      return (
        barbarianCompleteMessages[
          Math.floor(Math.random() * barbarianCompleteMessages.length)
        ] || 'By the old gods, the analysis is complete!'
      )
    default:
      return 'By the old gods, the analysis is complete!'
  }
}
