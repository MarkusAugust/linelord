import { Box, Text } from 'ink'
import About from './components/About'
import { AuthorsList } from './components/AuthorList'
import BarbarianRankingBox from './components/BarbarianRankingBox'
import ErrorScreen from './components/ErrorScreen'
import ExitScreen from './components/ExitScreen'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'
import Menu, { type MenuOption } from './components/Menu'
import RepoPathInput from './components/RepoPathInput'
import RepoStats from './components/RepoStats'
import SimpleRepoStats from './components/SimpleRepoStats'
import SingleDevRepoStats from './components/SingleDevRepoStats'

import { menuOptions } from './utility/menuOptions'
import { clearTerminal } from './utility/terminal'
import { convertThresholdKBToBytes } from './utility/thresholdConverter'
import { type AppState, useAppState } from './utility/useAppState'
import { useErrorHandler } from './utility/useErrorHandler'
import { useLineLordService } from './utility/useLineLordService'

type AppProps = {
  repoPath?: string
  thresholdKB?: number
  /** Whether the analysis may be stored and reused between runs. */
  useCache?: boolean
  /** Ignore what is stored and read the repository again. */
  refresh?: boolean
  /** How identities are matched: by address alone, or by guessing as well. */
  authorPolicy?: 'strict' | 'loose'
}

export default function App({
  repoPath: initialRepoPath,
  thresholdKB,
  useCache = true,
  refresh = false,
  authorPolicy = 'strict',
}: AppProps) {
  const { state, setState, repoPath, setRepoPath, farewell } =
    useAppState(initialRepoPath)

  const {
    thresholdKB: largeFileThresholdKB,
    thresholdBytes: largeFileThresholdBytes,
  } = convertThresholdKBToBytes(thresholdKB, 50)

  const {
    lineLordService,
    isInitialized,
    initializingMessage,
    initError,
    initProgress,
  } = useLineLordService(repoPath, largeFileThresholdBytes, {
    useCache,
    refresh,
    authorPolicy,
  })

  const handleClearError = () => {
    setRepoPath('')
    setState('input-path')
  }

  useErrorHandler(repoPath, initError, handleClearError)

  const analysisService = lineLordService?.isInitialized()
    ? lineLordService.getAnalysisService()
    : undefined

  const analysisContext = lineLordService?.isInitialized()
    ? lineLordService.getAnalysisContext()
    : undefined

  const failures = lineLordService?.isInitialized()
    ? lineLordService.getFailures()
    : []

  const cache = lineLordService?.isInitialized()
    ? lineLordService.getCacheStatus()
    : undefined

  const identityMerges = lineLordService?.isInitialized()
    ? lineLordService.getIdentityMerges()
    : []

  const handleMenuSelect = (option: MenuOption) => {
    if (option.value === 'exit') {
      clearTerminal()
      setState('exit')
    } else if (option.value === 'change-repo') {
      clearTerminal()
      setState('input-path')
    } else {
      clearTerminal()
      setState(option.value as AppState)
    }
  }

  const returnToMenu = () => {
    clearTerminal()
    setState('menu')
  }

  const handlePathSubmit = (path: string) => {
    setRepoPath(path)
    setState('menu')
  }

  const handlePathCancel = () => {
    if (repoPath) {
      setState('menu')
    } else {
      setState('exit')
    }
  }

  // Show error screen if initialization failed
  if (repoPath && initError) {
    return <ErrorScreen error={initError} />
  }

  // If in exit state, render the farewell screen without Layout
  if (state === 'exit') {
    return <ExitScreen quote={farewell} />
  }

  // Show loading screen during initialization
  if (repoPath && lineLordService && !isInitialized && !initError) {
    const isChangingRepo = lineLordService.getCurrentRepoPath() !== repoPath
    return (
      <LoadingScreen
        message={initializingMessage}
        progress={initProgress}
        isChangingRepo={isChangingRepo}
      />
    )
  }

  // For all other states, use the Layout
  return (
    <Layout>
      {state === 'input-path' && (
        <RepoPathInput
          onSubmit={handlePathSubmit}
          onCancel={handlePathCancel}
        />
      )}

      {state === 'menu' && (
        <Box flexDirection="column">
          <Box marginBottom={1} flexDirection="column">
            <Text>
              Repository:{' '}
              <Text color="green" bold>
                {repoPath}
              </Text>
            </Text>

            {analysisContext?.headSha && (
              <Text color="gray">
                Analysing HEAD ({analysisContext.headSha.slice(0, 7)})
                {analysisContext.uncommittedFileCount > 0 &&
                  ` · ${analysisContext.uncommittedFileCount} file${
                    analysisContext.uncommittedFileCount === 1 ? '' : 's'
                  } have uncommitted changes that are not counted`}
              </Text>
            )}

            {/*
              Where these numbers came from. Someone looking at an analysis
              that appeared instantly should be able to see that it was
              stored rather than wonder whether it is current.
            */}
            {cache && cache.mode !== 'disabled' && (
              <Text color="gray">
                {cache.mode === 'reused'
                  ? `Reused the stored analysis of ${cache.filesReused} file${cache.filesReused === 1 ? '' : 's'}`
                  : cache.mode === 'incremental'
                    ? `Re-read ${cache.filesBlamed} changed file${cache.filesBlamed === 1 ? '' : 's'}, reused the stored analysis of ${cache.filesReused}`
                    : cache.reason
                      ? `Analysed everything again: ${cache.reason}`
                      : `Analysed ${cache.filesBlamed} file${cache.filesBlamed === 1 ? '' : 's'}`}
              </Text>
            )}

            {/*
              Every assumption --fuzzy-authors made, shown rather than taken.
              A guess nobody can inspect is a guess nobody can correct, and
              these decide whose work is whose.
            */}
            {identityMerges.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">
                  ⚠ Guessed that {identityMerges.length} contributor
                  {identityMerges.length === 1 ? '' : 's'} committed under more
                  than one address:
                </Text>
                {identityMerges.slice(0, 3).map((merge) => (
                  <Box key={merge.canonical.email} flexDirection="column">
                    <Text color="gray">
                      {'  '}
                      {merge.canonical.name} &lt;{merge.canonical.email}&gt;
                    </Text>
                    {merge.absorbed.map((absorbed) => (
                      <Text key={absorbed.email} color="gray">
                        {'    ← '}
                        {absorbed.email} — {absorbed.reason}
                      </Text>
                    ))}
                  </Box>
                ))}
                {identityMerges.length > 3 && (
                  <Text color="gray">
                    {'  '}… and {identityMerges.length - 3} more
                  </Text>
                )}
                <Text color="gray">
                  {'  '}Run with --write-mailmap to record the ones that are
                  right.
                </Text>
              </Box>
            )}

            {/*
              A file that could not be read is missing from every number on
              every screen. Saying so here is the whole point of collecting
              these rather than printing them into the middle of the UI.
            */}
            {failures.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">
                  ⚠ {failures.length} file{failures.length === 1 ? '' : 's'}{' '}
                  could not be analysed and{' '}
                  {failures.length === 1 ? 'is' : 'are'} missing from these
                  numbers:
                </Text>
                {failures.slice(0, 3).map((failure) => (
                  <Text key={failure.path} color="gray">
                    {'  '}
                    {failure.path} — {failure.error.split('\n')[0]}
                  </Text>
                ))}
                {failures.length > 3 && (
                  <Text color="gray">
                    {'  '}… and {failures.length - 3} more
                  </Text>
                )}
              </Box>
            )}
          </Box>

          {analysisService && <AuthorsList analysisService={analysisService} />}

          <Menu
            title="Select a feature:"
            options={menuOptions}
            onSelect={handleMenuSelect}
          />
        </Box>
      )}

      {state === 'repostats' && (
        <SimpleRepoStats
          repoPath={repoPath}
          onBack={returnToMenu}
          largeFileThresholdKB={largeFileThresholdKB}
          analysisService={analysisService}
        />
      )}

      {state === 'extendedrepostats' && (
        <RepoStats
          repoPath={repoPath}
          onBack={returnToMenu}
          largeFileThresholdKB={largeFileThresholdKB}
          analysisService={analysisService}
        />
      )}

      {state === 'singledevrepostats' && (
        <SingleDevRepoStats
          repoPath={repoPath}
          onBack={returnToMenu}
          analysisService={analysisService}
        />
      )}

      {state === 'about' && <About onBack={returnToMenu} />}

      {state === 'barbarianrankings' && (
        <BarbarianRankingBox
          onBack={returnToMenu}
          lineLordService={lineLordService}
        />
      )}
    </Layout>
  )
}
