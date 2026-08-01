import { describe, it, expect } from 'vitest'
import { buildReadAloudFileName } from './tts'

describe('buildReadAloudFileName', () => {
  it('uses the clean title and a text snippet', () => {
    expect(buildReadAloudFileName('Attention Is All You Need', 'the quick brown')).toBe(
      'Attention Is All You Need_the quick brown.mp3',
    )
  })

  it('falls back to 朗读 when there is no title', () => {
    expect(buildReadAloudFileName('', 'hello world')).toBe('朗读_hello world.mp3')
  })

  it('omits the snippet when the selection is blank', () => {
    expect(buildReadAloudFileName('My Doc', '   ')).toBe('My Doc.mp3')
  })

  it('strips illegal filename characters from the title', () => {
    // '?' also becomes '_', so the base ends with an underscore before the snippet.
    expect(buildReadAloudFileName('A/B:C*D?', 'note')).toBe('A_B_C_D__note.mp3')
  })

  it('collapses whitespace and caps the snippet length', () => {
    const long = 'a '.repeat(30).trim()
    const snippet = long.replace(/\s+/g, ' ').trim().slice(0, 20)
    const name = buildReadAloudFileName('Doc', long)
    expect(name).toBe(`Doc_${snippet}.mp3`)
    expect(name.length).toBe('Doc_'.length + 20 + '.mp3'.length)
  })
})
