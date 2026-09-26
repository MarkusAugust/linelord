import type { AnalysisData, FileRecord } from './model'

/**
 * Gorvek's brutal barbarian rankings.
 *
 * "By the old gods and the new, this shall reveal the mightiest warriors
 *  who have conquered the digital realm!"
 *
 * A note on what this does and does not measure, because the theming must
 * not hide it. Every metric here counts lines that are still alive in the
 * analysed revision, and nothing else. It does not count commits, it does
 * not look at when in the day or week anyone worked, and it says nothing
 * about whether the code is any good -- code nobody dares touch scores
 * exactly as well as code that earned its place. The ranking is a joke
 * about conquest, not a measure of anyone's productivity, and it should
 * never be used as one.
 *
 * - Gorvek of Bonereach
 */

export interface BarbarianWarriorMetrics {
  /** Lines this warrior owns in the analysed revision. Zero means they hold no ground. */
  survivingLines: number
  /** Surviving lines that sit in large or legacy-looking files. */
  battleScars: number
  /** Files where this warrior owns more than half the surviving lines. */
  territoryConquered: number
  /** Files where every surviving line is theirs. */
  soloQuestVictories: number
  /** Distinct file extensions they have surviving lines in. */
  weaponMastery: number
  /** Surviving lines last touched more than a year ago. */
  ancientCodeSurvival: number
  /** Days on which more than 100 of their surviving lines were last touched. */
  massiveBattles: number
  /** Distinct days on which any of their surviving lines were last touched. */
  totalCampaigns: number
}

export interface BarbarianRanking {
  authorId: number
  name: string
  email: string
  displayName: string
  metrics: BarbarianWarriorMetrics
  gorvekScore: number
  /**
   * The title the line-share ranking gave them, the same one every other
   * screen shows. There used to be a second distribution here, by Gorvek
   * score, so one person wore two titles depending on the screen.
   */
  title: string | null
  specialAchievements: string[]
  /** Zero-based position in the ranking. */
  rank: number
}

/**
 * Where a file counts as big enough to leave a scar on whoever works in it.
 *
 * This is independent of `--threshold`, and the two interact. No blame line
 * is ever stored for a file above the threshold, so this rule can only ever
 * select files between the two numbers: larger than this, smaller than the
 * threshold. With the default 50 KB threshold that is a wide band and most
 * battle scars come from it. Set `--threshold` below this and the size rule
 * selects nothing at all, leaving only the extension and path rules --
 * scars drop sharply, and that is the analysis working as configured.
 */
const LEGACY_FILE_SIZE_BYTES = 5000

const LEGACY_EXTENSIONS = new Set(['.js', '.php', '.asp', '.jsp'])
const LEGACY_PATH_WORDS = ['legacy', 'old', 'deprecated']

/** A day on which this many of a warrior's surviving lines were last touched. */
const MASSIVE_BATTLE_LINES = 100

/** Files that look dangerous enough to leave a mark on whoever works in them. */
export function looksLegacy(file: FileRecord): boolean {
  if (file.size > LEGACY_FILE_SIZE_BYTES) return true
  if (file.extension !== null && LEGACY_EXTENSIONS.has(file.extension)) {
    return true
  }
  // Matched without regard to case, as the `LIKE` this replaces did.
  const path = file.path.toLowerCase()
  return LEGACY_PATH_WORDS.some((word) => path.includes(word))
}

const EMPTY_METRICS: BarbarianWarriorMetrics = {
  survivingLines: 0,
  battleScars: 0,
  territoryConquered: 0,
  soloQuestVictories: 0,
  weaponMastery: 0,
  ancientCodeSurvival: 0,
  massiveBattles: 0,
  totalCampaigns: 0,
}

/** The UTC calendar day a timestamp falls on, as one number. */
function dayOf(timestamp: number): number {
  return Math.floor(timestamp / (24 * 60 * 60))
}

/** Every metric for every author who holds a line. */
function collectMetrics(
  data: AnalysisData,
  now: Date,
): Map<number, BarbarianWarriorMetrics> {
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  // Whole seconds, to compare against the stored author time as a number.
  const ancientCutoff = Math.floor(oneYearAgo.getTime() / 1000)

  const files = new Map(data.files.map((file) => [file.id, file]))

  const byAuthor = new Map<number, BarbarianWarriorMetrics>()
  const extensions = new Map<number, Set<string>>()
  const perFile = new Map<number, Map<number, number>>()
  const fileTotals = new Map<number, number>()
  const perDay = new Map<number, Map<number, number>>()

  const metricsFor = (authorId: number): BarbarianWarriorMetrics => {
    const existing = byAuthor.get(authorId)
    if (existing) return existing
    const created = { ...EMPTY_METRICS }
    byAuthor.set(authorId, created)
    return created
  }

  for (const line of data.lines) {
    const file = files.get(line.fileId)
    if (!file) continue
    const metrics = metricsFor(line.authorId)

    metrics.survivingLines += 1
    if (looksLegacy(file)) metrics.battleScars += 1
    if (file.extension !== null) {
      const held = extensions.get(line.authorId) ?? new Set<string>()
      held.add(file.extension)
      extensions.set(line.authorId, held)
    }
    if (line.commitTimestamp !== null && line.commitTimestamp < ancientCutoff) {
      metrics.ancientCodeSurvival += 1
    }

    const own = perFile.get(line.authorId) ?? new Map<number, number>()
    own.set(line.fileId, (own.get(line.fileId) ?? 0) + 1)
    perFile.set(line.authorId, own)
    fileTotals.set(line.fileId, (fileTotals.get(line.fileId) ?? 0) + 1)

    if (line.commitTimestamp !== null) {
      const days = perDay.get(line.authorId) ?? new Map<number, number>()
      const day = dayOf(line.commitTimestamp)
      days.set(day, (days.get(day) ?? 0) + 1)
      perDay.set(line.authorId, days)
    }
  }

  for (const [authorId, metrics] of byAuthor) {
    metrics.weaponMastery = extensions.get(authorId)?.size ?? 0

    for (const [fileId, authorLines] of perFile.get(authorId) ?? []) {
      const total = fileTotals.get(fileId) ?? 0
      if (authorLines * 2 > total) metrics.territoryConquered += 1
      if (authorLines === total) metrics.soloQuestVictories += 1
    }

    for (const dayLines of perDay.get(authorId)?.values() ?? []) {
      metrics.totalCampaigns += 1
      if (dayLines > MASSIVE_BATTLE_LINES) metrics.massiveBattles += 1
    }
  }

  return byAuthor
}

/**
 * The legendary Gorvek Score.
 *
 * Three categories, each counting a different kind of claim on the codebase:
 * how much ground a warrior holds, how long their work has stood, and how
 * concentrated their bursts of work were. Ownership is weighted hardest,
 * because holding a whole file is a stronger claim than having touched many.
 */
export function gorvekScore(metrics: BarbarianWarriorMetrics): number {
  const conquest =
    metrics.territoryConquered * 8.0 +
    metrics.soloQuestVictories * 12.0 +
    Math.log(Math.max(1, metrics.weaponMastery)) * 6.0

  const endurance =
    metrics.ancientCodeSurvival * 1.5 + metrics.battleScars * 2.0

  const intensity =
    metrics.massiveBattles * 5.0 +
    Math.log(Math.max(1, metrics.totalCampaigns)) * 3.0

  const categories = [conquest, endurance, intensity]
  const weakest = Math.min(...categories)
  const strongest = Math.max(...categories)

  // Reward warriors who are not hopeless in any one category...
  let synergyBonus = 0
  if (weakest > 20) synergyBonus += 15
  if (weakest > 50) synergyBonus += 25
  // ...and specialists who dominate a single one.
  if (strongest > 100) synergyBonus += 10

  const totalScore = conquest + endurance + intensity + synergyBonus

  return Math.round(totalScore * 100) / 100
}

const ACHIEVEMENTS: Array<{
  metric: keyof BarbarianWarriorMetrics
  title: string
}> = [
  { metric: 'battleScars', title: '🗡️  Slayer of Legacy Dragons' },
  { metric: 'territoryConquered', title: '🏰 Conqueror of Domains' },
  { metric: 'soloQuestVictories', title: '🛡️  Lone Wolf Warrior' },
  { metric: 'weaponMastery', title: '⚡ Master of Many Weapons' },
  { metric: 'ancientCodeSurvival', title: '🏺 Guardian of Ancient Code' },
  { metric: 'massiveBattles', title: '💥 Breaker of Mountains' },
  { metric: 'totalCampaigns', title: '🔥 Veteran of a Hundred Battles' },
]

/**
 * Award each achievement to the single warrior who leads that category, and
 * only when they actually have something to show for it. A tie goes to
 * whoever ranks higher.
 */
function withAchievements(rankings: BarbarianRanking[]): BarbarianRanking[] {
  if (rankings.length === 0) return rankings
  const first = rankings[0]
  if (!first) return rankings

  for (const { metric, title } of ACHIEVEMENTS) {
    const leader = rankings.reduce(
      (best, warrior) =>
        warrior.metrics[metric] > best.metrics[metric] ? warrior : best,
      first,
    )
    if (leader.metrics[metric] > 0) {
      leader.specialAchievements.push(title)
    }
  }
  return rankings
}

/**
 * Complete barbarian rankings for every warrior who holds ground.
 *
 * `now` is a parameter rather than read from the clock, so that ancient-code
 * survival is deterministic in a test.
 */
export function barbarianRankings(
  data: AnalysisData,
  now: Date = new Date(),
): BarbarianRanking[] {
  const metricsByAuthor = collectMetrics(data, now)

  const rankings = data.authors
    .filter((author) => author.isCanonical)
    .map((author): BarbarianRanking => {
      const metrics = metricsByAuthor.get(author.id) ?? { ...EMPTY_METRICS }
      return {
        authorId: author.id,
        name: author.name,
        email: author.email,
        displayName: author.displayName,
        metrics,
        gorvekScore: gorvekScore(metrics),
        title: author.title,
        specialAchievements: [],
        rank: 0,
      }
    })
    // A warrior with no surviving lines holds no ground, and handing them a
    // place would pad the ranking with people the codebase has forgotten.
    .filter((ranking) => ranking.metrics.survivingLines > 0)
    .sort((a, b) => b.gorvekScore - a.gorvekScore)
    .map((ranking, index) => ({ ...ranking, rank: index }))

  return withAchievements(rankings)
}
