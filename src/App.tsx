import { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Menu, { type MenuOption } from './components/Menu'
import RepoStats from './components/RepoStats'
import SingleDevRepoStats from './components/SingleDevRepoStats'
import Layout from './components/Layout'
import RepoPathInput from './components/RepoPathInput'
import { barbarianQuotes } from './resources/barbarianQuotes'
import { AuthorsList } from './components/AuthorList'
import { clearTerminal } from './utility/terminal'
import About from './components/About'
import ExitScreen from './components/ExitScreen'

import { LineLordService } from './services/LineLordService'
import { convertThresholdKBToBytes } from './utility/thresholdConverter'
import SimpleRepoStats from './components/SampleRepoStats'
import { getRandomBarbarianMessage } from './resources/barbarianAnalysisMessages'

type AppProps = {
  repoPath?: string
  thresholdKB?: number
}

type AppState =
  | 'input-path'
  | 'menu'
  | 'repostats'
  | 'extendedrepostats'
  | 'singledevrepostats'
  | 'about'
  | 'exit'

export default function App({
  repoPath: initialRepoPath,
  thresholdKB
}: AppProps) {
  const [lineLordService, setLineLordService] =
    useState<LineLordService | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initializingMessage, setInitializingMessage] = useState('')
  const [initProgress, setInitProgress] = useState({
    current: 0,
    total: 100,
    message: ''
  })

  const {
    thresholdKB: largeFileThresholdKB,
    thresholdBytes: largeFileThresholdBytes
  } = convertThresholdKBToBytes(thresholdKB, 50)

  const [state, setState] = useState<AppState>(
    initialRepoPath ? 'menu' : 'input-path'
  )
  const [repoPath, setRepoPath] = useState<string>(initialRepoPath || '')
  const [farewell, setFarewell] = useState('')

  useEffect(() => {
    if (repoPath) {
      if (
        lineLordService &&
        lineLordService.getCurrentRepoPath() !== repoPath
      ) {
        // Repository path changed, reinitialize with new repo
        setIsInitialized(false)
        setInitializingMessage(getRandomBarbarianMessage('initializing'))
        setInitProgress({
          current: 0,
          total: 100,
          message: 'Switching repositories...'
        })

        lineLordService
          .changeRepository(
            repoPath,
            (current, total, message) => {
              setInitProgress({ current, total, message })
            },
            largeFileThresholdBytes
          )
          .then(() => {
            setIsInitialized(true)
          })
          .catch(console.error)
      } else if (!lineLordService) {
        // Create new service for the first time
        setInitializingMessage(getRandomBarbarianMessage('initializing'))
        const service = new LineLordService(repoPath, largeFileThresholdBytes)
        setLineLordService(service)

        service
          .initialize((current, total, message) => {
            setInitProgress({ current, total, message })
          })
          .then(() => {
            setIsInitialized(true)
          })
          .catch(console.error)
      }
    }
  }, [repoPath, lineLordService, largeFileThresholdBytes])

  const analysisService = lineLordService?.isInitialized()
    ? lineLordService.getAnalysisService()
    : undefined

  useEffect(() => {
    if (state === 'exit') {
      // Choose a random farewell quote when entering exit state
      const randomQuote =
        barbarianQuotes[Math.floor(Math.random() * barbarianQuotes.length)] ??
        'Farewell!'
      setFarewell(randomQuote)

      // Exit after giving time to read (optional)
      setTimeout(() => {
        process.exit(0)
      }, 100)
    }
  }, [state])

  const handleMenuSelect = (option: MenuOption) => {
    if (option.value === 'exit') {
      clearTerminal() // Clear before switching
      setState('exit')
    } else if (option.value === 'change-repo') {
      clearTerminal() // Clear before switching
      setState('input-path')
    } else {
      clearTerminal() // Clear before entering features
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
      // If we already have a repo path, return to menu
      setState('menu')
    } else {
      // If no repo path set, exit the app
      setState('exit')
    }
  }

  const menuOptions: MenuOption[] = [
    { label: 'Repository Statistics', value: 'repostats' },
    { label: 'Extended Repository Statistics', value: 'extendedrepostats' },
    {
      label: 'Single Developer Repository Statistics',
      value: 'singledevrepostats'
    },
    { label: 'Change Repository', value: 'change-repo' },
    { label: 'About', value: 'about' },
    { label: 'Exit', value: 'exit' }
  ]

  // If in exit state, render the farewell screen without Layout
  if (state === 'exit') {
    return <ExitScreen quote={farewell} />
  }

  // Show loading screen during initialization
  if (repoPath && lineLordService && !isInitialized) {
    return (
      <Layout>
        <Box flexDirection="column" paddingBottom={1}>
          <Text bold>
            {lineLordService.getCurrentRepoPath() === repoPath
              ? initializingMessage
              : 'Switching repositories...'}
          </Text>
          <Box paddingTop={1}>
            <Text>Progress: {initProgress.current.toFixed(0)}%</Text>
          </Box>
          <Box paddingTop={1}>
            <Text>{initProgress.message}</Text>
          </Box>
        </Box>
      </Layout>
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
          largeFileThresholdBytes={largeFileThresholdBytes}
          largeFileThresholdKB={largeFileThresholdKB}
          analysisService={analysisService}
        />
      )}

      {state === 'about' && <About onBack={returnToMenu} />}
    </Layout>
  )
}
