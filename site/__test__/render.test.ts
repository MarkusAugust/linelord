import { describe, expect, it } from 'bun:test'
import type { Report } from '../../src/core/report'
import { renderSite, SCREENS } from '../render'

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 1,
    linelord: '0.12.4',
    generatedAt: '2026-09-30T12:00:00.000Z',
    repository: {
      path: '/tmp/demo-repo',
      headSha: 'ac43e98f1b2c3d4e5f60718293a4b5c6d7e8f901',
      uncommittedFileCount: 0,
      ignoredRevisionCount: 1,
      ignoreRevSources: { file: true, flag: false },
      unresolvedIgnoreRevs: [],
    },
    files: {
      total: 14,
      analysed: 10,
      binary: 1,
      ignored: 2,
      large: 1,
      failed: 0,
      totalLines: 205,
      totalAuthors: 4,
    },
    contributors: [
      {
        id: 1,
        name: 'Captain Drusk',
        email: 'drusk@greycloaks.realm',
        displayName: 'Captain Drusk',
        totalLines: 76,
        totalFiles: 2,
        percentage: 37.07,
        title: 'legend',
        rank: 1,
      },
      {
        id: 2,
        name: 'Sarn the Faceless',
        email: 'sarn@kell.realm',
        displayName: 'Sarn the Faceless',
        totalLines: 55,
        totalFiles: 2,
        percentage: 26.83,
        title: 'slayer',
        rank: 2,
      },
    ],
    rankings: [
      {
        authorId: 1,
        name: 'Captain Drusk',
        email: 'drusk@greycloaks.realm',
        displayName: 'Captain Drusk',
        gorvekScore: 331,
        title: 'legend',
        metrics: {
          survivingLines: 76,
          battleScars: 70,
          territoryConquered: 2,
          soloQuestVictories: 2,
          weaponMastery: 1,
          ancientCodeSurvival: 76,
          massiveBattles: 0,
          totalCampaigns: 2,
        },
      },
    ],
    longevity: {
      repository: {
        survivingLines: 205,
        medianAgeDays: 640.5,
        ageHistogram: {
          underAWeek: 0,
          weekToMonth: 0,
          oneToThreeMonths: 55,
          threeToTwelveMonths: 0,
          oneToTwoYears: 74,
          overTwoYears: 76,
        },
        writtenInLast90Days: 0.268,
        oldestLine: {
          timestamp: 1600000000,
          path: 'src/legacy/oldrites.js',
          lineNumber: 1,
          ageDays: 1460,
        },
      },
      authors: [
        {
          authorId: 1,
          name: 'Captain Drusk',
          email: 'drusk@greycloaks.realm',
          survivingLines: 76,
          medianAgeDays: 1200,
          meanAgeDays: 1200,
          p10AgeDays: 1200,
          p90AgeDays: 1200,
          oldestLine: null,
          newestLine: null,
          ageHistogram: {
            underAWeek: 0,
            weekToMonth: 0,
            oneToThreeMonths: 0,
            threeToTwelveMonths: 0,
            oneToTwoYears: 0,
            overTwoYears: 76,
          },
          activeSpanDays: 0,
        },
      ],
    },
    identityCandidates: [
      {
        canonical: {
          name: 'Gorvek of Bonereach',
          email: 'gorvek@bonereach.realm',
        },
        absorbed: [
          {
            name: 'Gorvek of Bonereach',
            email: 'gorvek@kell.realm',
            reason: 'the same name',
          },
        ],
      },
    ],
    failures: [],
    history: null,
    disclaimer: [
      'Every number counts lines still alive in HEAD.',
      'This is a joke about conquest. It does not measure anyone.',
    ],
    ...overrides,
  } as Report
}

describe('renderSite', () => {
  it('is one HTML document, with a title and the stylesheet', () => {
    const html = renderSite(sampleReport())

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>')
    expect(html).toContain('style.css')
    expect(html).toContain('</html>')
  })

  it('loads Datastar, and nothing else it did not write', () => {
    const html = renderSite(sampleReport())

    expect(html).toContain(
      'https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js',
    )
    const scripts = html.match(/<script/g) ?? []
    expect(scripts.length).toBe(1)
  })

  it('gives every screen a panel and a way to reach it', () => {
    const html = renderSite(sampleReport())

    for (const screen of SCREENS) {
      expect(html).toContain(`data-show="$view === '${screen.id}'"`)
      expect(html).toContain(`data-on:click="$view = '${screen.id}'"`)
      expect(html).toContain(screen.label)
    }
    // The forms Datastar 1.0.4 defines. A dash where the colon belongs is not
    // an attribute Datastar knows, and it fails silently: no error, no signal,
    // and every panel hidden.
    expect(html).toContain(`data-signals="{view: '${SCREENS[0]?.id}'}"`)
    expect(html).not.toMatch(/data-signals-|data-on-click/)
  })

  it('names every contributor with their share, title and address', () => {
    const html = renderSite(sampleReport())

    expect(html).toContain('Captain Drusk')
    expect(html).toContain('drusk@greycloaks.realm')
    expect(html).toContain('legend')
    expect(html).toContain('37.1%')
  })

  it('reports what was set aside as well as what was read', () => {
    const html = renderSite(sampleReport())

    expect(html).toContain('10')
    expect(html).toContain('binary')
    expect(html).toContain('generated')
    expect(html).toContain('over the threshold')
  })

  it('formats ages as the terminal formats them', () => {
    const html = renderSite(sampleReport())

    // 640.5 days is "1y 9m" to formatAge, never "640.5 days".
    expect(html).toContain('1y 9m')
    expect(html).not.toContain('640.5')
  })

  it('says what the numbers are not, carrying the report own disclaimer', () => {
    const report = sampleReport()
    const html = renderSite(report)

    for (const line of report.disclaimer) {
      expect(html).toContain(line)
    }
  })

  it('shows the identity candidates nothing merged, and that nothing was', () => {
    const html = renderSite(sampleReport())

    expect(html).toContain('gorvek@kell.realm')
    expect(html).toContain('the same name')
    expect(html).toMatch(/nothing was merged/i)
  })

  it('says the reformatting commit was looked past', () => {
    const html = renderSite(sampleReport())

    expect(html).toMatch(/\.git-blame-ignore-revs/)
  })

  it('leaves out the half-life column when no history was walked', () => {
    const html = renderSite(sampleReport({ history: null }))

    expect(html).not.toContain('Half-life')
  })

  it('draws the survival figures when the history was walked', () => {
    const html = renderSite(
      sampleReport({
        history: {
          describes: 'ac43e98f1b2c3d4e5f60718293a4b5c6d7e8f901',
          snapshotCount: 8,
          authors: [
            {
              authorId: 1,
              name: 'Captain Drusk',
              email: 'drusk@greycloaks.realm',
              linesEverWritten: 100,
              survivingLines: 76,
              survivalRate: 0.76,
              halfLifeDays: 810,
              survivalCurve: [],
            },
          ],
        },
      }),
    )

    expect(html).toContain('Half-life')
    expect(html).toContain('2y 3m')
  })

  it('gives a row to the warrior with nothing left standing, and no false age', () => {
    const report = sampleReport()
    const html = renderSite({
      ...report,
      longevity: {
        ...report.longevity,
        authors: [
          ...report.longevity.authors,
          {
            authorId: 9,
            name: 'Brother Nask',
            email: 'nask@thurn.realm',
            survivingLines: 0,
            medianAgeDays: null,
            meanAgeDays: null,
            p10AgeDays: null,
            p90AgeDays: null,
            oldestLine: null,
            newestLine: null,
            ageHistogram: {
              underAWeek: 0,
              weekToMonth: 0,
              oneToThreeMonths: 0,
              threeToTwelveMonths: 0,
              oneToTwoYears: 0,
              overTwoYears: 0,
            },
            activeSpanDays: 0,
          },
        ],
      },
    } as Report)

    expect(html).toContain('Brother Nask')
    expect(html).toContain('nask@thurn.realm')
    // An age of zero would read as the newest code in the repository.
    expect(html).toContain('—')
    expect(html).not.toContain('<1d')
  })

  it('says code outlasted the history rather than saying nothing is known', () => {
    const html = renderSite(
      sampleReport({
        history: {
          describes: 'ac43e98f1b2c3d4e5f60718293a4b5c6d7e8f901',
          snapshotCount: 8,
          authors: [
            {
              authorId: 1,
              name: 'Captain Drusk',
              email: 'drusk@greycloaks.realm',
              linesEverWritten: 76,
              survivingLines: 76,
              survivalRate: 1,
              halfLifeDays: null,
              survivalCurve: [
                { ageDays: 0, fractionAlive: 1 },
                { ageDays: 1200, fractionAlive: 1 },
              ],
            },
          ],
        },
      }),
    )

    // A dash here would claim the history knows nothing, when what it knows is
    // that the work outlived everything it watched.
    expect(html).toContain('&gt; 3y 4m')
  })

  it('escapes what it puts in the page, so a name cannot close a tag', () => {
    const report = sampleReport()
    const nasty = '<script>alert(1)</script>'
    const html = renderSite({
      ...report,
      contributors: [
        { ...report.contributors[0], displayName: nasty, name: nasty },
      ],
    } as Report)

    expect(html).not.toContain(nasty)
    expect(html).toContain('&lt;script&gt;')
  })
})
