export const rankedTitles = [
  // THE EPIC FIVE (0-4) are worn only by the top three to five warriors.
  // 5-23 are part of the order but not handed out by getDistributedTitles;
  // everyone below the crowned is spread from 'barbarian' (24) to 'peasant'.
  // HIGHBORN TITLES (0-11) - 12 titles
  'legend', // 0 - Mythical, greatest of all
  'line breaker', // 1 - Ultimate coder
  'conqueror', // 2 - Takes kingdoms by force
  'destroyer', // 3 - Brings ruin to enemies
  'warlord', // 4 - Commands great armies
  'war chief', // 5 - Leads warrior tribes
  'battle lord', // 6 - Master of warfare
  'chieftain', // 7 - Tribal leader
  'champion', // 8 - Proven in battle
  'crusader', // 9 - Holy warrior
  'hero', // 10 - Celebrated warrior
  'knight', // 11 - Noble warrior

  // MIDDLE TIER (12-37) - 26 titles
  'vanquisher', // 12 - Defeats enemies
  'slayer', // 13 - Kills monsters/enemies
  'berserker', // 14 - Fierce fighter
  'gladiator', // 15 - Arena fighter
  'warrior', // 16 - Professional fighter
  'blade master', // 17 - Master swordsman
  'swordsman', // 18 - Skilled with blade
  'reaver', // 19 - Raiding warrior
  'marauder', // 20 - Roving fighter
  'raider', // 21 - Attacks settlements
  'mercenary', // 22 - Fights for coin
  'fighter', // 23 - Basic combatant
  'barbarian', // 24 - Uncivilized warrior
  'savage', // 25 - Primitive fighter
  'code slayer', // 26 - Tech warrior
  'git warrior', // 27 - Version control fighter
  'commit crusher', // 28 - Code destroyer
  'line conqueror', // 29 - Code line master
  'blacksmith', // 30 - Forges weapons/tools
  'merchant', // 31 - Trades goods
  'scribe', // 32 - Writes/records
  'weaver', // 33 - Creates cloth
  'fisherman', // 34 - Catches fish
  'shepherd', // 35 - Tends flocks
  'tavern keeper', // 36 - Runs drinking establishment
  'peddler', // 37 - Traveling merchant (moved down)

  // LOWBORN TITLES (38-49) - 12 titles
  'potter', // 38 - Makes pottery
  'baker', // 39 - Bakes bread
  'cooper', // 40 - Makes barrels
  'tanner', // 41 - Prepares leather
  'cobbler', // 42 - Makes shoes
  'woodcutter', // 43 - Cuts trees
  'mine worker', // 44 - Works in mines
  'dock worker', // 45 - Works at docks
  'field hand', // 46 - Farm laborer
  'stable boy', // 47 - Tends horses
  'kitchen wench', // 48 - Kitchen servant
  'peasant', // 49 - Lowest common folk
]

// Function to get title by rank (0 = highest, 49 = lowest)
export const getTitleByRank = (rank: number): string => {
  if (rank < 0 || rank >= rankedTitles.length) {
    return 'unknown'
  }
  return rankedTitles[rank] ?? 'unknown'
}

// Function to get rank by title (returns -1 if not found)
export const getRankByTitle = (title: string): number => {
  return rankedTitles.indexOf(title.toLowerCase())
}

// Function to get a title range (e.g., top 10, bottom 5, etc.)
export const getTitleRange = (startRank: number, endRank: number): string[] => {
  return rankedTitles.slice(startRank, endRank + 1)
}

/** The titles that sound like something: only the top few ever wear them. */
export const EPIC_TITLES: readonly string[] = rankedTitles.slice(0, 5)

/** Where the humbler titles begin, the ones everyone below the crowned is given. */
const HUMBLE_FROM = rankedTitles.indexOf('barbarian')

/**
 * The titles for a realm of `numDevs` warriors, in rank order.
 *
 * The titles are a joke, and the joke only works if few are crowned and
 * somebody is always at the bottom. So the top three to five -- fewer in a
 * small realm -- take the epic titles in order, and everyone else is spread
 * evenly from "barbarian" down to the last title of all, so the last place
 * is always a peasant. With more warriors than humble titles, neighbours
 * share one.
 */
export const getDistributedTitles = (numDevs: number): string[] => {
  if (numDevs <= 0) return []
  if (numDevs === 1) return [getTitleByRank(0)]

  const crowned = Math.min(
    EPIC_TITLES.length,
    numDevs <= 4 ? numDevs - 1 : Math.round(numDevs / 4) + 2,
  )
  const rest = numDevs - crowned
  const last = rankedTitles.length - 1

  return [
    ...EPIC_TITLES.slice(0, crowned),
    ...Array.from({ length: rest }, (_, index) =>
      getTitleByRank(
        rest === 1
          ? last
          : HUMBLE_FROM +
              Math.round((index * (last - HUMBLE_FROM)) / (rest - 1)),
      ),
    ),
  ]
}

// Function to get distributed titles with names/assignments
export const getDistributedTitlesWithAssignment = (
  devNames: string[],
): Array<{ name: string; title: string; rank: number }> => {
  const titles = getDistributedTitles(devNames.length)

  return devNames.map((name, index) => ({
    name,
    title: titles[index] || 'peasant',
    rank: getRankByTitle(titles[index] || 'peasant'),
  }))
}
