import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useState } from 'react'
import type { IdentityMerge } from '../services/AuthorNormalizationService'
import {
  type MailmapWrite,
  mailmapLines,
  writeMailmap,
} from '../utility/mailmap'

type MailmapDraftProps = {
  repoPath: string
  merges: IdentityMerge[]
  onBack: () => void
}

type WriteState =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'written'; result: MailmapWrite }
  | { status: 'failed'; message: string }

/**
 * The guesses about who is who, and the offer to write them down.
 *
 * The analysis behind this screen merged nobody: these are candidates, shown
 * so a person can decide. Writing them to `.mailmap` is what turns a guess
 * into a decision, which is why it takes a keypress and not a default.
 */
export default function MailmapDraft({
  repoPath,
  merges,
  onBack,
}: MailmapDraftProps) {
  const [write, setWrite] = useState<WriteState>({ status: 'idle' })
  const lines = mailmapLines(merges)

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack()
      return
    }

    if (input === 'w' && write.status === 'idle' && lines.length > 0) {
      setWrite({ status: 'writing' })
      writeMailmap(repoPath, merges)
        .then((result) => setWrite({ status: 'written', result }))
        .catch((error: unknown) =>
          setWrite({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          }),
        )
    }
  })

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Draft a .mailmap'))}</Text>

      {merges.length === 0 ? (
        <Box flexDirection="column" marginY={1}>
          <Text>
            Every contributor committed under a single address. There is nothing
          </Text>
          <Text>to write down.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          <Text>
            {merges.length} contributor{merges.length === 1 ? '' : 's'} may have
            committed under more than one address:
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {merges.map((merge) => (
              <Box key={merge.canonical.email} flexDirection="column">
                <Text>
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
          </Box>
        </Box>
      )}

      {lines.length > 0 && write.status !== 'written' && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">
            ⚠ These are guesses, and this guessing is wrong often enough to
            matter.
          </Text>
          <Text color="gray">
            {'  '}It has merged erik.hansen@ with erika.hansen@ before now. Read
            every
          </Text>
          <Text color="gray">
            {'  '}line below, and delete the ones that are not right — nothing
            here is
          </Text>
          <Text color="gray">{'  '}applied until git reads the file.</Text>
          <Box flexDirection="column" marginTop={1}>
            {lines.map((line) => (
              <Text key={line} color="cyan">
                {'  '}
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {write.status === 'writing' && <Text color="gray">Writing…</Text>}

      {write.status === 'written' && (
        <Box flexDirection="column" marginBottom={1}>
          {write.result.added.map((line) => (
            <Text key={line} color="green">
              {'  + '}
              {line}
            </Text>
          ))}
          {write.result.alreadyPresent.map((line) => (
            <Text key={line} color="gray">
              {'  = '}
              {line}
            </Text>
          ))}
          <Text>
            {write.result.added.length === 0
              ? `${write.result.path} already says all of this.`
              : `Wrote ${write.result.added.length} line${
                  write.result.added.length === 1 ? '' : 's'
                } to ${write.result.path}.`}
          </Text>
          <Text color="gray">
            Nothing was overwritten. The next run reads the file through git, so
          </Text>
          <Text color="gray">
            these identities arrive already merged and are never guessed at
            again.
          </Text>
        </Box>
      )}

      {write.status === 'failed' && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">Could not write .mailmap: {write.message}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {lines.length > 0 && write.status === 'idle'
            ? "Press 'w' to write these to .mailmap · 'q' or Esc to go back"
            : "Press 'q' or Esc to go back"}
        </Text>
      </Box>
    </Box>
  )
}
