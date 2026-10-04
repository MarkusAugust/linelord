import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useEffect } from 'react'
import { type Block, GUIDE } from '../guide'
import { useScreenKeys } from '../keys'
import { useList, useScrollPage } from '../list'
import { C } from '../theme'

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${index}${block.kind}`
        switch (block.kind) {
          case 'text':
            return (
              <text key={key} fg={C.text} style={{ marginBottom: 1 }}>
                {block.text}
              </text>
            )
          case 'warn':
            return (
              <text key={key} fg={C.yellow} style={{ marginBottom: 1 }}>
                {`⚠ ${block.text}`}
              </text>
            )
          case 'code':
            return (
              <box
                key={key}
                style={{
                  flexDirection: 'column',
                  marginBottom: 1,
                  paddingLeft: 2,
                }}
              >
                {block.lines.map((line) => (
                  <text key={line} fg={C.cyan} wrapMode="none">
                    {line}
                  </text>
                ))}
              </box>
            )
          case 'pairs':
            return (
              <box
                key={key}
                style={{ flexDirection: 'column', marginBottom: 1 }}
              >
                {block.pairs.map(([term, meaning]) => (
                  // Two columns, so a long meaning wraps under itself.
                  <box
                    key={term + meaning}
                    style={{
                      flexDirection: 'row',
                      flexShrink: 0,
                      paddingRight: 3,
                    }}
                  >
                    <text fg={C.green} style={{ width: 28, flexShrink: 0 }}>
                      {`  ${term}`}
                    </text>
                    <text fg={C.gray} style={{ flexGrow: 1, flexShrink: 1 }}>
                      {meaning}
                    </text>
                  </box>
                ))}
              </box>
            )
          default:
            return null
        }
      })}
    </>
  )
}

/** How to use LineLord, and what writing .mailmap does. Chapters on the left, the chapter on the right. */
export function Guide() {
  const { width } = useTerminalDimensions()
  const chapters = useList(GUIDE, (one) => one.title)
  const page = useScrollPage()
  const chapter = chapters.chosen
  const wide = width >= 100

  // A new chapter starts at its top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the chapter changing is what this answers; the scrollbox is read, not watched
  useEffect(() => {
    if (page.scroll.current) page.scroll.current.scrollTop = 0
  }, [chapters.selected])

  useScreenKeys({
    hint: '↑↓ jk chapter · PgUp PgDn Ctrl-d Ctrl-u read on · / search chapters · ← h Esc back',
    onAction: (action) => {
      // The chapter list moves with the arrows; the page under it with the page keys.
      if (action.type === 'page' || action.type === 'halfPage')
        return page.act(action)
      if (action.type === 'open') return page.act({ type: 'page', by: 1 })
      return chapters.act(action)
    },
  })

  return (
    <box
      style={{
        flexDirection: wide ? 'row' : 'column',
        flexGrow: 1,
        gap: 1,
        padding: 1,
      }}
    >
      <box
        title=" 📖 The Warrior's Guide "
        style={{
          border: true,
          borderColor: C.green,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          width: wide ? 44 : '100%',
          // Stacked above the page, the list scrolls in five rows rather
          // than taking the height the chapter needs.
          height: wide ? undefined : Math.min(GUIDE.length, 5) + 2,
          flexShrink: 0,
        }}
      >
        <scrollbox ref={chapters.scroll} style={{ flexGrow: 1 }}>
          {GUIDE.map((one, index) => {
            const here = index === chapters.selected
            return (
              <box
                key={one.title}
                id={chapters.idOf(index)}
                style={{ backgroundColor: here ? C.selected : undefined }}
              >
                <text
                  wrapMode="none"
                  attributes={here ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  <span fg={C.green}>{here ? '› ' : '  '}</span>
                  <span>{`${one.icon} `}</span>
                  <span fg={here ? C.green : C.text}>{one.title}</span>
                </text>
              </box>
            )
          })}
        </scrollbox>
      </box>
      {chapter && (
        <box
          title={` ${chapter.icon} ${chapter.title} `}
          style={{
            border: true,
            borderColor: C.gray,
            flexDirection: 'column',
            flexGrow: 1,
            paddingLeft: 2,
            paddingRight: 2,
          }}
        >
          <scrollbox
            ref={page.scroll}
            style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
          >
            <text> </text>
            <Blocks blocks={chapter.blocks} />
          </scrollbox>
        </box>
      )}
    </box>
  )
}
