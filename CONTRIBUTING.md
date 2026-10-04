# Contributing to the Saga

> _"Bring steel, bring tests, and bring the README along with any change that moves what a screen says."_
>
> — Gorvek of Bonereach

LineLord is a Bun + TypeScript + OpenTUI + Drizzle/SQLite CLI that reads
`git blame` and reports who holds which line. **The numbers it prints are the
product.** A change that makes the code nicer and the numbers wrong is a bad
change, and a reviewer will say so.

## The forge

```bash
bun install
bun run dev -- -p /path/to/some/repository   # run from source, reloading on change
bun run typecheck
bunx biome ci .
bun test --coverage
```

Those last three are **the gate**, and they are exactly what CI runs. Run all
three before every push and read all three outputs, exit codes included.
`bun test` without `--coverage` is not the gate: the threshold in
`bunfig.toml` only applies with the flag, and a gate weaker than the check it
anticipates is not a gate. Piping output through `tail -1` can hide a failure
behind an escape code; it has.

## How work is done

- **One task, one branch, one pull request.** Name the branch for the task:
  `fix/B6-blame-parser`, `feat/L4-longevity-screen`, `docs/D3-contributing`.
- **Test first.** For every fix, write a test that fails before the change.
  Tests live in `src/**/__test__/`, beside what they test.
- **Never rewrite a pushed commit.** Add a new one.
- **Update README and CHANGELOG in the same commit as the behaviour change.**
  The CHANGELOG says, in plain words, what moved and why; where a change
  moves the numbers, it says so.
- **Nothing writes to stdout or stderr while the interface holds the
  screen.** Collect failures and render them; `getFailures()` on the
  LineLord record and the `AnalysisContext` exist for this.
- **Keys go through the one keymap** (`src/adapters/opentui/keymap.ts`): the
  arrows and vim's keys ask for the same things on every screen, and a
  screen says what they mean for it through `useScreenKeys`. A screen key of
  its own must be one the keymap leaves alone, and the screen's hint names
  it.
- **Every feature is reachable from inside the interface**, not only as a
  flag. Flags stay, for scripting; add the menu entry too.
- **User-facing options are command-line flags, never environment variables.**
- **No `any`.** `biome.json` holds the rules; follow them rather than working
  around them.
- **No new dependencies** without a reason a reviewer will accept.

## The shape of the code

LineLord is a hexagon: ports and adapters, and no classes. The README's
[architecture section](README.md#-architecture--ports-and-adapters) has the
drawing. The rules that follow from it:

- **`src/core`** holds the model — the analysis as plain values — and every
  calculation and decision. Functions only. Nothing in it imports from
  `src/adapters`, runs a process, opens a file or touches SQLite.
- **`src/ports`** are the interfaces the core is written against.
- **`src/adapters`** implement them. A new storage adapter must pass the
  contract test in `src/ports/__test__/storageContract.ts`.
- **`src/app`** is the composition root and the CLI. `src/app/ports.ts` is
  the one place the real adapters are chosen.
- **State a run needs is closed over** by `createLineLord`; dependencies are
  explicit arguments, never imported singletons.
- **The numbers are computed once, from values.** A screen never runs a
  query. A test of a calculation uses `src/core/__test__/fixtures.ts` or the
  in-memory store, never a seeded database.
- When the layout changes, the README's architecture section and its drawing
  change in the same commit.

## What the numbers mean

The tool counts lines and dates. It is not a measure of productivity and must
never be presented as one. Labels describe what is actually counted — a count
of blame lines is never labelled a count of commits — and the note about what
the numbers are not survives every rewording of every screen.

## The theme

LineLord wears a barbarian theme, and lays it on thick. Its names come from
the [Gallowmark canon](https://github.com/MarkusAugust/gallowmark): Gorvek of
Bonereach, Sarn the Faceless, Captain Drusk of the Greycloaks, Brother Nask
the river-priest, Vurn the Ashborn, the river-god Thurn, the drowned city of
Kell, the Ashfall. Use that vocabulary in screens, help text, tests and prose,
and do not invent a third register. **A name that is not in the canon is not
used here**: add it to Gallowmark first, then to LineLord.

The farewell quotes and the analysis messages are the canon's as well: they
are generated into `src/adapters/opentui/resources/gallowmarkQuotes.ts` by
`bun run sync-lore` (from a sibling checkout of Gallowmark, or fetched with
the GitHub CLI). Add or change a quote in Gallowmark's `quotes/`, rebuild its
export, run the sync here, and commit the generated file.

## Before you push: the self-review

The same handful of defects keep coming back. Walk the diff against this list.

1. **Does a `catch` swallow more than it means to?** `ENOENT` and `ENOTDIR`
   mean absent; anything else does not. A bare `catch {}` is only right when
   failing cannot change a number, and the comment says so.
2. **Does it still work when the cache is reused?** A reused run skips the
   analysis, so anything the interface reads must be derived from the store
   or resolved again. Write the test as two runs with `useCache: true`.
3. **Is a two-valued answer given to a three-valued question?** Use `??`
   rather than `||` for anything numeric or boolean. When "unknown" is a real
   state, return `null` for it and make the caller handle it.
4. **What else in the repository still claims the old behaviour?** After a
   behaviour change, grep `README.md`, `CHANGELOG.md`, the help text and the
   About screen, not just the file you edited.
5. **Has the feature been run on its own default path?** Run the actual
   binary, with no flags, on a repository that exercises the change, and look
   at the screen — through a pty if the change is in the interface.
6. **Is a test being bent around the defect?** When a test needs an odd
   workaround to pass, the workaround is the finding.
7. **Does a summary flag lose information the caller needs?** Carry
   provenance per item when the interface will attribute it.

## Versions and releases

LineLord follows Semantic Versioning. A feature is a minor bump and a fix is a
patch; from 1.0.0, a change that breaks something a person or a script relies
on — the `--json` schema, a flag, a key — is a major bump. A pre-release is
`X.Y.Z-rc.N`, starting at `rc.1`: the Release workflow marks a tag with a
hyphen as a pre-release and does not make it GitHub's latest release, but the
Homebrew tap is updated for it like any other, so `brew upgrade` brings the
release candidate. Releases are cut by the maintainer:

1. On a branch, stamp the version and date over `## [Unreleased]` in
   `CHANGELOG.md`, add the compare links, leave `Unreleased` empty, and merge
   it through a pull request with CI green.
2. On `master`, `bun run publish:minor` or `bun run publish:patch` bumps the
   version, tags it and pushes both. A pre-release is set by name instead:
   `npm version 1.0.0-rc.1 && bun run tag-release`. The Release workflow
   builds the macOS binaries on a macOS runner and the Linux ones on a Linux
   runner, starts the one each can and checks the other's architecture,
   publishes the GitHub release from a job that runs no other code, and
   updates the Homebrew tap.
   A change to the build is proven first by running the workflow by hand
   with `build_only`, which builds and smoke-tests without publishing.

Homebrew and the binaries on each release are the whole distribution story.
There is no npm package, no web interface and no Windows build, and none of
those is coming. "No web interface" means nobody drives LineLord through a
browser: there is no server, no hosted analysis and no GUI. The demo site under
`site/` is a different thing — a page that shows what the command-line tool
reports, built from a generated fixture repository at build time, serving
nothing and analysing nothing on request.

`--json` prints the analysis for another program to read, and exists so the
demo site can be built from LineLord's own numbers. It is the one
non-interactive path: the terminal interface is still the whole of the
interactive surface, with no plain-text fallback for the screens. Its shape is
something callers may depend on, so changing it is a behaviour change and the
CHANGELOG says what moved.
