import type { MenuOption } from '../components/Menu'

export const menuOptions: MenuOption[] = [
  { label: 'Repository Overview', value: 'overview' },
  {
    label: 'Single Developer Repository Statistics',
    value: 'singledevrepostats',
  },
  { label: 'Brutal Barbarian Rankings', value: 'barbarianrankings' },
  { label: '⏳ Code Longevity', value: 'longevity' },
  { label: 'Draft a .mailmap from identity guesses', value: 'mailmap' },
  { label: 'Change Repository', value: 'change-repo' },
  { label: 'About', value: 'about' },
  { label: 'Exit', value: 'exit' },
]
