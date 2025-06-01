export const rankedTitles = [
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
  'peasant' // 49 - Lowest common folk
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

// Helper function to get random titles from a range
const getRandomTitlesFromRange = (
  startIndex: number,
  endIndex: number,
  count: number
): string[] => {
  const rangeSize = endIndex - startIndex + 1
  const availableTitles = rankedTitles.slice(startIndex, endIndex + 1)

  if (count >= rangeSize) {
    // If we need more titles than available, return all and fill the rest randomly
    const allTitles = [...availableTitles]
    const remaining = count - rangeSize
    for (let i = 0; i < remaining; i++) {
      allTitles.push(
        availableTitles[Math.floor(Math.random() * rangeSize)] ?? 'unknown'
      )
    }
    return allTitles
  }

  // Randomly select without duplicates
  const shuffled = [...availableTitles].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

// Function to get evenly distributed titles based on number of developers
// Replace the getDistributedTitles function with this:
export const getDistributedTitles = (numDevs: number): string[] => {
  if (numDevs <= 0) return []

  const highbornRange = { start: 0, end: 11 } // 12 titles
  const middleRange = { start: 12, end: 37 } // 26 titles
  const lowbornRange = { start: 38, end: 49 } // 12 titles

  if (numDevs === 1) {
    // Single dev gets the best title
    return [getTitleByRank(0)]
  }

  if (numDevs === 2) {
    // Best and worst
    return [getTitleByRank(0), getTitleByRank(49)]
  }

  if (numDevs === 3) {
    // Best from each tier
    return [getTitleByRank(0), getTitleByRank(12), getTitleByRank(38)]
  }

  // For 4+ devs, distribute titles in strict rank order
  const highbornCount = Math.max(1, Math.floor(numDevs * 0.2))
  const lowbornCount = Math.max(1, Math.floor(numDevs * 0.2))
  const middleCount = numDevs - highbornCount - lowbornCount

  const titles: string[] = []

  // Assign best titles first (in rank order)
  for (let i = 0; i < highbornCount; i++) {
    titles.push(getTitleByRank(highbornRange.start + i))
  }

  // Then middle tier titles
  for (let i = 0; i < middleCount; i++) {
    titles.push(getTitleByRank(middleRange.start + i))
  }

  // Finally lowborn titles
  for (let i = 0; i < lowbornCount; i++) {
    titles.push(getTitleByRank(lowbornRange.start + i))
  }

  return titles
}

// Function to get distributed titles with names/assignments
export const getDistributedTitlesWithAssignment = (
  devNames: string[]
): Array<{ name: string; title: string; rank: number }> => {
  const titles = getDistributedTitles(devNames.length)

  return devNames.map((name, index) => ({
    name,
    title: titles[index] || 'peasant',
    rank: getRankByTitle(titles[index] || 'peasant')
  }))
}
