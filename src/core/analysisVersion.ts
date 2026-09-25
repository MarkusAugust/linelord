/**
 * The version of the analysis itself, not of the program.
 *
 * A cache is only reusable if the code that built it would still produce the
 * same answer. Keying that on the package version would be safe and automatic,
 * but it would throw away every user's cache on every release, including one
 * that only touched the README. So this is bumped by hand instead — which
 * means forgetting to bump it serves numbers built by older logic as though
 * they were current.
 *
 * Bump it when a change would make the analysis produce a different answer for
 * an unchanged repository. In practice that means:
 *
 * - how blame output is parsed, or which revision it is asked about
 * - which files are discovered, classified as binary, ignored, or set aside
 * - what is stored per line, or how lines are counted
 * - how authors are matched, merged, or chosen as canonical
 * - how ranks, titles or percentages are derived
 *
 * It does not need bumping for anything the analysis cannot see: interface
 * work, wording, tests, build and release changes, or refactoring that
 * provably preserves behaviour.
 *
 * When in doubt, bump it. A needless re-analysis costs seconds. Serving a
 * stale answer costs the user's trust in every number on the screen, and they
 * have no way to tell that it happened.
 */
export const ANALYSIS_VERSION = 1
