import { Box, Text, useInput } from 'ink'
import pc from 'picocolors'
import { useState } from 'react'
import type { MailmapWrite } from '../../../core/mailmap'
import type { AuthorContribution } from '../../../core/ownership'

type Identity = { name: string; email: string }

type MergeWarriorsProps = {
  contributions: AuthorContribution[]
  /** The warrior the merge was started from, marked already. */
  initiallyMarked?: number
  /** The `.mailmap` lines this merge would add, read without writing. */
  propose: (keep: Identity, absorbed: string[]) => Promise<string[]>
  /** Write them. */
  write: (keep: Identity, absorbed: string[]) => Promise<MailmapWrite>
  /** The file was written: the analysis has to be read again. */
  onMerged: () => void
  onBack: () => void
}

type Step =
  | { name: 'mark' }
  | { name: 'keep' }
  | { name: 'proposing' }
  | { name: 'preview'; lines: string[] }
  | { name: 'writing'; lines: string[] }
  | { name: 'written'; result: MailmapWrite }
  | { name: 'failed'; message: string }

const NAME_WIDTH = 24

function identityOf(one: AuthorContribution): Identity {
  return { name: one.displayName, email: one.email }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Several identities a person knows to be one warrior, merged by hand.
 *
 * The guessing only finds identities that resemble each other, and is wrong
 * often enough to matter even then. Someone who committed as "MASK" from one
 * address and as a GitHub noreply address from another is in neither list,
 * and only they can say so. This takes their word for it, lets them choose
 * which identity is shown, and writes the decision into `.mailmap` -- the
 * file git applies before LineLord sees a line -- so the merge is one they
 * can read, change and delete afterwards, and the screen says how.
 */
export default function MergeWarriors({
  contributions,
  initiallyMarked,
  propose,
  write,
  onMerged,
  onBack,
}: MergeWarriorsProps) {
  const [step, setStep] = useState<Step>({ name: 'mark' })
  const [cursor, setCursor] = useState(() =>
    Math.max(
      0,
      contributions.findIndex((one) => one.id === initiallyMarked),
    ),
  )
  const [marked, setMarked] = useState<Set<number>>(
    () => new Set(initiallyMarked === undefined ? [] : [initiallyMarked]),
  )
  const [keepAt, setKeepAt] = useState(0)

  const chosen = contributions.filter((one) => marked.has(one.id))
  const kept = chosen[keepAt]
  const absorbed = chosen.filter((one) => one !== kept).map((one) => one.email)

  useInput((input, key) => {
    switch (step.name) {
      case 'mark': {
        if (key.escape || input === 'q') {
          onBack()
          return
        }
        if (key.upArrow) setCursor((at) => Math.max(0, at - 1))
        if (key.downArrow) {
          setCursor((at) => Math.min(contributions.length - 1, at + 1))
        }
        const here = contributions[cursor]
        if (input === ' ' && here) {
          setMarked((before) => {
            const after = new Set(before)
            if (after.has(here.id)) after.delete(here.id)
            else after.add(here.id)
            return after
          })
        }
        if (key.return && chosen.length >= 2) {
          setKeepAt(0)
          setStep({ name: 'keep' })
        }
        return
      }

      case 'keep': {
        if (key.escape || input === 'q') {
          setStep({ name: 'mark' })
          return
        }
        if (key.upArrow) setKeepAt((at) => Math.max(0, at - 1))
        if (key.downArrow) {
          setKeepAt((at) => Math.min(chosen.length - 1, at + 1))
        }
        if (key.return && kept) {
          setStep({ name: 'proposing' })
          propose(identityOf(kept), absorbed)
            .then((lines) => setStep({ name: 'preview', lines }))
            .catch((error: unknown) =>
              setStep({ name: 'failed', message: messageOf(error) }),
            )
        }
        return
      }

      case 'preview': {
        if (key.escape || input === 'q') {
          setStep({ name: 'keep' })
          return
        }
        if (input === 'w' && kept) {
          setStep({ name: 'writing', lines: step.lines })
          write(identityOf(kept), absorbed)
            .then((result) => setStep({ name: 'written', result }))
            .catch((error: unknown) =>
              setStep({ name: 'failed', message: messageOf(error) }),
            )
        }
        return
      }

      case 'written': {
        // Whatever is pressed, the numbers behind every screen are now out
        // of date: the file they were counted under has changed.
        if (key.return || key.escape || input === 'q') onMerged()
        return
      }

      case 'failed': {
        if (key.escape || input === 'q') onBack()
        return
      }
    }
  })

  return (
    <Box flexDirection="column">
      <Text>{pc.bold(pc.green('Merge warriors who are one person'))}</Text>

      {step.name === 'mark' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">
            Mark every identity that is the same person — even when nothing
            about them looks alike.
          </Text>
          <Box flexDirection="column" marginY={1}>
            {contributions.map((one, index) => {
              const here = index === cursor
              return (
                <Text key={one.id} color={here ? 'green' : undefined}>
                  {here ? '› ' : '  '}
                  {marked.has(one.id) ? '[x] ' : '[ ] '}
                  {one.displayName.slice(0, NAME_WIDTH - 1).padEnd(NAME_WIDTH)}
                  <Text color="gray">{one.email}</Text>
                  {`  ${one.totalLines.toLocaleString('en-GB')} line${one.totalLines === 1 ? '' : 's'}`}
                </Text>
              )
            })}
          </Box>
          <Text dimColor>
            {chosen.length >= 2
              ? `Space marks a warrior · Enter to merge the ${chosen.length} marked · q or Esc to go back`
              : 'Space marks a warrior · mark two or more, then Enter · q or Esc to go back'}
          </Text>
        </Box>
      )}

      {step.name === 'keep' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Which of them should the merged warrior be shown as?</Text>
          <Box flexDirection="column" marginY={1}>
            {chosen.map((one, index) => (
              <Text key={one.id} color={index === keepAt ? 'green' : undefined}>
                {index === keepAt ? '› ' : '  '}
                {one.displayName} &lt;{one.email}&gt;
              </Text>
            ))}
          </Box>
          <Text dimColor>
            ↑↓ to choose · Enter to continue · Esc to go back
          </Text>
        </Box>
      )}

      {step.name === 'proposing' && <Text color="gray">Reading .mailmap…</Text>}

      {(step.name === 'preview' || step.name === 'writing') && kept && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            {chosen.length} identities become one warrior, shown as{' '}
            {pc.bold(kept.displayName)} &lt;{kept.email}&gt;.
          </Text>
          <Box flexDirection="column" marginY={1}>
            <Text>These lines are added to .mailmap:</Text>
            {step.lines.map((line) => (
              <Text key={line} color="cyan">
                {'  '}
                {line}
              </Text>
            ))}
          </Box>
          <Text color="gray">
            Git applies .mailmap before LineLord counts a single line, so from
            here on they are one warrior — on these screens, in git log and in
            git shortlog. Nothing already in the file is changed.
          </Text>
          <Box marginTop={1}>
            <Text dimColor>
              {step.name === 'writing'
                ? 'Writing…'
                : "Nothing is written until you press 'w' · Esc to go back"}
            </Text>
          </Box>
        </Box>
      )}

      {step.name === 'written' && (
        <Box flexDirection="column" marginTop={1}>
          {step.result.added.map((line) => (
            <Text key={line} color="green">
              {'  + '}
              {line}
            </Text>
          ))}
          {step.result.alreadyPresent.map((line) => (
            <Text key={line} color="gray">
              {'  = '}
              {line}
            </Text>
          ))}
          <Text>
            {step.result.added.length === 0
              ? `${step.result.path} already says all of this.`
              : `Wrote ${step.result.added.length} line${
                  step.result.added.length === 1 ? '' : 's'
                } to ${step.result.path}.`}
          </Text>

          <Box flexDirection="column" marginTop={1}>
            <Text bold>To change this later, edit that file:</Text>
            <Text color="gray">
              {'  · '}each line reads: the name and address shown, then the
              address it replaces
            </Text>
            <Text color="gray">
              {'  · '}to be shown differently, change the first name and address
              on those lines
            </Text>
            <Text color="gray">
              {'  · '}to count them apart again, delete the lines added here
            </Text>
            <Text color="gray">
              {'  · '}it is a file in your repository: commit it, and everyone
              who clones it counts them as one
            </Text>
            <Text color="gray">
              LineLord reads .mailmap again on every run, and notices when it
              has changed.
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>Press Enter to count the realm again</Text>
          </Box>
        </Box>
      )}

      {step.name === 'failed' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Could not merge them: {step.message}</Text>
          <Text color="gray">Nothing was merged.</Text>
          <Box marginTop={1}>
            <Text dimColor>Press 'q' or Esc to go back</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
