export const titles = [
  'barbarian',
  'iron lord',
  'dark champion',
  'blood knight',
  'warrior',
  'conqueror',
  'champion',
  'chieftain',
  'king',
  'warlord',
  'savage',
  'berserker',
  'doom bringer',
  'shadow stalker',
  'flame bearer',
  'storm rider',
  'iron fist',
  'slayer',
  'reaver',
  'raider',
  'mercenary',
  'gladiator',
  'knight',
  'hero',
  'legend',
  'destroyer',
  'vanquisher',
  'crusader',
  'marauder',
  'fighter',
  'swordsman',
  'blade master',
  'war chief',
  'battle lord',
  'code slayer',
  'git warrior',
  'commit crusher',
  'line conqueror',
]

export const commonTitles = [
  'ale keeper',
  'grain miller',
  'candle maker',
  'rope maker',
  'bone carver',
  'herb gatherer',
  'water bearer',

  'chimney sweep',
  'town crier',
  'gate keeper',
  'torch bearer',
  'cart driver',
  'pack mule',
  'message runner',
  'well digger',
  'fence mender',
  'pig keeper',
  'goat herder',
  'chicken tender',
  'turnip farmer',
  'mushroom picker',
  'swamp crawler',
  'mud wrestler',

  'serf',
  'scribe',
  'blacksmith',
  'tavern keeper',
  'merchant',
  'peddler',
  'stable boy',
  'kitchen wench',
  'field hand',
  'shepherd',
  'fisherman',
  'weaver',
  'potter',
  'baker',
  'cooper',
  'tanner',
  'cobbler',
  'woodcutter',
  'mine worker',
  'dock worker',
  'street sweeper',
  'cutpurse',
  'rat catcher',
  'grave digger',
  'village fool',
  'code peasant',
  'commit serf',
  'bug squasher',
  'documentation scribe',
  'test minion',
]

// Shared function to capitalize the first letter of a title
const capitalizeTitle = (title: string): string => {
  return title.charAt(0).toUpperCase() + title.slice(1)
}

// Function to get a random title
export const getRandomTitle = (): string => {
  return titles[Math.floor(Math.random() * titles.length)] ?? ''
}

// Function to get a random common folk title
export const getRandomCommonTitle = (): string => {
  return (
    commonTitles[Math.floor(Math.random() * commonTitles.length)] ?? 'servant'
  )
}

// Function to get a capitalized title
export const getRandomTitleCapitalized = (): string => {
  return capitalizeTitle(getRandomTitle())
}

// Function to get a capitalized common folk title
export const getRandomCommonTitleCapitalized = (): string => {
  return capitalizeTitle(getRandomCommonTitle())
}
