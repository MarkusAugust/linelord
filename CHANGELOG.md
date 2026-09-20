# Changelog

Notable changes to LineLord. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Where a change moves the numbers LineLord reports, this says so. Several below
do, and a repository analysed before and after will not give the same answer —
because the earlier answer was wrong.

## [Unreleased]

Nothing yet.

## [0.9.0] — 2026-09-20

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

[Unreleased]: https://github.com/MarkusAugust/linelord/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/MarkusAugust/linelord/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/MarkusAugust/linelord/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/MarkusAugust/linelord/releases/tag/v0.7.2
