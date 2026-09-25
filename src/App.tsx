import { Box, Text } from 'ink'
import { useMemo } from 'react'
import About from './components/About'
import BarbarianRankingBox from './components/BarbarianRankingBox'
import ErrorScreen from './components/ErrorScreen'
import ExitScreen from './components/ExitScreen'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'
import LongevityDashboard from './components/LongevityDashboard'
import MailmapDraft from './components/MailmapDraft'
import Menu, { type MenuOption } from './components/Menu'
import { Overview } from './components/Overview'
import RepoPathInput from './components/RepoPathInput'

import type { SnapshotInterval } from './services/snapshotSelection'
import { type WarriorSource, warriorSourceFor } from './services/WarriorSource'
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
  /** Commits for blame to look past, on top of `.git-blame-ignore-revs`. */
  ignoreRevisions?: string[]
  /** How many files may be blamed at once. */
  concurrency?: number
  /** Walk the history as well, and how. */
  history?: { interval: SnapshotInterval; maxSnapshots: number }
}

/**
 * Where the commits being looked past were named.
 *
 * Both sources at once is ordinary, and saying only one of them would be a
 * plain falsehood about where the numbers came from.
 */
function namedBy(sources: { file: boolean; flag: boolean }): string {
  if (sources.file && sources.flag) {
    return 'in .git-blame-ignore-revs and with --ignore-rev'
  }
  return sources.file ? 'in .git-blame-ignore-revs' : 'with --ignore-rev'
}

export default function App({
  repoPath: initialRepoPath,
  thresholdKB,
  useCache = true,
  refresh = false,
  authorPolicy = 'strict',
  ignoreRevisions,
  concurrency,
  history,
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
    isChangingRepo,
  } = useLineLordService(repoPath, largeFileThresholdBytes, {
    useCache,
    refresh,
    authorPolicy,
    ignoreRevisions,
    concurrency,
    history,
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

  const historyFailures = lineLordService?.isInitialized()
    ? lineLordService.getHistoryFailures()
    : []

  const cache = lineLordService?.isInitialized()
    ? lineLordService.getCacheStatus()
    : undefined

  const identityMerges = lineLordService?.isInitialized()
    ? lineLordService.getIdentityMerges()
    : []

  // One source for every screen that opens a warrior. Memoised, because a
  // new object each render would be a new dependency for the screen's load.
  const warriorSource: WarriorSource | null = useMemo(
    () =>
      isInitialized && lineLordService
        ? warriorSourceFor({
            db: lineLordService.getDatabase(),
            analysedRevision: lineLordService.getAnalysisContext().headSha,
          })
        : null,
    [lineLordService, isInitialized],
  )

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
              Blame was told to look past some commits, so the ownership on
              every screen is deliberately not what plain `git blame` would
              say. Nothing else on screen would explain the difference.
            */}
            {analysisContext && analysisContext.ignoredRevisionCount > 0 && (
              <Text color="gray">
                Looking past {analysisContext.ignoredRevisionCount} commit
                {analysisContext.ignoredRevisionCount === 1 ? '' : 's'} named{' '}
                {namedBy(analysisContext.ignoreRevSources)}, so their lines are
                credited to whoever wrote them
              </Text>
            )}

            {/*
              An entry git cannot resolve is left out rather than passed on:
              handed over, it makes git refuse the blame for every file. Say
              which, or the file looks like it is working.
            */}
            {analysisContext &&
              analysisContext.unresolvedIgnoreRevs.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text color="yellow">
                    ⚠ {analysisContext.unresolvedIgnoreRevs.length} entr
                    {analysisContext.unresolvedIgnoreRevs.length === 1
                      ? 'y names'
                      : 'ies name'}{' '}
                    no commit here and{' '}
                    {analysisContext.unresolvedIgnoreRevs.length === 1
                      ? 'was'
                      : 'were'}{' '}
                    left out:
                  </Text>
                  {analysisContext.unresolvedIgnoreRevs
                    .slice(0, 3)
                    .map((unresolved) => (
                      <Text key={unresolved.entry} color="gray">
                        {'  '}
                        {unresolved.entry} —{' '}
                        {unresolved.source === 'file'
                          ? 'in .git-blame-ignore-revs'
                          : 'given with --ignore-rev'}
                      </Text>
                    ))}
                  {analysisContext.unresolvedIgnoreRevs.length > 3 && (
                    <Text color="gray">
                      {'  '}… and{' '}
                      {analysisContext.unresolvedIgnoreRevs.length - 3} more
                    </Text>
                  )}
                </Box>
              )}

            {/*
              Who the guessing would have taken to be one person. Under the
              default nothing is merged, so this is shown rather than acted
              on -- a guess nobody can inspect is a guess nobody can correct,
              and these decide whose work is whose.
            */}
            {identityMerges.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">
                  ⚠ {identityMerges.length} contributor
                  {identityMerges.length === 1 ? '' : 's'} may have committed
                  under more than one address:
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
                  {'  '}Nothing was merged. Pick "Draft a .mailmap" below to
                  record the ones that are right.
                </Text>
              </Box>
            )}

            {/*
              A file the history could not read contributes no lines to the
              snapshot it belongs to, so a history that finished is not the
              same as a history that is whole.
            */}
            {historyFailures.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">
                  ⚠ The history could not read {historyFailures.length} file
                  {historyFailures.length === 1 ? '' : 's'}, so the snapshots
                  they belong to count fewer lines than were there:
                </Text>
                {historyFailures.slice(0, 3).map((failure) => (
                  <Text
                    key={`${failure.revision}:${failure.path}`}
                    color="gray"
                  >
                    {'  '}
                    {failure.path} at {failure.revision.slice(0, 7)} —{' '}
                    {failure.error.split('\n')[0]}
                  </Text>
                ))}
                {historyFailures.length > 3 && (
                  <Text color="gray">
                    {'  '}… and {historyFailures.length - 3} more
                  </Text>
                )}
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

          <Menu
            title="Select a feature:"
            options={menuOptions}
            onSelect={handleMenuSelect}
          />
        </Box>
      )}

      {state === 'longevity' && (
        <LongevityDashboard
          lineLordService={lineLordService}
          warriorSource={warriorSource}
          onBack={returnToMenu}
        />
      )}

      {state === 'mailmap' && (
        <MailmapDraft
          repoPath={repoPath}
          merges={identityMerges}
          onBack={returnToMenu}
        />
      )}

      {state === 'overview' && analysisService && warriorSource && (
        <Overview
          onBack={returnToMenu}
          largeFileThresholdKB={largeFileThresholdKB}
          analysisService={analysisService}
          warriorSource={warriorSource}
        />
      )}

      {state === 'about' && <About onBack={returnToMenu} />}

      {state === 'barbarianrankings' && (
        <BarbarianRankingBox
          onBack={returnToMenu}
          lineLordService={lineLordService}
          warriorSource={warriorSource}
        />
      )}
    </Layout>
  )
}
