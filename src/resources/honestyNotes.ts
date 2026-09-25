/**
 * What the numbers are, and are not.
 *
 * The theming is a joke about conquest, and a table sorted by "most" invites
 * reading it as a ranking of people. These notes are the refusal, written
 * once so that every screen says the same thing and a rewording reaches all
 * of them.
 */
export type HonestyTopic = 'age' | 'rankings'

export const HONESTY_NOTES: Record<
  HonestyTopic,
  { heading: string; lines: string[] }
> = {
  age: {
    heading: 'What these numbers are, and are not',
    lines: [
      'Age is when a line was last changed, not when it was written.',
      'A reformatting resets it — name those commits in .git-blame-ignore-revs.',
      'Old code is stable code, which is not the same as good code. Untouched code may simply be dead code nobody dares to move.',
      'New code usually means working where the work is, not working badly.',
      "None of this measures anyone's worth. Do not use it that way.",
    ],
  },
  rankings: {
    heading: 'How to read this',
    lines: [
      'Every number counts lines still alive in HEAD — not commits, and not hours worked.',
      'Old code means stable code, not good code. Nobody dares touch the worst of it.',
      "Reformatting resets a line's age. Use .git-blame-ignore-revs to keep it honest.",
      "This is a joke about conquest. It does not measure anyone's productivity.",
    ],
  },
}
