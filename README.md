<div align="center">

<h1>LineLord</h1>

## The Barbarian's Guide to Git Repository Conquest

</div>

> _"What is best in code? To crush the bugs, see them driven from your repository, and to hear the lamentations of their stack traces!"_
>
> — Gorvek of Bonereach

## What is LineLord?

Know, O Prince, that between the years when repositories were young and the rise of the great codebases, there was an age undreamed of. And unto this came **LineLord**, forged in the grey of the Ashfall and destined to track every line of code and every warrior who dared shape the digital realm.

LineLord is a CLI tool that wields the ancient power of `git blame` to reveal who truly holds your codebase. No sorcery, no far-off oracles, no mystical dependencies — only the raw strength of native git commands, an SQLite scroll to remember what it read, and the honest arithmetic of lines that still stand.

### What Gorvek Brings to the Battlefield

- **Native Git Power** — every number comes from git itself, and works wherever git draws breath
- **Honest Identity** — one warrior is one email address; `.mailmap` is how you say otherwise, and LineLord will write it, from its guesses or from what you tell it
- **Battle Reports** — who holds what, how old it is, and who conquered which ground
- **Code Longevity** — how long the code still standing has stood, and with `--history`, how long code actually lasts before it falls
- **Brutal Barbarian Rankings** — territory owned, files held alone, code that outlived a year
- **Gallowmark** — because surveying a codebase should feel like walking out of the Ashfall; every name, farewell and analysis message comes from the canon

## Claim Your Weapon

Homebrew forges it, as trusted as a Bonereach axe:

```bash
brew tap markusaugust/linelord
brew install linelord
```

When the smiths of Bonereach temper a new blade, sharpen yours:

```bash
brew update && brew upgrade linelord
```

If LineLord answers with Gorvek's wisdom, your weapon is ready. Linux and macOS
are the realms it walks; each release carries a binary for every one of them.

## Enter the Battlefield

```bash
linelord                                # survey the repository you stand in
linelord ~/code/forbidden-toolkit       # or the one you point at
linelord -p ~/code/saga -t 75           # the same, with files over 75 KB set aside

linelord --threshold 100                # files larger than this are left unread (default: 50 KB)
linelord --concurrency 4                # blame four files at a time (default: 12, at most 64)

linelord --no-cache                     # neither read nor write the stored analysis
linelord --refresh                      # ignore what is stored and read everything again
linelord --clear-cache                  # forget this repository's stored analysis
linelord --clear-all-caches             # forget every repository's

linelord --ignore-rev 1a2b3c4           # look past a reformatting commit, for this run
linelord --fuzzy-authors                # guess who is who from names (see below — it lies)
linelord --write-mailmap                # draft a .mailmap from those guesses, and stop

linelord --json                         # write the analysis as JSON and stop

linelord --history                      # also read the past, and how long code lasted
linelord --history --snapshot-interval=quarter --max-snapshots=24

linelord --version
linelord --help
```

Stand anywhere inside a repository and LineLord surveys the whole of it, never
merely the corner you happen to be standing in. Point it at ground that is no
repository, or hand it a threshold that is zero, negative or no number at all,
and it says so and stops — Gorvek does not hand you an empty map and call it a
conquest.

LineLord runs one `git blame` per file, twelve at a time. Lower it on a machine
already at war with something else, raise it on one that idles — though past a
point the time goes into raising and reaping git processes rather than reading
blame, so it is capped at 64.

### The Scroll of Memory

What LineLord reads, it remembers, in `$XDG_CACHE_HOME/linelord` or
`~/.cache/linelord` — one scroll per repository. A repository that has not
moved opens at once; one that has moved forward has only its changed files read
again. The scroll holds file paths, commit hashes and dates, and contributor
names and addresses. Never file contents.

Scrolls nobody has opened for fifteen days are burned, and once the shelf
passes 500 MB the least recently used go first. If the shelf cannot be written
to, the analysis runs anyway and simply remembers nothing.

### Commanding the Realm

LineLord takes the whole terminal while it runs and gives it back exactly as
it was when you leave. Every screen answers the same keys, and the arrows and
vim's keys do the same thing — use whichever your hands know:

| Keys | |
| --- | --- |
| **↑ ↓**, **k j** | one up or down |
| **PgUp PgDn**, **Ctrl-b Ctrl-f** | a page |
| **Ctrl-u Ctrl-d** | half a page |
| **Home End**, **gg G** | the first, the last |
| **→ l Enter** | open what is under the cursor |
| **← h Esc** | back to the screen before |
| **/** text, **n N** | search names and addresses as you type; the next and previous match |
| **:42** | go to the 42nd |
| **:q :x :q! q** | leave the realm |
| **?** | the keys, and what the numbers on this screen mean |

A few screens have keys of their own, and say so on the bottom line: **1–8**
on the main menu, **m** on the Repository Overview to merge, **o** on Code
Longevity to change the order, **Space** and **w** when merging. Lists scroll
with the selection, and coming back to a screen finds it as you left it.

## What Gets Analysed

_"These are the true scrolls of power, written by mortal hands with sweat and blood. LineLord honours them, for they bear the mark of genuine battle against the demonic corruption of bugs."_

Every file git tracks in `HEAD` that is text, is not generated, and is under
the size threshold: source in any tongue, configuration, documentation, scripts
and makefiles, and tests — for a test is code somebody wrote and holds, and it
counts.

_"What warrior of the Reach has time for scrolls that weigh more than a war hammer? LineLord casts these aside, for they are the spawn of the Greycloaks' tithe-rolls and code generation, not true craftsmanship."_

- **Binary files** — git decides, by the same rule it uses when choosing
  whether to show you a diff. If `git diff` prints the contents, LineLord
  counts them; if it says `Binary files differ`, it does not. So an SVG
  counts, being markup somebody wrote, and a blob with an unfamiliar
  extension does not
- **Generated files** — `package-lock.json`, `yarn.lock` and their kin,
  matched as proper globs, so a directory is excluded only when a whole path
  segment matches: `checkout/` is not `out/`
- **Build artifacts** — `dist/`, `build/`, `node_modules/`
- **Bloated files** — anything over the threshold, 50 KB unless you say otherwise
- **Untracked files** — whatever `.gitignore` keeps out of the repository was never in the realm
- **Uncommitted changes** — the analysis runs against `HEAD`, so unsaved edits are neither counted nor credited to anyone
- **Blank lines** — banished from the realm, though they keep their line numbers

Disagree with a verdict? `.gitattributes` settles it, for git and LineLord
alike:

```gitattributes
generated.sql binary     # count it as a blob, though it is text
weird.dat     diff       # count it as text, though git would guess otherwise
```

## The Battle Reports

The main hall offers the battle reports, the merge, **The Warrior's Guide**
and an account of Gorvek himself, and beside them the tidings: what was read
afresh and what came from the scroll of memory, which commits were looked
past, who may be one person, and what could not be read.

From any list, **Enter** opens one warrior in full, on one page that scrolls:
what they hold of the realm, their battle record, how old their code is and
where the oldest of it sits, the files they hold the most of, and — once the
history has been walked — what became of everything they ever wrote.

Every bar on every screen is a part of a whole, and says which whole: lines
of every line in `HEAD`, files of every file, file types of every type, days
of every day a surviving line was last touched. Behind it stands the
warrior's place — `2nd of 16`, `=2nd` when the place is shared, nothing when
they hold none of it:

```
Ancient Code          11,481 of 31,400 lines      36.6% ███████▎        2nd of 16
Massive Battles            9 of 16 days           56.3% ███████████▎    1st of 16
```

### Repository Overview

The realm at a glance: how many files were surveyed and how many set aside as
binary, generated or bloated; how many lines still stand; and every warrior
ranked by the share of those lines they hold, with their title and address
beneath the name. The address is what tells two warriors of one name apart.
**m** merges warriors you know to be one person — see
[Merging warriors who are one person](#merging-warriors-who-are-one-person).

Titles run from **legend** down to **peasant** and are handed out in rank
order, the crown, the silver and the bronze marking the three who hold the
most. A warrior wears one title, the same on every screen.

### Brutal Barbarian Rankings

A ranking by conquest rather than by volume. Every metric counts lines that
are **still alive in `HEAD`**:

| Metric | What it counts |
| --- | --- |
| Battle Scars | Surviving lines in large or legacy-looking files |
| Territory Conquered | Files where the warrior owns more than half the lines |
| Solo Quests | Files where every surviving line is theirs |
| Weapon Mastery | Distinct file types they hold lines in |
| Ancient Code | Surviving lines last touched more than a year ago |
| Massive Battles | Days when over 100 of their surviving lines were last touched |
| Campaigns | Distinct days their surviving lines were last touched |

Weighed together they make the **Gorvek score**, which decides the placing;
whoever leads a category is decorated for it. Every warrior is one row under
named columns, and **?** says what each column counts. When the terminal is
too narrow for every column, columns are set aside one at a time, in a fixed
order, and the table says how many are only in the battle record — a number
is never cut through the middle. Where the terminal is tall enough, the
battle record of the warrior under the cursor stands below the table.

### Code Longevity

How old is the code still standing, and whose? For every surviving line, how
long ago was the commit that last touched it — per warrior, and for the
codebase as a whole:

```
The codebase is 3y 8m old at the middle, 21% of it last touched within ninety days.
Oldest line still standing: old.ts:1 — 3y 8m old

  # Warrior                   Lines   Median    Spread (p10–p90)  Half-life  New → old
›  1 Gorvek of Bonereach          10    3y 8m          6m – 3y 8m          —     ▂ █
   2 Captain Drusk                 1    1y 4m       1y 4m – 1y 4m          —      █
   3 Sarn the Faceless             3       2d             2d – 2d          —  █
```

Sorted by the **median**, not the mean: one ancient file somebody still holds
drags a mean across years and the median not at all. **o** changes the order
— mean, surviving lines, and, once the history is walked, half-life and
survival. The last column is the
age histogram, newest code on the left and oldest on the right, so the shape
of what remains of someone's work is readable at a glance.

#### How long code actually lasts

The figures above measure the age of what survives. They say nothing of the
code that is *gone* — and a warrior whose every line has since been rewritten
looks, to them, like one who never wrote any.

`--history` reads the repository as it stood at points in the past, the last
commit of each month unless `--snapshot-interval` says week or quarter, and
follows each month's work forward — at most `--max-snapshots` of them, sixty
by default. That gives three things the present cannot: how many lines a
warrior ever had standing, how much of it is left, and how long half of a
month's work lasts before it falls.

It is opt-in because it costs. Every sampled revision is a pass over the
repository, so sixty of them on a large codebase is minutes rather than
seconds. LineLord re-reads only the files some commit touched since the
previous sample and carries the rest across, which is the difference between
minutes and an afternoon, but it is still the slow road.

With the history walked, the **Half-life** column fills, and the warrior's
page draws the curve:

```
What became of it
  10 lines written in all, 2 still standing — 20%
  Half of a month's work is gone after 2m
  ██▄▄▄▂
  new                older → 5m
```

The column can say three things. A number is a measured half-life. `> 3m`
means the work outlasted everything the history watched. A dash means the
history saw that code only once and knows nothing either way — which is not
the same as short-lived, and is why it is not a number. Somebody the present
has forgotten, with nothing left standing, is given a row all the same, for
they are precisely who the history exists to show.

A stored history outlives the analysis that made it. If the repository has
moved on since, the screen says which revision the history describes and
leaves the columns empty rather than draw a curve about a realm that no
longer exists.

### Merge Warriors, the Guide, and About

Merging is told of under [One warrior, many names](#one-warrior-many-names).
**The Warrior's Guide** is this README's working parts at the size of a
screen: getting around, what is counted, what writing `.mailmap` does to git
as well as to LineLord, reformattings, the cache, the history, and the flags.
**About** is Gorvek explaining himself, with the version, the licence and
where to find the source.

## What the Numbers Are, and Are Not

_"The theming is a joke about conquest. The numbers are not."_ — This matters
more than any figure above it, and so it stands on the screens as well as
here.

- **Nothing counts commits, and nothing looks at when anyone worked.** A late
  night costs you nothing and earns you nothing. Only lines still alive in
  `HEAD` are counted.
- **Age is when a line was last changed, not when it was written.** A
  reformatting, a linter sweep or a mass rename resets it for everything it
  touches; without [`.git-blame-ignore-revs`](#when-a-reformatting-rewrote-everything)
  the figures measure the formatter's calendar.
- **Old code is stable code, which is not the same as good code.** The code
  nobody dares touch scores exactly as well as the code that earned its place.
- **New code usually means working where the work is.** A low median says a
  warrior has been where the fighting is, not that they fight badly.
- **None of it measures a person's worth or productivity, and it must not be
  used that way.** LineLord counts lines and dates. It knows nothing of what
  the lines do, how hard they were to write, or what else the warrior did
  that week.

## When a Reformatting Rewrote Everything

One commit that runs a formatter over the whole repository changes every line
without changing what any of them mean. Left alone, `git blame` credits the
entire codebase to whoever ran it, dated to the afternoon they ran it — so the
formatter tops every ranking, everyone else vanishes, and the code all looks a
week old.

Write those commits down in `.git-blame-ignore-revs`, one hash per line:

```
# Switched to double quotes. Not authorship.
b7d3f1a9c2e45608d1f37b2a9c4e6d80f5a1b3c7
```

LineLord reads it and tells blame to look past them, so the lines go back to
whoever wrote them, with the date they were written. The same file serves
`git blame --ignore-revs-file` and is what GitHub reads, so it is worth having
regardless. For a commit not yet written down, `--ignore-rev <sha>` does the
same for one run, and may be given more than once.

When either is in use the menu screen says so, because the ownership shown is
deliberately not what plain `git blame` would report:

```
Looking past 1 commit named in .git-blame-ignore-revs, so their lines are
credited to whoever wrote them
```

An entry that names no commit here is left out and reported, saying which
source named it. Handed to git, a single bad line makes it refuse the blame —
for every file — and the whole realm comes back unreadable over a typo. A
`.git-blame-ignore-revs` that exists but cannot be read stops the analysis
with an explanation rather than quietly analysing without it: carrying on
would hand the reformatting back to whoever ran it, on every screen, and store
that in the scroll of memory as though it were right.

## One Warrior, Many Names

An email address is an identity. Two commits belong to the same warrior when
git says they do, and nothing is inferred from names. That makes the merging
explicit, reviewable, and the same identity git uses everywhere else.

So a warrior who has committed from the war camp and from home, or before and
after swearing to a new lord, has two addresses and counts as two warriors.
The overview shows the address under each name, which is what tells them
apart:

```
Gorvek of Bonereach  <gorvek@firma.no>                        3 lines
Gorvek of Bonereach  <gorvek@privat.no>                       2 lines
Gorvek of Bonereach  <4711+gorvek@users.noreply.github.com>   1 line
```

Two lines in `.mailmap` — the file git itself reads, and which `git blame`
applies before LineLord sees a single line — settle it, for LineLord and for
`git shortlog` alike:

```
Gorvek of Bonereach <gorvek@firma.no> <gorvek@privat.no>
Gorvek of Bonereach <gorvek@firma.no> <4711+gorvek@users.noreply.github.com>
```

### Gorvek Notices, but Does Not Presume

The default merges nobody, yet it does not keep quiet about what it saw. When
two contributors look like one person, the menu screen says so, and says why:

```
⚠ 1 warrior may have committed under more than one address:
  Gorvek of Bonereach <gorvek@firma.no>
    ← gorvek@privat.no — the names "gorvek of bonereach" and "gorvek" are alike
Nothing was merged. Pick 🤝 Merge to take the ones that are right.
```

Both addresses still count apart and keep their own places in the ranking. The
warning is there so that two entries for one warrior are a thing you can
decide about, not a thing you have to notice.

### Merging Warriors Who Are One Person

Pick **Merge warriors who are one person** on the menu, or press **m** on the
Repository Overview with one of them highlighted. The screen has two parts.

**The suggestions.** Finding the candidates by hand is drudgery fit for a
stable boy, so LineLord does the drudgery. The guessing is run as a question —
*whom would a loose run take to be one person?* — and the answers stand at the
top, each with its reason:

```
Suggested, because they look alike — guesses, and wrong often enough to matter:
› Gorvek of Bonereach <gorvek@firma.no>
      ← gorvek@privat.no — the names "gorvek of bonereach" and "gorvek" are alike
```

**Enter** takes one. Nothing is merged by being suggested: taking it goes
through the same steps as marking by hand, so every guess is looked at before
it becomes a merge.

**Every warrior.** The guessing only finds warriors who resemble each other. A
warrior who committed as `Gorvek of Bonereach <gorvek@firma.no>` from the war
camp and as `Vurn the Ashborn <4711+vurn@users.noreply.github.com>` through
GitHub shares neither a name nor an address with himself, and no guess will
ever put the two together. Only he knows — so LineLord takes his word for it.
Below the suggestions stands every warrior: mark each identity that is the
same person with **Space**, and press **Enter**.

Either way, you then choose which identity the merged warrior is shown as,
and the lines are shown before anything is written:

```
2 identities become one warrior, shown as Gorvek of Bonereach <gorvek@firma.no>.

These lines are added to .mailmap:
  Gorvek of Bonereach <gorvek@firma.no> <4711+vurn@users.noreply.github.com>

Nothing is written until you press w
```

**w** appends them to `.mailmap`, and **Enter** reads the repository again, so
the overview comes back with one row where there were two.

If `.mailmap` already sends other addresses to one of the warriors being
merged, those get a line too. Git reads the file once and does not follow one
entry on to the next, so without them a warrior merged once and then merged
again would come back under the name he had in between.

**Changing it afterwards.** The merge is lines in `.mailmap` and nothing else,
and the screen says so once it is written:

- Each line reads: the name and address shown, then the address it replaces.
- To be shown as somebody else, change the first name and address on those
  lines. The name can be anything, whether or not you ever committed under it.
- To count them apart again, delete the lines the merge added.
- It is a file in your repository. Commit it, and everyone who clones the
  repository counts them as one, in LineLord and in `git shortlog`.

LineLord reads `.mailmap` again on every run, and because the file is hashed
into the cache fingerprint, an edit is noticed without `--refresh`.

**From the command line**, for a script or for someone who has read the
guesses already, `linelord --write-mailmap` appends every suggestion at once,
without asking, and reports each line, `+` for added and `=` for already
there. The analysis stays strict and merges nobody. Nothing is ever
overwritten or removed: entries you wrote by hand stay exactly as they are,
and a wrong guess is a line to delete, not a decision to undo.

### So are they merged, or not?

Both, in order, and the order is the point. LineLord never merges anybody: it
counts addresses, before you write the file and after. But `.mailmap` is git's
own file, and `git blame` applies it *before* LineLord sees a single line — so
from the next run the two are one warrior, with one row, one share and one
title, because git says they are the same person and not because a heuristic
guessed it.

That is why the merging is explicit and reviewable rather than clever. The
decision lives in a file you wrote, in your repository, where `git shortlog`
and every other tool reads it too — and a wrong guess is a line to delete
rather than a verdict to argue with.

The stored analysis notices. `.mailmap` is hashed into the cache fingerprint,
so adding, changing or deleting it reads the repository again rather than
serving numbers worked out when the file said something else.

**Read what it wrote before committing it.** The guessing is
`--fuzzy-authors` — the old behaviour, which matched names and addresses that
merely resembled each other. It is no longer the default because it is wrong
often enough to matter: it took `mk@firma.no` for `ml@firma.no`, `john@` for
`joan@`, and `erik.hansen@` for `erika.hansen@`. Different warriors, and one
of each pair then vanished from the ranking while the other was credited with
their deeds. Use it to find candidates for a `.mailmap`, never to trust the
output; the point of the file is that a person, not a heuristic, decided.

## Handing the Numbers to Another Program

`--json` writes the whole analysis to standard output and stops — the same
numbers the screens show, as one value something else can read:

```bash
linelord --json > conquest.json
linelord --json --history          # the survival figures come with it
```

Progress goes to standard error, so standard output is the report and nothing
else and may be piped straight into a parser. The payload carries a
`schemaVersion`, the revision it describes, what was set aside as binary,
generated or bloated, every contributor with their share, the rankings, the
longevity figures, the identity candidates nothing merged, and — because a
count of lines is nowhere more likely to be mistaken for a measure of a person
— the same disclaimer the screens carry.

It is the one thing LineLord does without drawing a screen, and it exists so
the numbers can be published without being reimplemented. Everything else
lives in the terminal.

## Architecture — Ports and Adapters

LineLord is built as a hexagon. The core knows how to count lines and who
holds them; it does not know that git is a program, that the cache is a
SQLite file, or that the screen is a terminal. Everything at the edge reaches
the core through a **port** — a TypeScript interface the core declares — and
an **adapter** implements the port for the real thing. There are no classes
anywhere: the core is modules of functions, and where a run needs state it is
closed over by `createLineLord`.

```
                        ┌───────────────────────────────────────────────┐
                        │                   src/app                     │
                        │  cli.ts · ports.ts (composition root)         │
                        │  cliHelp · cliValidation · thresholdConverter │
                        └───────────────┬──────────────┬────────────────┘
                                        │ builds       │ renders
                                        ▼              ▼
   ┌──────────────────┐   ┌───────────────────────┐   ┌──────────────────────┐
   │ adapters/git     │   │       src/core        │   │  adapters/opentui    │
   │  spawnGit        │──▶│                       │◀──│  App · Shell · data  │
   │  blamePorcelain  │   │  model  ownership     │   │  screens · keymap    │
   └────────┬─────────┘   │  ranking  longevity   │   │  format · resources  │
            │ GitPort     │  barbarian  identity  │   └──────────────────────┘
            │ GitFactory  │  analyse  history     │            reads values,
   ┌────────┴─────────┐   │  cohorts  snapshots   │            calls functions
   │  ports/git       │   │  survival  cache      │
   └──────────────────┘   │  ignoreRevs  mailmap  │   ┌──────────────────────┐
   ┌──────────────────┐   │  warrior  lineLord ◀──┼───│  ports/files         │
   │  ports/storage   │──▶│                       │   └──────────┬───────────┘
   │  ports/stores    │   └───────────────────────┘              │ FileSystemPort
   └───────┬──────────┘                                ┌─────────┴────────────┐
           │ AnalysisStore · StoreProvider             │  adapters/fs         │
   ┌───────┴──────────┐   ┌──────────────────┐         │  nodeFiles           │
   │ adapters/sqlite  │   │ adapters/memory  │         └──────────────────────┘
   │  store · provider│   │  store · provider│
   │  database · meta │   │  (for tests)     │
   │  cacheLocation   │   └──────────────────┘
   │  cacheMaintenance│
   └──────────────────┘
```

**The core** (`src/core`) holds every decision LineLord makes and every number
it reports. `model.ts` is the analysis as plain values: files, authors,
aliases, blame lines, snapshots, cohorts. `ownership`, `ranking`, `longevity`,
`barbarian` and `identity` are functions over those values — a median is a
median whether the rows came from disk or a test fixture. `analyse` and
`history` are the two use cases that read a repository; they ask the git port
for trees and blame and hand the results to the storage port a batch at a
time. `lineLord.ts` is the orchestration: given the ports, it decides whether
to reuse a cache, update it or rebuild, and returns the operations the
interface uses as a record of functions.

**The ports** (`src/ports`) are the four interfaces the core is written
against: `GitPort` and `GitFactory` (a tree, a blame, ancestry, the history),
`AnalysisStore` (load an analysis, write files and lines, update authors,
meta, snapshots), `StoreProvider` (a store on disk or in memory, and the lock
for it) and `FileSystemPort` (read a text file or learn it is absent; append).

**The adapters** (`src/adapters`) implement them. `git` spawns the git
binary and parses its output at the edge. `sqlite` keeps the analysis in the
database LineLord has always used, on disk under the cache directory or in
memory; `memory` keeps it in arrays for tests, and one contract test in
`src/ports/__test__` is run against both so they cannot drift apart. `fs` is
Node's file system. `opentui` is the terminal interface: full-screen screens
drawn with [OpenTUI](https://github.com/anomalyco/opentui), which read the
analysis as values and call the core's functions, and nothing else. `data.ts`
reads the repository through the ports; `Shell` draws whatever it read, so a
screen can be tested from an analysis built by hand. One keymap (`keymap.ts`)
decides what every key asks for, and each screen what that means for it.

**The app** (`src/app`) is the composition root. `ports.ts` is the one place
the real adapters are chosen; `cli.ts` parses the flags, resolves the
repository and renders the interface with those ports.

The rule that follows from the shape: the numbers are computed once, in the
core, from values. A screen never runs a query, and a test of a calculation
never needs a database.


## Contributing to the Saga

Bug reports, feature requests and pull requests are welcome at the
[repository](https://github.com/MarkusAugust/linelord). Before you draw
steel, read [CONTRIBUTING.md](CONTRIBUTING.md): the gate every change passes
through, the shape of the code, the theme, and how a release is cut.

## License

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Copyright (C) 2026 August Søberg-Klyver.

LineLord is open source software released under the **GNU General Public License v3.0 (GPL-3)**.

LineLord is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, version 3. It is distributed
in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for the full
terms.

It costs nothing, and every released version stays GPL-3: that permission cannot be withdrawn,
not even by me. Run it on anything, including closed source, with no obligation at all. The
obligation begins only if you pass a modified LineLord on to someone else.

The name LineLord and the mark are not part of that grant. Fork the code freely; do not call the
result LineLord.

Contributions: issues are always welcome. Pull requests are taken after a conversation, and
whoever contributes signs [CLA.md](CLA.md).

---

## Acknowledgments

LineLord stands on the shoulders of these mighty open source warriors:

- **[OpenTUI](https://github.com/anomalyco/opentui)** and **[react](https://react.dev/)** — the terminal interface
- **[meow](https://github.com/sindresorhus/meow)** — CLI argument parsing
- **[drizzle-orm](https://orm.drizzle.team/)** — the SQLite scroll of memory
- **[fastest-levenshtein](https://github.com/ka-weihe/fastest-levenshtein)** — the identity guessing
- **[Biome](https://biomejs.dev/)** and **[TypeScript](https://www.typescriptlang.org/)** — the forge

_All dependencies use permissive licenses and remain under their original terms._

---

<a href="https://sobernetics.no">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/sobernetics-dark.svg">
    <img alt="Søbernetics" src=".github/sobernetics-light.svg" height="18">
  </picture>
</a>
