import type { ScrollBoxRenderable } from '@opentui/core'
import { useEffect, useId, useRef, useState } from 'react'
import type { Action } from './keymap'
import type { Handled } from './keys'

/**
 * A list with a selection that the arrows, vim's keys, search and `:42` all
 * move, and a scrollbox that keeps the selection on screen.
 */
export function useList<T>(
  items: T[],
  textOf: (item: T) => string,
  initial = 0,
) {
  const [selected, setSelected] = useState(
    Math.max(0, Math.min(initial, items.length - 1)),
  )
  const [search, setSearch] = useState('')
  const scroll = useRef<ScrollBoxRenderable>(null)
  const prefix = useId()
  const last = Math.max(0, items.length - 1)

  // The list can shrink under the selection, after a merge for one.
  useEffect(() => {
    if (selected > last) setSelected(last)
  }, [selected, last])

  const answersTo = (item: T, text: string) =>
    textOf(item).toLowerCase().includes(text.toLowerCase())
  // Worked out on every render: a few hundred string comparisons at most.
  const matches = search
    ? items.flatMap((item, index) => (answersTo(item, search) ? [index] : []))
    : []

  const idOf = (index: number) => `${prefix}-${index}`
  useEffect(() => {
    scroll.current?.scrollChildIntoView(idOf(selected))
  })

  const page = () => Math.max(1, (scroll.current?.viewport.height ?? 10) - 1)
  const clamp = (at: number) => Math.min(last, Math.max(0, at))

  function act(action: Action): Handled {
    switch (action.type) {
      case 'move':
        setSelected((at) => clamp(at + action.by))
        return true
      case 'page':
        setSelected((at) => clamp(at + action.by * page()))
        return true
      case 'halfPage':
        setSelected((at) => clamp(at + action.by * Math.ceil(page() / 2)))
        return true
      case 'top':
        setSelected(0)
        return true
      case 'bottom':
        setSelected(last)
        return true
      case 'searchPreview':
      case 'search': {
        setSearch(action.text)
        if (!action.text) return true
        const found = items.findIndex((item) => answersTo(item, action.text))
        if (found >= 0) setSelected(found)
        else if (action.type === 'search')
          return { status: `Nothing here answers to "${action.text}"` }
        return true
      }
      case 'cancelSearch':
        setSearch('')
        return true
      case 'nextMatch':
      case 'previousMatch': {
        if (!search) return { status: 'Nothing searched for yet — / to search' }
        if (matches.length === 0)
          return { status: `Nothing here answers to "${search}"` }
        // Round the end and back to the start, as vim's search does.
        const next =
          action.type === 'nextMatch'
            ? (matches.find((at) => at > selected) ?? matches[0])
            : (matches.findLast((at) => at < selected) ?? matches.at(-1))
        if (next !== undefined) setSelected(next)
        return true
      }
      case 'jump':
        if (action.to < 1 || action.to > items.length) {
          return { status: `There are ${items.length}, not ${action.to}` }
        }
        setSelected(action.to - 1)
        return true
      default:
        return false
    }
  }

  return {
    selected,
    setSelected,
    matches,
    search,
    scroll,
    idOf,
    act,
    chosen: items[selected],
  }
}

/** Keys for a screen that is one long page: they scroll it, a line or a page at a time. */
export function useScrollPage() {
  const scroll = useRef<ScrollBoxRenderable>(null)
  const page = () => Math.max(1, (scroll.current?.viewport.height ?? 10) - 2)
  function act(action: Action): Handled {
    const box = scroll.current
    if (!box) return false
    switch (action.type) {
      case 'move':
        box.scrollTop += action.by
        return true
      case 'page':
        box.scrollTop += action.by * page()
        return true
      case 'halfPage':
        box.scrollTop += action.by * Math.ceil(page() / 2)
        return true
      case 'top':
        box.scrollTop = 0
        return true
      case 'bottom':
        // The last page, not past it: scrollHeight alone scrolls everything out of sight.
        box.scrollTop = Math.max(0, box.scrollHeight - box.viewport.height)
        return true
      default:
        return false
    }
  }
  return { scroll, act }
}
