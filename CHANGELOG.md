# Changelog

Notable changes to LineLord. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Where a change moves the numbers LineLord reports, this says so. Several below
do, and a repository analysed before and after will not give the same answer —
because the earlier answer was wrong.

## [Unreleased]

### Fixed — the numbers

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

- `src/utility/filtesToIgnore.ts`, 152 lines imported nowhere.
- The hand-maintained lists of binary file extensions, now that git decides:
  the one binary detection used, and `src/resources/fileExtensions.ts`, which
  held a second copy that nothing had imported.

## [0.7.2] — 2025-11-04

Earlier releases predate this changelog. See the
[releases page](https://github.com/MarkusAugust/linelord/releases).

[Unreleased]: https://github.com/MarkusAugust/linelord/compare/v0.7.2...HEAD
[0.7.2]: https://github.com/MarkusAugust/linelord/releases/tag/v0.7.2
