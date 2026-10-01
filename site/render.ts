/**
 * The demo page, written from one `--json` report.
 *
 * The page is a showcase of what the command-line tool says, not a way to use
 * it: the numbers are baked in at build time from a generated fixture
 * repository, and nothing here analyses anything. Datastar carries the only
 * interaction, which is choosing a screen — the same choice the menu offers in
 * the terminal.
 *
 * The ages are formatted by the terminal's own formatter rather than a second
 * one written here. "1y 9m" has to mean the same thing on the page as on the
 * screen, and two implementations of that are two chances to disagree.
 */

import {
  formatAge,
  formatSpread,
  renderAgeSparkline,
} from '../src/adapters/ink/format/ageFormatting'
import { halfLifeOf } from '../src/core/longevity'
import type { Report } from '../src/core/report'

/*
 * The attribute forms are the ones Datastar 1.0.4 actually defines:
 * `data-signals="{name: value}"` (or `data-signals:name`), and `data-on:click`
 * with a colon. `data-signals-view` and `data-on-click` are not Datastar
 * attributes at all — the library ignores them, no error is raised anywhere,
 * and every panel stays hidden because the signal it is comparing against was
 * never declared.
 */
const DATASTAR =
  'https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js'

export const SCREENS = [
  { id: 'overview', label: 'Repository Overview' },
  { id: 'rankings', label: 'Brutal Barbarian Rankings' },
  { id: 'longevity', label: 'Code Longevity' },
  { id: 'identity', label: 'One Warrior, Many Names' },
] as const

/** Everything interpolated into the page goes through this. Named `escapeHtml`
 * rather than `escape` because that is a global, and shadowing it is the same
 * mistake as naming a signal `screen`. */
function escapeHtml(value: string | number | null): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const share = (percentage: number): string => `${percentage.toFixed(1)}%`

/** A proportional bar, in the blocks the terminal draws it with. */
function bar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

function menu(): string {
  const items = SCREENS.map(
    (screen, index) => `
      <button
        type="button"
        class="menu-item"
        data-on:click="$view = '${screen.id}'"
        data-class="{active: $view === '${screen.id}'}"
      >
        <span class="menu-number">${index + 1}</span>
        ${escapeHtml(screen.label)}
      </button>`,
  ).join('')

  return `<nav class="menu" aria-label="Screens">${items}</nav>`
}

function panel(id: string, heading: string, body: string): string {
  return `
    <section class="panel" data-show="$view === '${id}'" aria-label="${escapeHtml(heading)}">
      <h2>${escapeHtml(heading)}</h2>
      ${body}
    </section>`
}

function renderOverview(report: Report): string {
  const { files, contributors } = report
  const rows = contributors
    .map(
      (one) => `
      <tr>
        <td class="num">${one.rank ?? ''}</td>
        <td>
          <span class="warrior">${escapeHtml(one.displayName)}</span>
          <span class="address">${escapeHtml(one.email)}</span>
          ${one.title ? `<span class="title">${escapeHtml(one.title)}</span>` : ''}
        </td>
        <td class="num">${share(one.percentage)}</td>
        <td class="num">${one.totalLines}</td>
        <td class="bar">${bar(one.percentage)}</td>
      </tr>`,
    )
    .join('')

  return `
    <p class="lede">
      ${files.analysed} of ${files.total} tracked files were read. The rest were
      set aside: ${files.binary} binary, ${files.ignored} generated,
      ${files.large} over the threshold${files.failed > 0 ? `, ${files.failed} unreadable` : ''}.
      ${files.totalLines} lines still stand, held by ${files.totalAuthors} warriors.
    </p>
    <table>
      <thead>
        <tr><th>#</th><th>Warrior</th><th>Share</th><th>Lines</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

const RANKING_COLUMNS = [
  { key: 'battleScars', short: 'Scars', label: 'Battle Scars' },
  { key: 'territoryConquered', short: 'Terr', label: 'Territory Conquered' },
  { key: 'soloQuestVictories', short: 'Solo', label: 'Solo Quests' },
  { key: 'weaponMastery', short: 'Types', label: 'Weapon Mastery' },
  { key: 'ancientCodeSurvival', short: 'Anc', label: 'Ancient Code' },
  { key: 'massiveBattles', short: 'Mass', label: 'Massive Battles' },
  { key: 'totalCampaigns', short: 'Camp', label: 'Campaigns' },
] as const

function renderRankings(report: Report): string {
  const head = RANKING_COLUMNS.map(
    (column) => `<th title="${escapeHtml(column.label)}">${column.short}</th>`,
  ).join('')

  const rows = report.rankings
    .map(
      (one, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <span class="warrior">${escapeHtml(one.displayName)}</span>
          <span class="address">${escapeHtml(one.email)}</span>
        </td>
        <td class="num">${one.gorvekScore}</td>
        <td class="num">${one.metrics.survivingLines}</td>
        ${RANKING_COLUMNS.map(
          (column) => `<td class="num">${one.metrics[column.key]}</td>`,
        ).join('')}
      </tr>`,
    )
    .join('')

  const legend = RANKING_COLUMNS.map(
    (column) => `<dt>${column.short}</dt><dd>${escapeHtml(column.label)}</dd>`,
  ).join('')

  return `
    <p class="lede">
      A ranking by conquest rather than by volume. Every metric counts lines
      still alive in the analysed revision.
    </p>
    <table>
      <thead>
        <tr><th>#</th><th>Warrior</th><th>Score</th><th>Lines</th>${head}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <dl class="legend">${legend}</dl>`
}

function renderLongevity(report: Report): string {
  const { repository, authors } = report.longevity
  const history = report.history
  const survival = new Map(
    (history?.authors ?? []).map((one) => [one.authorId, one]),
  )

  // The same three answers the terminal gives. A dash where "> 3y 4m" belongs
  // says nothing is known about code that in fact outlived the whole history.
  const halfLife = (authorId: number): string => {
    const life = halfLifeOf(survival.get(authorId))
    if (life.kind === 'unknown') return '—'
    if (life.kind === 'outlasted') return `> ${formatAge(life.days)}`
    return formatAge(life.days)
  }

  const rows = authors
    .map(
      (one, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <span class="warrior">${escapeHtml(one.name)}</span>
          <span class="address">${escapeHtml(one.email)}</span>
        </td>
        <td class="num">${one.survivingLines}</td>
        <td class="num">${escapeHtml(formatAge(one.medianAgeDays ?? Number.NaN))}</td>
        <td class="num">${escapeHtml(
          formatSpread(
            one.p10AgeDays ?? Number.NaN,
            one.p90AgeDays ?? Number.NaN,
          ),
        )}</td>
        ${history ? `<td class="num">${escapeHtml(halfLife(one.authorId))}</td>` : ''}
        <td class="spark">${escapeHtml(renderAgeSparkline(one.ageHistogram))}</td>
      </tr>`,
    )
    .join('')

  const oldest = repository.oldestLine
  const historyNote = history
    ? `<p class="lede">The history was walked over ${history.snapshotCount} revisions, which is
       where the half-life comes from: how long until half of a month's work is
       gone. A dash means the history saw that code only once and knows nothing
       either way — which is not the same as short-lived.</p>`
    : `<p class="lede">This page was built without <code>--history</code>, so there is no
       half-life here: these figures describe the age of what survives, and say
       nothing about the code that is already gone.</p>`

  return `
    <p class="lede">
      The codebase is ${escapeHtml(formatAge(repository.medianAgeDays ?? Number.NaN))} old at the middle,
      ${Math.round(repository.writtenInLast90Days * 100)}% of it last touched within ninety days.
      ${oldest ? `Oldest line still standing: <code>${escapeHtml(oldest.path)}:${oldest.lineNumber}</code> — ${escapeHtml(formatAge(oldest.ageDays))} old.` : ''}
    </p>
    ${historyNote}
    <table>
      <thead>
        <tr>
          <th>#</th><th>Warrior</th><th>Lines</th><th>Median</th>
          <th>Spread (p10–p90)</th>${history ? '<th>Half-life</th>' : ''}
          <th>New → old</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="aside">
      In the terminal <kbd>m</kbd>, <kbd>a</kbd> and <kbd>l</kbd> re-sort by
      median, mean and lines, and <kbd>h</kbd> and <kbd>s</kbd> by half-life and
      survival once the history is walked.
    </p>`
}

function renderIdentity(report: Report): string {
  if (report.identityCandidates.length === 0) {
    return `<p class="lede">Every contributor in this repository committed under one address,
      so there is nothing to decide.</p>`
  }

  const candidates = report.identityCandidates
    .map(
      (one) => `
      <li>
        <span class="warrior">${escapeHtml(one.canonical.name)}</span>
        <span class="address">${escapeHtml(one.canonical.email)}</span>
        <ul>${one.absorbed
          .map(
            (other) =>
              `<li>← <span class="address">${escapeHtml(other.email)}</span> — ${escapeHtml(other.reason)}</li>`,
          )
          .join('')}</ul>
      </li>`,
    )
    .join('')

  const draft = report.identityCandidates
    .flatMap((one) =>
      one.absorbed.map(
        (other) =>
          `${one.canonical.name} &lt;${escapeHtml(one.canonical.email)}&gt; &lt;${escapeHtml(other.email)}&gt;`,
      ),
    )
    .join('\n')

  return `
    <p class="lede">
      An email address is an identity, and nothing is inferred from names. Where
      two contributors look like one person LineLord says so and
      <strong>nothing was merged</strong> — both addresses keep their own place
      in the ranking, because two entries for one warrior should be a thing you
      decide about rather than a thing you have to notice.
    </p>
    <ul class="candidates">${candidates}</ul>
    <p class="lede">
      <code>--write-mailmap</code>, or <kbd>w</kbd> on that screen, drafts these
      into a <code>.mailmap</code> — the file git itself reads. They are guesses,
      and the guessing is wrong often enough to matter, so read them before
      committing them:
    </p>
    <pre class="draft">${draft}</pre>`
}

function renderHeader(report: Report): string {
  const { repository } = report
  const lookingPast =
    repository.ignoredRevisionCount > 0
      ? `<p class="note">Looking past ${repository.ignoredRevisionCount} commit
         named in <code>.git-blame-ignore-revs</code>, so their lines are
         credited to whoever wrote them rather than to whoever reformatted
         them.</p>`
      : ''

  return `
    <header>
      <h1>LineLord</h1>
      <p class="tagline">The Barbarian's Guide to Git Repository Conquest</p>
      <p class="quote">
        “What is best in code? To crush the bugs, see them driven from your
        repository, and to hear the lamentations of their stack traces!”
        <span class="attribution">— Gorvek of Bonereach</span>
      </p>
      <p class="note">
        Every number below was read by LineLord
        ${escapeHtml(report.linelord)} from a generated demo repository, at the
        revision <code>${escapeHtml((repository.headSha ?? '').slice(0, 8))}</code>.
        Nothing on this page is analysed when you load it — LineLord is a
        terminal tool, and this is what it reports.
      </p>
      ${lookingPast}
    </header>`
}

function renderFooter(report: Report): string {
  return `
    <footer>
      <h2>What the Numbers Are, and Are Not</h2>
      <ul class="disclaimer">
        ${report.disclaimer.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
      <h2>Claim Your Weapon</h2>
      <pre class="install">brew tap markusaugust/linelord
brew install linelord</pre>
      <p class="note">
        The repository surveyed here is built by
        <code>bun run demo:repo</code> and exists only for this page: four
        addresses, one warrior who used two of them, a reformatting worth
        looking past, and one contributor whose every line has since been
        rewritten. Source at
        <a href="https://github.com/MarkusAugust/linelord">github.com/MarkusAugust/linelord</a>.
      </p>
    </footer>`
}

export function renderSite(report: Report): string {
  const panels = [
    panel('overview', 'Repository Overview', renderOverview(report)),
    panel('rankings', 'Brutal Barbarian Rankings', renderRankings(report)),
    panel('longevity', 'Code Longevity', renderLongevity(report)),
    panel('identity', 'One Warrior, Many Names', renderIdentity(report)),
  ].join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LineLord — who holds your codebase</title>
    <meta
      name="description"
      content="What LineLord reports about a repository: who holds which line, how old it is, and how long code lasts."
    />
    <link rel="stylesheet" href="style.css" />
    <script type="module" src="${DATASTAR}"></script>
  </head>
  <body data-signals="{view: '${SCREENS[0]?.id}'}">
    <main>
      ${renderHeader(report)}
      ${menu()}
      ${panels}
      ${renderFooter(report)}
    </main>
  </body>
</html>
`
}
