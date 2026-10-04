/**
 * The Warrior's Guide: how to use LineLord, and what its numbers and its
 * writing to .mailmap do. Data, so the screen only draws it.
 *
 * Each block is a paragraph, a list of [term, meaning] pairs, or a warning.
 * Keep it in step with the README, which says the same at greater length.
 */

import {
  ACHIEVEMENTS,
  LEGACY_EXTENSIONS,
  LEGACY_FILE_SIZE_BYTES,
  LEGACY_PATH_WORDS,
  MASSIVE_BATTLE_LINES,
  SCORE_WEIGHTS,
} from '../../core/barbarian'
import { MEASURE_NAMES } from './parts'
import { steady } from './theme'

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
    icon: '🪓',
    title: 'The rankings, measure by measure',
    blocks: [
      {
        kind: 'text',
        text: 'Every measure counts lines still standing in HEAD, or the files, days and file types those lines are in. Nothing counts commits, and nothing looks at when in the day anyone worked. Each line has one owner: whoever last changed it.',
      },
      {
        kind: 'pairs',
        pairs: [
          [
            MEASURE_NAMES.survivingLines.label,
            'lines they hold — the line was last changed by them',
          ],
          [
            MEASURE_NAMES.battleScars.label,
            `their lines in files that look legacy: over ${LEGACY_FILE_SIZE_BYTES.toLocaleString('en-GB')} bytes, or ending in ${[...LEGACY_EXTENSIONS].join(' ')}, or with ${LEGACY_PATH_WORDS.map((word) => `"${word}"`).join(', ')} in the path`,
          ],
          [
            MEASURE_NAMES.territoryConquered.label,
            'files where they hold more than half the lines; a file split evenly is held by nobody',
          ],
          [
            MEASURE_NAMES.soloQuestVictories.label,
            'files where every line is theirs',
          ],
          [
            MEASURE_NAMES.weaponMastery.label,
            'how many file types — extensions — they hold lines in',
          ],
          [
            MEASURE_NAMES.ancientCodeSurvival.label,
            'their lines last changed more than a year before the survey',
          ],
          [
            MEASURE_NAMES.massiveBattles.label,
            `days on which more than ${MASSIVE_BATTLE_LINES} of their surviving lines were last changed`,
          ],
          [
            MEASURE_NAMES.totalCampaigns.label,
            'how many different days their surviving lines were last changed on',
          ],
        ],
      },
      {
        kind: 'text',
        text: 'On a warrior’s page and below the rankings, each measure stands against the whole it is a part of — the lines, files, file types or days of the whole realm — and the bar is that part. Behind it is their place among the warriors.',
      },
      {
        kind: 'code',
        lines: [
          'Ancient Code     11,481 of 31,400 lines   36.6%  ███████▎     2nd of 16',
          '                 └ of …: the whole ┘      └ the part ┘        └ their place; = when shared ┘',
        ],
      },
      {
        kind: 'warn',
        text: 'A big number here is not a good number. Old code is stable, not good; a legacy-looking file is not a bad one. Several of these favour whoever stayed longest.',
      },
    ],
  },
  {
    icon: '🧮',
    title: 'The Gorvek score',
    blocks: [
      {
        kind: 'text',
        text: 'The score decides the order of the rankings. It adds three kinds of claim on the codebase, and gives a little extra to whoever is not weak in any of them, and to whoever dominates one.',
      },
      {
        kind: 'code',
        lines: [
          `conquest   = Territory × ${SCORE_WEIGHTS.territoryConquered} + Solo × ${SCORE_WEIGHTS.soloQuestVictories} + ln(Types) × ${SCORE_WEIGHTS.weaponMastery}`,
          `endurance  = Ancient × ${SCORE_WEIGHTS.ancientCodeSurvival} + Scars × ${SCORE_WEIGHTS.battleScars}`,
          `intensity  = Massive × ${SCORE_WEIGHTS.massiveBattles} + ln(Campaigns) × ${SCORE_WEIGHTS.totalCampaigns}`,
          '',
          `+ ${SCORE_WEIGHTS.balancedOver20} if the weakest of the three is over 20, + ${SCORE_WEIGHTS.balancedOver50} more over 50`,
          `+ ${SCORE_WEIGHTS.dominantOver100} if the strongest is over 100`,
        ],
      },
      {
        kind: 'text',
        text: 'Holding a whole file weighs most; ln, the natural logarithm, means the tenth file type or campaign adds less than the second. How many lines a warrior holds does not enter it directly, so somebody holding fewer lines can rank above somebody holding more.',
      },
      {
        kind: 'warn',
        text: 'It is a joke about conquest, weighed by Gorvek, and not a measure of anyone’s work, worth or productivity.',
      },
    ],
  },
  {
    icon: '🏆',
    title: 'Achievements and titles',
    blocks: [
      {
        kind: 'text',
        text: 'An achievement goes to the one warrior who leads its measure, and only when they hold something of it. A tie goes to whoever ranks higher.',
      },
      {
        kind: 'pairs',
        pairs: ACHIEVEMENTS.map(({ title, metric }): [string, string] => [
          steady(title).replace(/^\S+\s+/, ''),
          `the most ${MEASURE_NAMES[metric].label}`,
        ]),
      },
      {
        kind: 'text',
        text: 'A title — legend, warlord, swordsman, peasant and the rest — follows the share of lines a warrior holds, and is handed out relative to the others: the top fifth get the highborn titles, the bottom fifth the lowborn ones, everyone else those in between. With one warrior there is only a legend; with two, a legend and a peasant. A warrior wears the same title on every screen.',
      },
      {
        kind: 'warn',
        text: 'A peasant is somebody who holds the fewest lines in this repository today. That is all it means.',
      },
    ],
  },
  {
    icon: '⏳',
    title: 'Reading Code Longevity',
    blocks: [
      {
        kind: 'text',
        text: 'The age of a line is how long ago it was last changed. Code Longevity asks how old the lines each warrior still holds are.',
      },
      {
        kind: 'pairs',
        pairs: [
          [
            'Median',
            'half their lines are older than this, half younger; one ancient file cannot drag it, as it would a mean',
          ],
          [
            'Spread',
            'a tenth of their lines are younger than the first age, a tenth older than the second',
          ],
          [
            'New → old',
            'where their lines sit in time, newest on the left, each block a bucket from under a week to over two years',
          ],
          [
            'Half-life',
            "with --history: how long until half of a month's work is gone",
          ],
          [
            'Survival',
            'with --history: how much of everything they ever had standing still stands',
          ],
        ],
      },
      {
        kind: 'text',
        text: 'A half-life can say three things. A number is measured. "> 1y 5m" means the work outlasted everything the history watched. "—" means the history saw that work only once, or was not walked, and knows nothing either way.',
      },
      {
        kind: 'warn',
        text: 'Old code means stable code, not good code — untouched code may simply be code nobody dares to move. New code usually means working where the work is.',
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
