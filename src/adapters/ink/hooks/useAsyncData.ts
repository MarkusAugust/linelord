import { type DependencyList, useEffect, useState } from 'react'

/** What a screen knows about the thing it asked for. */
export type AsyncData<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: string }

/**
 * Load something once for a screen, and forget the answer if the screen has
 * gone before it arrives.
 *
 * Every screen used to write its own version of this, and the versions did
 * not agree: some guarded against a result landing after the screen had been
 * left, and some wrote it straight into a component Ink had already torn
 * down. The one thing a loading state must never do is stay on screen for
 * good, so a rejection becomes a message rather than silence.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
): AsyncData<T> {
  const [state, setState] = useState<AsyncData<T>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data })
      },
      (caught: unknown) => {
        if (!cancelled) {
          setState({
            status: 'failed',
            error: caught instanceof Error ? caught.message : String(caught),
          })
        }
      },
    )

    return () => {
      cancelled = true
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: the caller names what the load depends on, the way useEffect itself does
  }, deps)

  return state
}
