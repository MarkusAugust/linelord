/**
 * The Warrior's Guide: how to use LineLord, and what its numbers and its
 * writing to .mailmap do. Data, so the screen only draws it.
 *
 * Each block is a paragraph, a list of [term, meaning] pairs, or a warning.
 * Keep it in step with the README, which says the same at greater length.
 */

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'pairs'; pairs: Array<[string, string]> }
  | { kind: 'warn'; text: string }
  | { kind: 'code'; lines: string[] }

export type Chapter = { icon: string; title: string; blocks: Block[] }

export const GUIDE: Chapter[] = [
  {
    icon: '🧭',
    title: 'Getting around',
    blocks: [
      {
        kind: 'text',
        text: 'Every screen answers the same keys. The arrows and vim’s keys do the same thing; use whichever your hands know.',
      },
      {
        kind: 'pairs',
        pairs: [
          ['↑ ↓   k j', 'one up or down'],
          ['PgUp PgDn   Ctrl-b Ctrl-f', 'a page'],
          ['Ctrl-u Ctrl-d', 'half a page'],
          ['Home End   gg G', 'the first, the last'],
          ['→ l Enter', 'open what is under the cursor'],
          ['← h Esc', 'back to the screen before'],
          ['/ text', 'search names and addresses as you type; Enter keeps it'],
          ['n N', 'the next and the previous match'],
          [':42', 'go to the 42nd'],
          [':q  :x  :q!  q', 'leave the realm'],
          ['?', 'the keys, and what the numbers on this screen mean'],
        ],
      },
      {
        kind: 'text',
        text: 'A few screens have keys of their own, and say so at the bottom: 1–8 on the menu, m on the overview to merge, o on Code Longevity to change the order, space and w when merging.',
      },
    ],
  },
  {
    icon: '📏',
    title: 'What is counted, and what is not',
    blocks: [
      {
        kind: 'text',
        text: 'LineLord runs git blame on every file in HEAD and counts, for each line still standing, who last changed it. That is the whole of it. Every number on every screen is a count of those lines, or of files, days and file types those lines are in.',
      },
      {
        kind: 'pairs',
        pairs: [
          ['Counted', 'lines alive in HEAD, in text files git tracks'],
          [
            'Not counted',
            'blank lines and lines of only whitespace — they belong to nobody',
          ],
          [
            'Not counted',
            'commits, lines ever written, hours, days of the week',
          ],
          [
            'Set aside',
            'binary files, and files over the threshold: 50 KB, or -t',
          ],
          [
            'Set aside',
            'lock files, minified and bundled code, test snapshots, compiled output, archives and generated directories',
          ],
          [
            'Uncommitted',
            'changes not yet committed are not counted; the main hall says how many files have them',
          ],
        ],
      },
      {
        kind: 'text',
        text: 'Age is when a line was last changed, not when it was first written. A reformatting makes old code young; see “When a reformatting rewrote everything”.',
      },
      {
        kind: 'warn',
        text: 'None of this measures how good anyone’s work is, or how much of it they did. Old code is stable code, not good code. The rankings are a joke about conquest.',
      },
    ],
  },
  {
    icon: '🤝',
    title: 'One warrior, many names: .mailmap',
    blocks: [
      {
        kind: 'text',
        text: 'An email address is a warrior. Somebody who committed from work and from home, or through GitHub’s noreply address, is two warriors until something says otherwise. That something is .mailmap: git’s own file, which git blame applies before LineLord sees a single line.',
      },
      {
        kind: 'text',
        text: 'Merge warriors who are one person writes it for you. The guesses are offered at the top; below, you can mark any identities you know to be one, whether or not they look alike. You choose who is shown, read the lines, and nothing is written until you press w.',
      },
      {
        kind: 'code',
        lines: [
          'Gorvek of Bonereach <gorvek@firma.no> <4711+vurn@users.noreply.github.com>',
          '└─ the name and address shown ─────┘ └─ the address it replaces ──────┘',
        ],
      },
      {
        kind: 'text',
        text: 'What writing it does, because it reaches further than LineLord:',
      },
      {
        kind: 'pairs',
        pairs: [
          [
            'Everywhere in git',
            'git log, git shortlog and git blame show the merged name too, not only LineLord',
          ],
          [
            'Uncommitted',
            'it holds for you alone, and git status shows .mailmap as changed',
          ],
          ['Committed', 'it holds for everyone who clones the repository'],
          [
            'History',
            'no commit is rewritten; the old addresses are still in every commit, and .mailmap only says how to show them',
          ],
          [
            'Read again',
            'LineLord reads the repository again straight after, and the file is part of what the cache checks, so an edit is always noticed',
          ],
        ],
      },
      {
        kind: 'warn',
        text: 'A wrong merge credits one person with another’s work, everywhere git shows a name. The guesses have taken erik.hansen@ for erika.hansen@ before now. Read every line before you commit the file.',
      },
      {
        kind: 'text',
        text: 'To change it afterwards, open .mailmap in the repository. Change the first name and address on a line to be shown differently; delete the line to count them apart again. LineLord only ever adds lines, so anything you wrote by hand is left as it was.',
      },
    ],
  },
  {
    icon: '🧹',
    title: 'When a reformatting rewrote everything',
    blocks: [
      {
        kind: 'text',
        text: 'A commit that only reformatted the code — new quotes, new indentation — makes whoever ran the formatter the owner of every line it touched, and makes those lines young. Tell blame to look past it, and the lines go back to whoever wrote them.',
      },
      {
        kind: 'code',
        lines: [
          '# .git-blame-ignore-revs',
          '# Switched to double quotes. Not authorship.',
          '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
        ],
      },
      {
        kind: 'text',
        text: 'LineLord reads .git-blame-ignore-revs from the repository, and --ignore-rev adds more for one run. The main hall says how many commits are being looked past, and names any entry that is no commit here — those are left out, because git refuses to blame anything when handed one.',
      },
    ],
  },
  {
    icon: '📜',
    title: 'The scroll of memory',
    blocks: [
      {
        kind: 'text',
        text: 'What LineLord reads, it remembers, so a repository that has not moved opens at once and one that has moved forward has only its changed files read again. The main hall says which it was.',
      },
      {
        kind: 'pairs',
        pairs: [
          [
            'Where',
            '$XDG_CACHE_HOME/linelord, or ~/.cache/linelord — one file per repository',
          ],
          [
            'What',
            'paths, commit hashes and dates, names and addresses. Never file contents',
          ],
          [
            'How long',
            'unopened for fifteen days, it is burned; past 500 MB the least used go first',
          ],
          ['--refresh', 'ignore what is stored and read everything again'],
          ['--no-cache', 'neither read nor write it'],
          [
            '--clear-cache',
            'forget this repository; --clear-all-caches forgets every one',
          ],
        ],
      },
      {
        kind: 'text',
        text: 'LineLord never goes on the network. Nothing is sent anywhere, and there is no telemetry.',
      },
    ],
  },
  {
    icon: '⏳',
    title: 'Looking back: --history',
    blocks: [
      {
        kind: 'text',
        text: 'Without it, LineLord sees only the present: who holds what, and how old it is. With --history it also reads the repository as it stood at points in the past, and from that works out how much of each warrior’s work survived and how long it took for half of it to be gone.',
      },
      {
        kind: 'code',
        lines: [
          'linelord --history',
          'linelord --history --snapshot-interval=quarter --max-snapshots=24',
        ],
      },
      {
        kind: 'warn',
        text: 'Each snapshot is a pass over the whole repository. Sixty months of a large repository takes a while; the loading screen counts them.',
      },
    ],
  },
  {
    icon: '🔧',
    title: 'Flags, for scripts',
    blocks: [
      {
        kind: 'text',
        text: 'Everything the analysis shows can be reached from the screens. The flags decide how the realm is read — the history, the cache, the threshold, the commits looked past — and do the two things that stop without drawing a screen, for scripts: --json and --write-mailmap.',
      },
      {
        kind: 'pairs',
        pairs: [
          [
            'linelord [path]',
            'survey the repository you stand in, or the one you name',
          ],
          ['-p, --path', 'the same, as a flag'],
          [
            '-t, --threshold KB',
            'set aside files larger than this (default 50)',
          ],
          ['--concurrency N', 'files blamed at once (default 12, at most 64)'],
          ['--ignore-rev SHA', 'look past a commit, for this run; repeatable'],
          [
            '--fuzzy-authors',
            'merge by guessing, for this run only — it is wrong often enough to matter',
          ],
          [
            '--write-mailmap',
            'write every guess to .mailmap without asking, and stop',
          ],
          [
            '--json',
            'write the analysis as JSON for another program, and stop',
          ],
          ['--history', 'also read the past; see Looking back'],
          ['--version, --help', ''],
        ],
      },
    ],
  },
]
