import { Box, Text } from 'ink'
import About from './components/About'
import { AuthorsList } from './components/AuthorList'
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
}

export default function App({
  repoPath: initialRepoPath,
  thresholdKB,
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
  } = useLineLordService(repoPath, largeFileThresholdBytes)

  const handleClearError = () => {
    setRepoPath('')
    setState('input-path')
  }

  useErrorHandler(repoPath, initError, handleClearError)

  const analysisService = lineLordService?.isInitialized()
    ? lineLordService.getAnalysisService()
    : undefined

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
          <Box marginBottom={1}>
            <Text>
              Repository:{' '}
              <Text color="green" bold>
                {repoPath}
              </Text>
            </Text>
          </Box>

          {analysisService && (
            <AuthorsList
              repoPath={repoPath}
              analysisService={analysisService}
            />
          )}

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
    </Layout>
  )
}
