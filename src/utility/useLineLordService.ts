import { useEffect, useRef, useState } from 'react'
import { getRandomBarbarianMessage } from '../resources/barbarianAnalysisMessages'
import { LineLordService } from '../services/LineLordService'
import type { SnapshotInterval } from '../services/snapshotSelection'

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
    history?: { interval: SnapshotInterval; maxSnapshots: number }
  } = {},
) {
  const {
    useCache = true,
    refresh = false,
    authorPolicy = 'strict',
    concurrency,
    history,
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

    // An analysis takes seconds to minutes, and every callback below writes
    // state when it finishes. Two things can happen in that window: the app
    // can exit, or the user can change repository again.
    let cancelled = false

    const handleProgress = (
      current: number,
      total: number,
      message: string,
    ) => {
      if (cancelled) return
      setInitProgress({ current, total, message })
    }

    // A pass over the repository per snapshot, so the count is the honest
    // warning: somebody who asked for sixty of them should be able to see
    // that before deciding to wait.
    const handleHistoryProgress = (
      current: number,
      total: number,
      message: string,
    ) => {
      if (cancelled) return
      setInitProgress({
        current,
        total,
        message: `${message} — reading the history takes a pass over the repository each time`,
      })
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

    setIsInitialized(false)
    setInitError(null)
    setInitializingMessage(getRandomBarbarianMessage('initializing'))
    setInitProgress({ current: 0, total: 100, message: 'Starting...' })

    // A service of its own for each repository, rather than one that is told
    // to switch. Switching replaced the database and the git service on the
    // object a running analysis was still using, so an abandoned run could
    // carry on against the repository that replaced it -- and suppressing its
    // callbacks does nothing about that. An abandoned service here is simply
    // one nobody reads.
    //
    // The one place that turns the cache on. Everywhere else -- tests
    // included -- gets an analysis that leaves nothing behind.
    const service = new LineLordService(repoPath, thresholdBytes, {
      useCache,
      refresh,
      authorPolicy,
      ignoreRevisions: ignoreRevisions ? ignoreRevisions.split(' ') : [],
      concurrency,
      history,
    })
    setLineLordService(service)

    // The history is walked after the present, not instead of it: the screens
    // that only need HEAD are ready either way, and the walk is the part that
    // can take minutes.
    service
      .initialize(handleProgress)
      .then(() => service.gatherHistory(handleHistoryProgress))
      .then(handleSuccess)
      .catch(handleError)

    return () => {
      cancelled = true
    }
    // lineLordService is deliberately not a dependency. Setting it re-renders,
    // and with it in the list that re-render tears this effect down and
    // starts another -- cancelling the very run it had just begun, so the
    // first load never finished and the loading screen stayed up for good.
  }, [
    repoPath,
    thresholdBytes,
    useCache,
    refresh,
    authorPolicy,
    ignoreRevisions,
    concurrency,
  ])

  // Whether this is a switch rather than a first analysis, which is all the
  // loading screen needs to know. Read from a ref because it must not itself
  // cause a render.
  const hasAnalysedBefore = useRef(false)
  useEffect(() => {
    if (isInitialized) hasAnalysedBefore.current = true
  }, [isInitialized])

  return {
    lineLordService,
    isInitialized,
    isChangingRepo: hasAnalysedBefore.current && !isInitialized,
    initializingMessage,
    initError,
    initProgress,
  }
}
