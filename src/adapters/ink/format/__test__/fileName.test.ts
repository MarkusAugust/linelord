import { describe, expect, it } from 'bun:test'
import { parseFileName } from '../fileName'

describe('parseFileName', () => {
  it('splits an ordinary name at the last dot', () => {
    expect(parseFileName('App.test.tsx')).toEqual({
      baseName: 'App.test',
      extension: 'tsx',
    })
  })

  it('leaves a name with no dot whole', () => {
    expect(parseFileName('Makefile')).toEqual({
      baseName: 'Makefile',
      extension: '',
    })
  })

  it('treats a leading dot as part of the name, not as an extension marker', () => {
    // `.gitignore` is a file called gitignore with no extension, not an
    // extension called gitignore with no name.
    expect(parseFileName('.gitignore')).toEqual({
      baseName: '.gitignore',
      extension: '',
    })
  })

  it('splits a dotfile that does have an extension after its first name', () => {
    expect(parseFileName('.eslintrc.json')).toEqual({
      baseName: '.eslintrc',
      extension: 'json',
    })
  })
})
