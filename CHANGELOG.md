# Changelog

Notable changes to LineLord. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Where a change moves the numbers LineLord reports, this says so. Several below
do, and a repository analysed before and after will not give the same answer —
because the earlier answer was wrong.

## [Unreleased]

### Changed

- **The README, forged anew.** Every subject stands in one place: what is
  analysed, the screens in menu order, what the numbers are not, the
  reformatting commits, and who is one warrior. The three retellings of the
  filtering, the two of the disclaimer and the four of identity are gone,
  along with the Homebrew housekeeping and the performance jokes, and
  Gorvek's voice is laid on thicker everywhere else. Nothing about the
  program changes.
- **`CONTRIBUTING.md`.** What a contributor needs to know, committed rather
  than kept on the maintainer's machine: the gate and why all three of its
  outputs are read, one task per branch, test first, the shape of the code
  and its rules, the theme and the names it may not use, the self-review
  list, and how a release is cut. The README's own contributing section now
  points there, and Gorvek's collected wisdom, which the program already
  quotes on its way out, leaves the README.

## [0.12.0] — 2026-09-26

The same program, rebuilt as ports and adapters. Nothing on screen changes
and no number moves; what changes is that every calculation is now a
function over values, every edge is behind an interface, and no class
remains in the source.

### Changed

- **Towards ports and adapters.** The analysis now has a storage port: an
  interface for keeping an analysis between runs and writing one during a
  run, with the SQLite database behind it as one adapter and a handful of
  arrays as another, for tests. One contract test says what both must do,
  and both pass it. Nothing on screen changes; this is the first step of
  moving every calculation out of SQL and into plain functions over values,
  so that the core can be tested without a database at all.
- **Who holds what, and the ranking, as plain functions.** The repository
  summary, the contributor list, a warrior's files and the rank, share and
  title each contributor is given are now computed from the loaded analysis
  by functions in the core, and tested on values rather than on a seeded
  database. The screens read the analysis once; nothing on them waits on a
  query any more. Same numbers, same order.
- **The age of the code, as plain functions.** Median, mean, percentiles,
  the histogram, the oldest and newest line, the files where the oldest code
  sits, and the survival figures are now computed from the loaded analysis
  and history by functions in the core, with `now` handed in. The longevity
  screen draws from values and no longer waits on a query. Nearest-rank
  medians, bucket edges and tie-breaks are exactly as they were, and the
  tests say so on values rather than on a seeded database.
- **The barbarian rankings, as plain functions.** Every metric, the Gorvek
  score and the achievements are computed from the loaded analysis by
  functions in the core, with `now` handed in. The rankings screen draws
  from values. The legacy-file rule, the day boundaries and the tie-breaks
  match what the SQL did, and the tests say so on values.
- **Who is one person, as plain functions.** The guessing, the reasons it
  gives, the choice of which identity to keep and what a merge moves are
  now functions from the author rows to a plan, and the plan is what the
  storage port writes. The same guesses, the same reasons, the same
  thresholds; tested on values and on the in-memory store.
- **A git port.** Every git command LineLord runs -- resolving HEAD, listing
  a tree, telling text from binary, blame, ancestry, the paths touched
  between two revisions, the first-parent history -- is now one method on
  one interface, with the process-spawning adapter behind it and the output
  parsed at the edge. The analysis, the history walk and the ignore-revs
  resolution ask the port; a test can answer for git. The test that guarded
  against blaming the symbolic ref by reading the source now records what
  the port is asked and checks every revision is the resolved one.
- **The analysis of a revision, as functions over the ports.** Which files
  the tree holds and what kind each is, what changed since the store last
  saw it, and which lines belong to somebody are pure decisions; blame is
  read through the git port and written through the storage port, a batch
  at a time. `GitService` is gone. The same files are read, classified and
  stored as before; a file about to be read again loses its old lines first
  on every kind of run, not only the incremental one.
- **The history walk, as functions over the ports.** Choosing the
  snapshots, reading each one, carrying untouched files across and
  summing the cohorts are functions over the git and storage ports;
  `HistoryService` is gone. The test that reached into a private method to
  check the walk drops its claim before reading now does it by handing the
  walk a git that dies on the first tree and checking nothing is claimed.
- **The orchestration, as a record of functions.** `LineLordService` is
  gone; `createLineLord(ports, …)` returns the same operations as closures
  over the run's state, built from three ports: git, the file system and a
  store provider that decides between the cache on disk and memory. The
  cache decision, the `.git-blame-ignore-revs` resolution and the
  `.mailmap` writing move into the core and reach files through the port;
  the composition root in `src/app/ports.ts` is the one place the real
  adapters are chosen. No class remains in the source.
- **The source is laid out as the architecture.** `src/core` holds the
  model and every calculation, `src/ports` the four interfaces, `src/adapters`
  the git, SQLite, memory, file-system and Ink implementations, and `src/app`
  the CLI and the composition root. The `services`, `utility`, `resources`
  and `types` directories are gone, and the entry point is `src/app/cli.ts`.
  The README has an architecture section with a drawing of the whole.

## [0.11.0] — 2026-09-25

Fewer screens, and each number said once. Nothing here changes what is
counted or how; every figure is still there, reached with fewer steps.

### Changed

- **One overview where there were three screens.** The contributor list on
  the menu, *Repository Statistics* and *Extended Repository Statistics* all
  drew the same percentages — in a list, a bar chart, a horizontal "pie
  chart", its legend and a top-and-bottom box — so the same number for the
  same person appeared up to four times on one screen. *Repository Overview*
  replaces them: the file summary, then one table of every warrior with rank,
  share, lines, title and address. Enter on a row opens that warrior's files,
  which is where the extended screen's breakdown went; the single-developer
  screen shows the same detail. The menu screen now holds the repository, its
  status lines and the menu, so the menu is in view on a repository with many
  contributors rather than scrolled off under the list.


- **One warrior screen where there were two.** *Single Developer Statistics*
  showed a person's lines, files, share and top files; Enter on the longevity
  table showed the same person's age histogram, oldest and newest line and
  survival curve. Neither knew about the other. They are now one screen,
  reached with ↑↓ and Enter from the overview, from the longevity table and
  from the barbarian rankings alike: share and top files first, then how old
  it is and where the oldest of it sits, then — when `--history` has been run
  — what became of everything they wrote. The separate menu entry and its
  pick-a-name step are gone, because the tables are the pick-a-name step.


- **One title per warrior.** The overview handed out titles by share of the
  surviving lines, and the barbarian rankings handed out a second set from
  the same word list by Gorvek score — so the same person was *legend* on one
  screen and *warrior* on the next, which looked like a bug and was one. The
  rankings now show the same title as everywhere else, next to the name, and
  what they add is the Gorvek score, the placing and the achievements. The
  two epithets for first and second place by score are gone with it.


- **The barbarian rankings are a table.** The champion sat in a box with
  every metric spelled out, and everyone below got a line of seven emoji and
  seven numbers with the key two screens further down — the same figures,
  laid out so that only the first person's could be read. Every warrior is
  now one row under named columns, the achievements are listed beneath, and
  the legend turns each short column name into what it counts. ↑↓ and Enter
  open a warrior, as on the other tables.


- **The screens share their building blocks.** The note under the longevity
  screen, the rankings and the About page that says what the numbers are not
  is now one list, so a rewording reaches all three. A person's files are drawn
  by one row component wherever they are listed. Every screen that loads
  something does it through one hook, which forgets an answer that arrives
  after the screen has been left — the barbarian and longevity screens guarded
  against that, and the others did not. Nothing on screen changes except the wording of the notes, which now agree
  with each other. Component tests exist for the first time, through
  `ink-testing-library`.

## [0.10.0] — 2026-09-20

How long code actually lasts, rather than how old what survives is.

### Added

- **`--history`: how long code actually lasts.** The longevity screen measures
  the age of what survives, which says nothing about the code that is gone —
  and somebody whose every line has been rewritten looks, to it, like somebody
  who never wrote any. With `--history`, LineLord reads the repository as it
  stood at points in the past, follows each month's work forward, and reports
  how much anyone ever had standing, how much is left, and how long half of a
  month's work lasts. `--snapshot-interval` and `--max-snapshots` control the
  sampling.

  It is opt-in because it costs: every sampled revision is a pass over the
  repository. Only the files some commit touched since the previous sample are
  read again and the rest are carried across, which is the difference between
  minutes and an afternoon, but it is still the slow path.

  The dashboard gains a half-life column and two sort keys, and the detail view
  draws the survival curve. A number is a measured half-life; `> 3m` means the
  work outlasted everything watched; a dash means the history saw that code
  only once and knows nothing either way. A history describing a revision the
  repository has since moved past is reported as such rather than drawn.

## [0.9.0] — 2026-09-20

A new screen: how old the code each contributor still holds is. Plus a flag
that had never worked, and one that had never been asked for.

### Added

- **Code Longevity**, a new screen: how old the code each contributor still
  holds is. For every line surviving in the analysed revision, how long ago was
  the commit that last touched it — the median, the mean, the tenth and
  ninetieth percentiles, and a histogram of the whole spread drawn as a
  sparkline with the newest code on the left. Sorted by median rather than
  mean, because one ancient file somebody still owns drags a mean across years
  and the median not at all. Enter opens one contributor: the histogram with
  numbers, the oldest and newest line they hold with file and line number, and
  the files where their oldest code sits. The repository gets the same
  treatment at the top, including how much of it was touched in the last ninety
  days.

  What the numbers are not is on the screen itself, not only in the README:
  age is when a line was last changed rather than written, a reformatting
  resets it, old code is stable rather than good, new code usually means
  working where the work is — and none of it measures a person.

- **`--concurrency`**, for how many files are blamed at once. LineLord runs one
  `git blame` per file; twelve at a time was hard-coded and is now the default.
  Capped at 64, because past a point the time goes into spawning processes
  rather than reading blame.

### Changed

- **Blame is read in the compact porcelain format.** `--line-porcelain` repeats
  the whole commit header for every line; `--porcelain` writes it once per
  commit. About three quarters less output to read and parse — measured on this
  repository, a full analysis went from roughly 550 ms to 445 ms. The two forms
  are the same answer, and there is a test over real git output that says so.
  Every stored analysis is rebuilt once, because the options blame is run with
  are part of what decides whether one may be reused.

### Fixed

- **Creating the same contributor twice at once no longer loses a file.**
  Looking an author up and then inserting them is two steps with an await
  between, and two callers in that window both find nobody and both insert —
  the second failing on the address, and taking its whole file's blame with it.
  The insert is idempotent now. The blame pipeline does not currently reach
  that window, but it was safe by an accident of event ordering rather than by
  design, which is not something to put `--concurrency` on top of.
- **An abandoned analysis no longer reports back.** Changing repository while
  one was still running left the first run to finish and announce success, so
  the screen presented the previous repository's analysis as ready under the
  new repository's name.
- **`--no-cache` now does something.** The flag has been in the help text and
  the README since caching landed, and it was never read: the option was
  declared under the negated name, and `--no-cache` is parsed as the negation
  of `--cache`, so it set a flag nobody looked at. It was not rejected either.
  LineLord went on storing the analysis, and the only sign was a cache file
  nobody had asked for.
- **The About screen said contributors were matched by name similarity.** They
  have not been since identity matching became strict; the screen was simply
  never brought along.

## [0.8.1] — 2026-09-20

A repository that has been through a reformatting gets a different answer from
this release, and a truer one.

### Added

- **A reformatting no longer steals the whole codebase.** One commit that runs
  a formatter over every file changes every line without changing what any of
  them mean, and blame credits the lot to whoever ran it, dated to the
  afternoon they ran it: the formatter tops the ranking, everyone else
  disappears, and the code all looks a week old. LineLord now reads
  `.git-blame-ignore-revs` — the file git itself takes with
  `--ignore-revs-file`, and the one GitHub reads — and tells blame to look
  past the commits it names. `--ignore-rev <sha>`, repeatable, does the same
  for a commit nobody has written down yet.

  An entry that names no commit here is left out and reported rather than
  passed on, saying which source named it. Given it, git refuses the blame —
  once per file — so a single typo would otherwise turn into every file in the
  repository coming back unreadable, with nothing on screen connecting the two.
  A file that exists but cannot be read stops the analysis with an explanation
  instead: carrying on would hand the reformatting back to whoever ran it and
  store that in the cache as though it were right.

  The menu screen says when commits are being looked past, because the
  ownership shown is then deliberately not what plain `git blame` reports. The
  commits are part of what decides whether a stored analysis may be reused;
  they are compared as resolved hashes, so the same commit written short, long
  or as a tag is one entry, and rewording a comment in the file changes
  nothing.

### Fixed

- **A reused analysis says which revision it describes.** The revision line
  and the count of uncommitted work were established by the analysis, which a
  cache hit skips — so they vanished on exactly the runs that happen most
  often. The faster the cache made LineLord, the less it said about its own
  answer.

## [0.8.0] — 2026-09-19

The first release since this changelog began, and it carries the whole of the
correctness work: a repository analysed with 0.7.2 and with this will not give
the same answer. Where the numbers moved, they moved because the old ones were
wrong. The entries below say which, and why.

Two changes are worth knowing about before upgrading. Identities are no longer
guessed, so a repository where the guessing was merging people will show more
contributors than it did — that is the correction, not a regression. And the
stored analysis is rebuilt once, because the database layout changed.

### Fixed — the numbers

- **A line's number is the number it has in the file.** Blank lines belong to
  nobody and are not stored, but they are still lines: the stored number was a
  count of the lines that were kept, so everything below the first blank line
  was recorded at the wrong position. Nothing displays it yet, which is why it
  went unnoticed — but the longevity work reports *where* the oldest surviving
  line is, and a line number that is wrong is worse than none at all. It now
  comes from git rather than from counting.

- **Commit times are stored as times, not as text.** Each line kept an ISO
  string rebuilt from the seconds `git blame` had already reported, and every
  question asked of it — is this line older than a year, which day was it
  written — was answered by comparing or re-parsing strings. That happened to
  work, for exactly as long as every value kept the same format and the same
  timezone. They are now whole seconds, compared as numbers.

- **Reading blame is now a function that can be tested.** It was a chain of
  `startsWith` checks over the output, with no way to verify it against
  anything; it is now `parseBlamePorcelain`, which takes a string and returns
  entries, and has tests for blank lines, tab-indented source, boundary
  commits, sha-256 hashes and content that looks like a header.

- **Different people are no longer merged into one.** Identities were matched
  by guessing from names and from addresses that merely resembled each other,
  and the threshold for an address was one character in a prefix of six or
  fewer. In a company where everyone shares a domain that is not an edge case:
  `mk@firma.no` and `ml@firma.no` became one person, as did `john@` and
  `joan@`, and `erik.hansen@` and `erika.hansen@`. One of each pair disappeared
  from the ranking entirely while the other was credited with their work.

  An email address is now an identity, and `.mailmap` — which `git blame`
  applies before LineLord sees a line — is how one person with several
  addresses is declared. `--fuzzy-authors` restores the guessing for anyone who
  needs it to work out what to put in a `.mailmap`.

  Repositories where this was happening will show more contributors than
  before. That is the correction, not a regression.

- **Unsaved work is no longer attributed to anyone.** `git blame` was reading
  the working copy, so anyone with uncommitted changes saw a contributor named
  "Not Committed Yet" ranked among real people, holding a title and a share of
  the codebase. The analysis now names an explicit revision, and reports which
  one on screen along with how many files were left out of it.
- **Source directories are no longer silently dropped.** Ignore patterns were
  matched as substrings, so `out/` excluded `src/checkout/`, `bin/` excluded
  `src/robin/`, and `build/` excluded `rebuild/`. They are now proper globs: a
  directory is excluded only when a whole path segment matches.
- **Test files count.** `*.test`, a Go pattern for a compiled test binary,
  matched any path containing `.test` and so excluded every `*.test.ts` in
  every JavaScript repository. Tests are code somebody wrote and owns.
- **Binary files no longer invent lines.** Detection was extension matching
  against a fixed list, and it was wrong in both directions: a blob with an
  unfamiliar extension or none at all was blamed as text and contributed
  fabricated lines to a real author, while `.svg` — markup somebody wrote — was
  discarded. git now makes the call, by the same rule it uses to decide whether
  to print a diff, and `.gitattributes` overrides it.
- **Long files are stored whole.** Every blame row binds five values, and a
  single insert statement for a long file asked SQLite to bind more parameters
  than it accepts. The insert failed, the failure was swallowed, and the file
  contributed nothing at all. A 20,000-line file stored zero lines; it now
  stores all of them.
- **Files that cannot be read are reported.** They were counted as analysed
  while contributing nothing, so the statistics claimed to have read a file the
  rest of the screen could not. They are now a category of their own, named on
  the menu screen.
- **The analysis is pinned to one commit.** Every command that reads the tree
  being analysed — the file listing, the binary check, and blame — is given a
  resolved SHA rather than `HEAD`, so a commit or branch switch partway through
  cannot leave the file list, the blame output and the revision on screen
  describing different trees. Resolving `HEAD` in the first place, and the
  advisory check for uncommitted changes, deliberately still read the symbolic
  ref: one produces the SHA, and the other is about the working copy as it is
  right now.
- **The contributor count matches the contributor list.** Repository statistics
  counted every author row, merged-away identities included.
- **A readable name wins over an encoded one.** The check for encoded author
  names tested against the base64 alphabet after stripping whitespace, which
  every plain ASCII name matches — so the name-quality comparison never ran,
  and a base64 blob or a one-letter name could become the canonical identity.
- **Everyone gets a real title.** With more contributors than the fifty titles
  available, ranks past the end of the table came back as the literal string
  "unknown" — 30 of 100 contributors, 110 of 200. Titles now repeat in a large
  team instead.

### Fixed — using it

- **A cache from an older LineLord is rebuilt instead of written into.** The
  fingerprint refused to *reuse* such a cache, which is not the same as being
  able to write one: the tables are created only if they are absent, so a
  column added in a later version was simply missing, and the run that
  rebuilt the analysis failed on every single file. The analysis was not
  wrong, it was absent — and it stayed absent, because the cache it failed to
  write was the same cache it failed to write next time. The layout is now
  stamped in the file itself, with SQLite's `user_version`, and a file stamped
  by another version is dropped and built again.

- **`-p` now points at the repository it names.** The short form of `--path`
  has been in the help text and the README since the first release, but it was
  never declared, so it was dropped rather than rejected: `linelord -p ~/other`
  analysed the current directory and reported the path it had been handed, and
  `linelord --clear-cache -p ~/other` forgot the wrong repository's analysis
  while saying it had forgotten the right one.

- **Invalid input is refused instead of quietly changing the answer.**
  `--threshold 0` or a negative value made every file count as oversized, so
  the analysis came back empty; a non-numeric value became `NaN`, and since
  every comparison against `NaN` is false, the threshold stopped applying at
  all. Both now fail with an explanation.
- **A directory that is not a repository says so**, rather than running a full
  analysis that finds zero of everything. A missing `git` is reported as such,
  separately, because it is a different problem with a different fix.
- **Running inside a subdirectory analyses the whole repository.** `git ls-tree`
  honours the current directory's prefix, so starting in `src/` covered only
  `src/` while still presenting itself as the repository's statistics.
- **A repository with no text in it is analysed.** One holding only binary
  files, or only empty ones, ended at the error screen.
- **Errors reach the screen rather than the terminal underneath it.** Ink owns
  the display while the app runs; diagnostics written past it appeared from
  nowhere and vanished on the next render. One failure — a warrior the lookup
  could not resolve — had no handling at all beyond that, and looked like a key
  press that never registered.

### Added

- **LineLord drafts the `.mailmap` for you.** Turning the guessing off left a
  real chore behind: the honest answer to "one person, several addresses" is a
  `.mailmap`, and working out what belongs in it meant reading a contributor
  list and typing the lines by hand. **Draft a .mailmap from identity guesses**
  on the menu shows what a guessing run would merge and writes the lines on a
  keypress; `--write-mailmap` does the same job without opening the interface,
  for a script or for someone who already knows what they want.

  The analysis behind it stays strict either way — nobody is merged, and the
  stored analysis the next ordinary run reuses is not disturbed. Lines the file
  already had are shown but not repeated, and nothing is ever overwritten or
  removed: a wrong guess is a line to delete.

  They are guesses, and it says so. Once a line is in the file, `git blame`
  applies it and the guess is never made again, so asking a second time has
  nothing left to write.

- **The default run says when two contributors may be one person.** It merges
  nothing, which is right, but it used to do so in silence: two entries for one
  person looked like two people, with no hint that LineLord had noticed. The
  menu screen now lists them with the reason for each guess — `the names
  "gorvek the ironbane" and "gorvek" are alike` — and points at the menu entry
  that records them. Both addresses still count separately.

- **The analysis is kept between runs.** It used to be thrown away when the
  process exited, so every launch read the whole repository again. A run that
  finds nothing has changed now reuses what it stored; a run after a few
  commits re-reads only the files those commits touched. Measured on a
  1,000-file repository: 12.2 s with no cache, 43 ms when nothing moved,
  547 ms after one file changed.

  What it will not do is guess. The revision, the size threshold, the
  `.mailmap`, the ignore rules and the analysis code itself are all recorded,
  and any of them differing means the whole repository is read again — with
  the reason shown, rather than a silent slowdown. A rebase, a force-push or a
  branch switch is a full re-read too: history that changed shape leaves no
  way to tell what survived.

  The cache lives in `$XDG_CACHE_HOME/linelord` (or `~/.cache/linelord`), one
  file per repository, and holds file paths, commit hashes and dates, and
  contributor names and email addresses — no file contents. If it cannot be
  written, the analysis runs anyway.

  `--no-cache`, `--refresh`, `--clear-cache` and `--clear-all-caches` control
  it. Caches nobody has opened for fifteen days are removed, and once the
  directory passes 500 MB the least recently used caches are deleted until it
  is back under. Two LineLords started on the same repository at once will not
  write over each other.

- **Brutal Barbarian Rankings**, a ranking by ground still held: territory
  owned, files conquered alone, and code that has outlived a year. Metrics
  counting weekend and night-time work were considered and cut; see the note on
  reading the numbers in the README.
- **Continuous integration** across Linux and macOS, running the type checker,
  the linter and the test suite on every push and pull request, with a per-file
  coverage threshold.
- **A test suite over the core logic.** 17 tests across 4 files became 157
  across 19. The services that produce every number LineLord reports had no
  coverage at all.
- **A `LICENSE` file** with the GPL-3.0 text the README has promised since the
  first release.

### Changed

- The Homebrew formula is updated automatically when a release is published,
  from the published checksums, so its version and its hashes cannot drift
  apart the way they did in 0.7.2 — which left the formula uninstallable on
  every platform for months.
- Release builds are smoke-tested before publication: each archive is unpacked,
  the binary this runner can execute is run, and the architecture of the rest
  is checked.
- Bun is pinned in both workflows rather than tracking `latest`, so a runtime
  release cannot change what is built or turn a green rerun red.
- Blame data no longer stores the text of each line. Nothing read it.

### Removed

- `src/utility/filtesToIgnore.ts` and `src/resources/titles.ts`, 277 lines
  between them, imported nowhere.
- The hand-maintained lists of binary file extensions, now that git decides:
  the one binary detection used, and `src/resources/fileExtensions.ts`, which
  held a second copy that nothing had imported.

## [0.7.2] — 2025-11-04

Earlier releases predate this changelog. See the
[releases page](https://github.com/MarkusAugust/linelord/releases).

[Unreleased]: https://github.com/MarkusAugust/linelord/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/MarkusAugust/linelord/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/MarkusAugust/linelord/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/MarkusAugust/linelord/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/MarkusAugust/linelord/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/MarkusAugust/linelord/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/MarkusAugust/linelord/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/MarkusAugust/linelord/releases/tag/v0.7.2
