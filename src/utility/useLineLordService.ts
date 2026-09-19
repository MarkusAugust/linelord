import { useEffect, useState } from 'react'
import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import { LineLordService } from '../services/LineLordService'

interface InitProgress {
  current: number
  total: number
  message: string
}

export function useLineLordService(
  repoPath: string,
  thresholdBytes: number,
  options: { useCache?: boolean; refresh?: boolean } = {},
) {
  const { useCache = true, refresh = false } = options
  const [lineLordService, setLineLordService] =
    useState<LineLordService | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initializingMessage, setInitializingMessage] = useState('')
  const [initError, setInitError] = useState<string | null>(null)
  const [initProgress, setInitProgress] = useState<InitProgress>({
    current: 0,
    total: 100,
    message: '',
  })

  useEffect(() => {
    if (!repoPath) return

    setInitError(null)

    const handleProgress = (
      current: number,
      total: number,
      message: string,
    ) => {
      setInitProgress({ current, total, message })
    }

    const handleSuccess = () => {
      setIsInitialized(true)
      setInitError(null)
    }

    const handleError = (error: unknown) => {
      // No console while Ink holds the terminal; the message reaches the user
      // through initError, which App renders as the error screen.
      setInitError(error instanceof Error ? error.message : String(error))
      setIsInitialized(false)
    }

    if (lineLordService && lineLordService.getCurrentRepoPath() !== repoPath) {
      // Repository path changed, reinitialize with new repo
      setIsInitialized(false)
      setInitializingMessage(getRandomBarbarianMessage('initializing'))
      setInitProgress({
        current: 0,
        total: 100,
        message: 'Switching repositories...',
      })

      lineLordService
        .changeRepository(repoPath, handleProgress, thresholdBytes)
        .then(handleSuccess)
        .catch(handleError)
    } else if (!lineLordService) {
      // Create new service for the first time
      setInitializingMessage(getRandomBarbarianMessage('initializing'))
      // The one place that turns the cache on. Everywhere else -- tests
      // included -- gets an analysis that leaves nothing behind.
      const service = new LineLordService(repoPath, thresholdBytes, {
        useCache,
        refresh,
      })
      setLineLordService(service)

      service.initialize(handleProgress).then(handleSuccess).catch(handleError)
    }
  }, [repoPath, lineLordService, thresholdBytes, useCache, refresh])

  return {
    lineLordService,
    isInitialized,
    initializingMessage,
    initError,
    initProgress,
  }
}
