import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { bar } from '../bars'
import { useScreenKeys } from '../keys'
import { bannerAsciiLarge, bannerAsciiSmall } from '../resources/asciiArt'
import { C } from '../theme'

export function Loading({
  fraction,
  message,
  quote,
  walkingHistory,
}: {
  fraction: number
  message: string
  quote: string
  walkingHistory: boolean
}) {
  const { width, height } = useTerminalDimensions()
  useScreenKeys({
    hint: walkingHistory
      ? 'walking the history: a pass over the repository for each snapshot · :q quit'
      : ':q quit',
  })
  const banner =
    height >= 20 && width >= 70 ? bannerAsciiLarge : bannerAsciiSmall
  return (
    <box
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {banner.map((line) => (
        <text key={line} fg={C.green} wrapMode="none">
          {line}
        </text>
      ))}
      <text
        fg={C.yellow}
        attributes={TextAttributes.ITALIC}
        style={{ marginTop: 1 }}
      >{`"${quote}"`}</text>
      <text wrapMode="none" style={{ marginTop: 1 }}>
        <span fg={walkingHistory ? C.orange : C.green}>
          {bar(fraction, 40)}
        </span>
        <span fg={C.gray}>{`${Math.round(fraction * 100)}%`.padStart(5)}</span>
      </text>
      <text fg={C.dim} wrapMode="none">
        {walkingHistory ? `⏳ ${message}` : message}
      </text>
    </box>
  )
}

export function Failed({ error }: { error: string }) {
  useScreenKeys({
    hint: 'Enter choose a realm — the same one again, or another · :q quit',
  })
  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 2 }}>
      <box
        title=" 💀 By the Ashfall! The realm could not be read "
        style={{
          border: true,
          borderColor: C.red,
          flexDirection: 'column',
          padding: 1,
        }}
      >
        <text fg={C.red}>{error}</text>
        <text fg={C.gray} style={{ marginTop: 1 }}>
          Nothing was counted. Choose the same realm to try again once the
          trouble has passed, or another.
        </text>
      </box>
    </box>
  )
}
