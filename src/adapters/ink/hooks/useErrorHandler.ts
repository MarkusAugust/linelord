import { useInput } from 'ink'

export function useErrorHandler(
  repoPath: string,
  initError: string | null,
  onClearError: () => void,
) {
  useInput((_input, _key) => {
    if (repoPath && initError) {
      onClearError()
    }
  })
}
