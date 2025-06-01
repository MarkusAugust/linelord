import type { AnalysisStep } from '../types/analysisTypes'

export const barbarianInitializingMessages = [
  'Forging the blade of analysis...',
  'By the old gods, preparing the ancient rituals...',
  'Summoning the spirits of git...',
  'Sharpening the sword of scrutiny...',
  'Awakening the ancient powers of blame...',
  'The wheel of fate turns, analysis begins...',
  'What is best in life? To analyze your enemies...',
  'Summoning the ghost of fallen kings...',
  'Preparing for the conquest of code...',
  'The serpent stirs in the depths of the repository...',
  'By the fires of the northern clans, we begin...',
  'The barbarian sharpens the analytical blade...',
  'The drums of war echo through the codebase...',
  'Ancient powers awaken in the git halls...',
  'The barbarian readies for digital conquest...',
  'Steel meets silicon in preparation...',
  'The prophecy of analysis unfolds...',
  'Northern strength flows through the bytes...',
  'The tower of bones crumbles before us...',
  'By the storm lords, the sacred rites commence...',
  'The black lotus of knowledge blooms...',
  'The barbarian consults the Oracle of Git...',
  'The winds of the frozen wastes howl...',
  'Ancient spells weave through the repository...',
  'The barbarian king claims the digital throne...',
  'By the serpent god of statistics...',
  'The jewels of the ancients reveal their secrets...',
  'Forgotten magic courses through the files...',
  'The phoenix rises from ashes of old code...',
  'The old gods grant strength for the coming battle...'
]

export const barbarianScanningMessages = [
  'Crushing enemies, seeing code driven before me...',
  'To crush your bugs, see them driven before you...',
  'Conquering the repository, line by line...',
  'Pillaging the files for their secrets...',
  'Battling through the code like a barbarian warrior...',
  'Slaying bugs and counting lines with steel and fury...',
  'Riding through the codebase like thunder...',
  'Barbarian strength flows through these files...',
  'The tree of woe bears fruit of knowledge...',
  'The barbarian does not simply walk... analyzes with fury!',
  'By the sword of the ancestors, I claim these lines!',
  'The vultures circle above dying functions...',
  'Striking down enemies with each git blame...',
  'The halls of the dead echo with commit messages...',
  'The warrior cleaves through legacy code like butter...',
  'By the hammer of the gods, these files shall yield!',
  'The barbarian horde storms the repository gates...',
  'Steel and sorcery meet in digital combat...',
  'The red warrior of refactoring dances through files...',
  "The dark sorcerer's minions flee before our analysis...",
  'The jeweled crown of commits sparkles...',
  "The barbarian's axe splits the logs of time...",
  'The queen of the wild coast guides our search...',
  "By the serpent's fangs, we pierce the veil of code...",
  "The tower of skulls' secrets unfold...",
  'Savage swords slash through tangled dependencies...',
  "The frost giant's daughter whispers file paths...",
  "The warrior's mighty thews strain against complexity...",
  'The black colossus of technical debt falls...',
  "By the storm god's grace, the patterns emerge clear..."
]

export const barbarianAnalyzingMessages = [
  'Counting the spoils of war...',
  'The riddle of steel reveals itself...',
  'Tallying the conquered territories...',
  'Weighing the gold of your contributions...',
  'Measuring the glory of each warrior...',
  'Calculating the might of each developer...',
  'The shield maiden whispers the secrets of statistics...',
  'The serpent of the old gods coils around the numbers...',
  'What does not kill your code makes it stronger...',
  'By the old gods, the final tally approaches!',
  'The scales of justice weigh each contribution...',
  'The barbarian counts victories by the campfire...',
  'The treasure chamber reveals its contents...',
  'Golden coins of code scatter in the light...',
  "The barbarian's ledger grows heavy with spoils...",
  'By the seven seals of power, the numbers align...',
  'The jeweled scepter of statistics gleams...',
  'The warrior divides the plunder among the clan...',
  "The oracle's prophecy becomes numbers...",
  'Ancient mathematics flow like northern wine...',
  'The star-metal of metrics takes shape...',
  'By the storm crown, the calculations converge...',
  'The black pearls of productivity are counted...',
  "The barbarian's abacus clicks with savage precision...",
  'The golden fleece of git metrics unfolds...',
  'By the frost beard, the totals are magnificent!',
  'The ivory tower of statistics stands tall...',
  'The barbarian accountant tallies the conquest...',
  'Ruby gems of repository data sparkle...',
  'The final horn of the great hall sounds the totals...'
]

export const barbarianCompleteMessages = [
  'By the old gods, the analysis is complete!',
  'Victory! The repository has been conquered!',
  "The barbarian's work is done!",
  'The warrior stands triumphant over the codebase!',
  'The spoils of war are tallied and ready!',
  "By the serpent's coils, it is finished!",
  'The quest for knowledge reaches its end!',
  'The shield maiden smiles upon our completed task!',
  'The riddle of steel has been solved!',
  "The dark lord's secrets lie bare before us!",
  'The tower of bones yields its treasures!',
  "By the storm god's grace, the deed is done!",
  'The black lotus of analysis blooms complete!',
  'The barbarian sheathes the analytical sword!',
  'The drums of war fall silent - victory is ours!',
  'The barbarian king claims the digital crown!',
  'By the hammer of ages, the task is finished!',
  'The jewels of the ancients shine with completion!',
  'The phoenix of analysis rises triumphant!',
  'Ancient powers acknowledge our success!'
]

// Function to get random message for each state
export const getRandomBarbarianMessage = (step: AnalysisStep): string => {
  switch (step) {
    case 'initializing':
      return (
        barbarianInitializingMessages[
          Math.floor(Math.random() * barbarianInitializingMessages.length)
        ] || 'By the old gods, we begin...'
      )
    case 'scanning':
      return (
        barbarianScanningMessages[
          Math.floor(Math.random() * barbarianScanningMessages.length)
        ] || 'Crushing enemies...'
      )
    case 'analyzing':
      return (
        barbarianAnalyzingMessages[
          Math.floor(Math.random() * barbarianAnalyzingMessages.length)
        ] || 'Counting spoils...'
      )
    case 'complete':
      return (
        barbarianCompleteMessages[
          Math.floor(Math.random() * barbarianCompleteMessages.length)
        ] || 'By the old gods, the analysis is complete!'
      )
    default:
      return 'By the old gods, the analysis is complete!'
  }
}
