import type { MenuOption } from '../components/Menu'

export const menuOptions: MenuOption[] = [
  { label: 'Repository Statistics', value: 'repostats' },
  { label: 'Extended Repository Statistics', value: 'extendedrepostats' },
  {
    label: 'Single Developer Repository Statistics',
    value: 'singledevrepostats',
  },
  { label: 'Change Repository', value: 'change-repo' },
  { label: 'About', value: 'about' },
  { label: 'Exit', value: 'exit' },
]
