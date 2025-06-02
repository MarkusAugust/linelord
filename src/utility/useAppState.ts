import { useEffect, useState } from 'react'
import { barbarianQuotes } from '../resources/barbarianQuotes'

export type AppState =
  | 'input-path'
  | 'menu'
  | 'repostats'
  | 'extendedrepostats'
  | 'singledevrepostats'
  | 'about'
  | 'exit'

export function useAppState(initialRepoPath?: string) {
  const [state, setState] = useState<AppState>(
    initialRepoPath ? 'menu' : 'input-path',
  )
  const [repoPath, setRepoPath] = useState<string>(initialRepoPath || '')
  const [farewell, setFarewell] = useState('')

  useEffect(() => {
    if (state === 'exit') {
      const randomQuote =
        barbarianQuotes[Math.floor(Math.random() * barbarianQuotes.length)] ||
        'Farewell!'
      setFarewell(randomQuote)

      setTimeout(() => {
        process.exit(0)
      }, 100)
    }
  }, [state])

  return {
    state,
    setState,
    repoPath,
    setRepoPath,
    farewell,
  }
}
