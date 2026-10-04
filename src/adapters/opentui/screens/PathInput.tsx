import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { useState } from 'react'
import { useScreenKeys } from '../keys'
import { C } from '../theme'

function normalise(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return process.cwd()
  const expanded =
    trimmed === '~' || trimmed.startsWith('~/')
      ? trimmed.replace(/^~/, homedir())
      : trimmed
  return resolve(expanded)
}

/** Which repository to march on. Typed as text, so the keymap stands aside. */
export function PathInput({
  canCancel,
  onSubmit,
  onCancel,
}: {
  canCancel: boolean
  onSubmit: (path: string) => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const target = normalise(typed)
  const take = (text: string) => {
    setTyped((at) => at + text)
    setError(null)
  }

  useScreenKeys({
    // A pasted path arrives as one piece, not as keys; a line break copied
    // with it is not part of the path.
    paste: (text) => take(text.replace(/[\r\n]+/g, '').trim()),
    hint: `type a path · Enter march on it · Ctrl-u clear${canCancel ? ' · Esc back' : ' · Esc leave'}`,
    raw: (key) => {
      if (key.name === 'escape') return onCancel()
      if (key.name === 'return') {
        if (!existsSync(target)) return setError(`No such directory: ${target}`)
        if (!existsSync(join(target, '.git')))
          return setError(`Not a git repository: ${target}`)
        return onSubmit(target)
      }
      if (key.name === 'backspace') {
        setTyped((at) => at.slice(0, -1))
        setError(null)
        return
      }
      if (key.ctrl && key.name === 'u') {
        setTyped('')
        return
      }
      if (
        !key.ctrl &&
        key.sequence.length >= 1 &&
        key.sequence >= ' ' &&
        !key.sequence.startsWith('\x1b')
      ) {
        take(key.sequence)
      }
    },
  })

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 2 }}>
      <box
        title=" 🧭 Which realm shall Gorvek survey? "
        style={{
          border: true,
          borderColor: C.green,
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <text>
          <span fg={C.gray}>Path </span>
          <span fg={C.green}>{`${typed}█`}</span>
        </text>
        <text fg={C.dim} style={{ marginTop: 1 }}>{`Will use: ${target}`}</text>
        {error && (
          <text fg={C.red} style={{ marginTop: 1 }}>{`⚠ ${error}`}</text>
        )}
        <text fg={C.dim} style={{ marginTop: 1 }}>
          Leave it empty for the current directory. ~/code/project,
          /absolute/path and ../relative all work.
        </text>
      </box>
    </box>
  )
}
