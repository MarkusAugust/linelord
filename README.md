<div align="center">

<h1>LineLord</h1>

## The Barbarian's Guide to Git Repository Conquest

</div>

> _"What is best in code? To crush the bugs, see them driven from your repository, and to hear the lamentations of their stack traces!"_
>
> — Gorvek the Ironbane

## What is LineLord?

Know, O Prince, that between the years when repositories were young and the rise of the great codebases, there was an age undreamed of. And unto this came **LineLord**, forged in the fires of the Ashen Vale and destined to track every line of code and every warrior who dared shape the digital realm.

LineLord is a CLI tool that wields the ancient power of `git blame` to reveal who truly holds your codebase. No sorcery, no far-off oracles, no mystical dependencies — only the raw strength of native git commands, an SQLite scroll to remember what it read, and the honest arithmetic of lines that still stand.

### What Gorvek Brings to the Battlefield

- **Native Git Power** — every number comes from git itself, and works wherever git draws breath
- **Honest Identity** — one warrior is one email address; `.mailmap` is how you say otherwise, and LineLord will draft it for you
- **Battle Reports** — who holds what, how old it is, and who conquered which ground
- **Code Longevity** — how long the code still standing has stood, and with `--history`, how long code actually lasts before it falls
- **Brutal Barbarian Rankings** — territory owned, files held alone, code that outlived a year
- **The Forbidden Lands** — because surveying a codebase should feel like surviving the Blood Mist

## Claim Your Weapon

Homebrew forges it, as trusted as a Galdane battle-axe:

```bash
brew tap markusaugust/linelord
brew install linelord
```

When Horn's smiths temper a new blade, sharpen yours:

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

- **↑↓** and **Enter** — choose, and open
- **1–9** — leap straight to a menu entry
- **ESC** or **q** — retreat one screen, or leave the realm
- **:q** or **:x** — leave as a vim warrior would, from the main menu
- On Code Longevity: **m**, **a**, **l** re-sort by median, mean and lines; **h** and **s** by half-life and survival once the history is walked
- On the `.mailmap` draft: **w** writes what it proposes

## What Gets Analysed

_"These are the true scrolls of power, written by mortal hands with sweat and blood. LineLord honours them, for they bear the mark of genuine battle against the demonic corruption of bugs."_

Every file git tracks in `HEAD` that is text, is not generated, and is under
the size threshold: source in any tongue, configuration, documentation, scripts
and makefiles, and tests — for a test is code somebody wrote and holds, and it
counts.

_"What Galdane warrior has time for scrolls that weigh more than a war hammer? LineLord casts these aside, for they are the spawn of Zytera's corruption and code generation, not true craftsmanship."_

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

Five scrolls await on the menu. On the first three, **↑↓ and Enter** open one
warrior in full: their share of the codebase and the files they hold the most
of, how old that code is and where the oldest of it sits, and — once the
history has been walked — what became of everything they ever wrote.

### Repository Overview

The realm at a glance: how many files were surveyed and how many set aside as
binary, generated or bloated; how many lines still stand; and every warrior
ranked by the share of those lines they hold, with their title and address
beneath the name. The address is what tells two warriors of one name apart.

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
named columns, and the legend beneath the table says what each column counts.

### Code Longevity

How old is the code still standing, and whose? For every surviving line, how
long ago was the commit that last touched it — per warrior, and for the
codebase as a whole:

```
The codebase is 3y 8m old at the middle, 21% of it last touched within ninety days.
Oldest line still standing: old.ts:1 — 3y 8m old

  # Warrior                   Lines   Median    Spread (p10–p90)  Half-life  New → old
›  1 Gorvek the Ironbane          10    3y 8m          6m – 3y 8m          —     ▂ █
   2 Zygofer the Defiler           1    1y 4m       1y 4m – 1y 4m          —      █
   3 Sister Nightshroud            3       2d             2d – 2d          —  █
```

Sorted by the **median**, not the mean: one ancient file somebody still holds
drags a mean across years and the median not at all. The last column is the
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
scroll draws the curve:

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

### Draft a .mailmap, and About

The fourth scroll is told of under [Who is one warrior](#who-is-one-warrior).
The fifth is Gorvek explaining himself.

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

## Who Is One Warrior

An email address is an identity. Two commits belong to the same warrior when
git says they do, and nothing is inferred from names. That makes the merging
explicit, reviewable, and the same identity git uses everywhere else.

So a warrior who has committed from the war camp and from home, or before and
after swearing to a new lord, has two addresses and counts as two warriors.
The overview shows the address under each name, which is what tells them
apart:

```
Gorvek the Ironbane  <gorvek@firma.no>                        3 lines
Gorvek the Ironbane  <gorvek@privat.no>                       2 lines
Gorvek the Ironbane  <4711+gorvek@users.noreply.github.com>   1 line
```

Two lines in `.mailmap` — the file git itself reads, and which `git blame`
applies before LineLord sees a single line — settle it, for LineLord and for
`git shortlog` alike:

```
Gorvek the Ironbane <gorvek@firma.no> <gorvek@privat.no>
Gorvek the Ironbane <gorvek@firma.no> <4711+gorvek@users.noreply.github.com>
```

### Gorvek Notices, but Does Not Presume

The default merges nobody, yet it does not keep quiet about what it saw. When
two contributors look like one person, the menu screen says so, and says why:

```
⚠ 1 contributor may have committed under more than one address:
  Gorvek the Ironbane <gorvek@firma.no>
    ← gorvek@privat.no — the names "gorvek the ironbane" and "gorvek" are alike
  Nothing was merged. Pick "Draft a .mailmap" below to record the ones that are right.
```

Both addresses still count apart and keep their own places in the ranking. The
warning is there so that two entries for one warrior are a thing you can
decide about, not a thing you have to notice.

### Drafting the .mailmap

Finding the candidates by hand is drudgery fit for a stable boy, so LineLord
does the drudgery. Pick **Draft a .mailmap from identity guesses** on the
menu, or skip the interface:

```bash
linelord --write-mailmap
```

Either way the analysis stays strict and merges nobody. The guessing is run
as a question — *whom would a loose run take to be one person?* — and the
answer is shown before anything is written:

```
1 contributor may have committed under more than one address:
  Gorvek the Ironbane <gorvek@firma.no>
    ← gorvek@privat.no — the names "gorvek the ironbane" and "gorvek" are alike

⚠ These are guesses, and this guessing is wrong often enough to matter.

  Gorvek the Ironbane <gorvek@firma.no> <gorvek@privat.no>

Press 'w' to write these to .mailmap · 'q' or Esc to go back
```

On the menu it is `w` that writes; from the command line the lines are
appended and each one reported, `+` for added and `=` for already there.
Nothing is ever overwritten or removed: entries you wrote by hand stay exactly
as they are, and a wrong guess is a line to delete, not a decision to undo.
Once a line is in `.mailmap`, git applies it and the guess is never made
again.

**Read what it wrote before committing it.** The guessing is
`--fuzzy-authors` — the old behaviour, which matched names and addresses that
merely resembled each other. It is no longer the default because it is wrong
often enough to matter: it took `mk@firma.no` for `ml@firma.no`, `john@` for
`joan@`, and `erik.hansen@` for `erika.hansen@`. Different warriors, and one
of each pair then vanished from the ranking while the other was credited with
their deeds. Use it to find candidates for a `.mailmap`, never to trust the
output; the point of the file is that a person, not a heuristic, decided.

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
   │ adapters/git     │   │       src/core        │   │    adapters/ink      │
   │  spawnGit        │──▶│                       │◀──│  App · components    │
   │  blamePorcelain  │   │  model  ownership     │   │  hooks · format      │
   └────────┬─────────┘   │  ranking  longevity   │   │  resources · menu    │
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
Node's file system. `ink` is the terminal interface: screens that read the
analysis as values and call the core's functions, and nothing else.

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

LineLord is open source software released under the **GNU General Public License v3.0 (GPL-3)**.

---

## Acknowledgments

LineLord stands on the shoulders of these mighty open source warriors:

- **[ink](https://github.com/vadimdemedes/ink)** and **[react](https://reactjs.org/)** — the terminal interface
- **[meow](https://github.com/sindresorhus/meow)** — CLI argument parsing
- **[drizzle-orm](https://orm.drizzle.team/)** — the SQLite scroll of memory
- **[fastest-levenshtein](https://github.com/ka-weihe/fastest-levenshtein)** — the identity guessing
- **[picocolors](https://github.com/alexeyraspopov/picocolors)** — terminal colours
- **[Biome](https://biomejs.dev/)** and **[TypeScript](https://www.typescriptlang.org/)** — the forge

_All dependencies use permissive licenses and remain under their original terms._
