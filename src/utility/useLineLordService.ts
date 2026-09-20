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
  options: {
    useCache?: boolean
    refresh?: boolean
    authorPolicy?: 'strict' | 'loose'
    ignoreRevisions?: string[]
    concurrency?: number
  } = {},
) {
  const {
    useCache = true,
    refresh = false,
    authorPolicy = 'strict',
    concurrency,
  } = options
  // Joined for the dependency list below: a new array each render would
  // otherwise re-create the service on every one of them.
  const ignoreRevisions = (options.ignoreRevisions ?? []).join(' ')
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

    // An analysis takes seconds to minutes, and every one of the callbacks
    // below writes state when it finishes. Two things can happen in that
    // window: the app can exit, or the user can change repository again. The
    // second is the one that shows: the abandoned run reports success, and
    // the screen then presents the previous repository's analysis as ready
    // under the new repository's name.
    let cancelled = false

    setInitError(null)

    const handleProgress = (
      current: number,
      total: number,
      message: string,
    ) => {
      if (cancelled) return
      setInitProgress({ current, total, message })
    }

    const handleSuccess = () => {
      if (cancelled) return
      setIsInitialized(true)
      setInitError(null)
    }

    const handleError = (error: unknown) => {
      if (cancelled) return
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
        authorPolicy,
        ignoreRevisions: ignoreRevisions ? ignoreRevisions.split(' ') : [],
        concurrency,
      })
      setLineLordService(service)

      service.initialize(handleProgress).then(handleSuccess).catch(handleError)
    }

    return () => {
      cancelled = true
    }
  }, [
    repoPath,
    lineLordService,
    thresholdBytes,
    useCache,
    refresh,
    authorPolicy,
    ignoreRevisions,
    concurrency,
  ])

  return {
    lineLordService,
    isInitialized,
    initializingMessage,
    initError,
    initProgress,
  }
}
