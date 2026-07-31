import { describe, it, expect } from 'vitest'
import {
  cleanMetadataTitle,
  deriveTitleFromText,
  MAX_TITLE_LENGTH,
} from './documentTitle'

describe('cleanMetadataTitle', () => {
  it('trims and returns the metadata title', () => {
    expect(cleanMetadataTitle('  Attention Is All You Need  ')).toBe(
      'Attention Is All You Need',
    )
  })
  it('returns empty for null or whitespace', () => {
    expect(cleanMetadataTitle(null)).toBe('')
    expect(cleanMetadataTitle('   ')).toBe('')
  })
  it('caps the title to MAX_TITLE_LENGTH', () => {
    expect(cleanMetadataTitle('x'.repeat(200)).length).toBe(MAX_TITLE_LENGTH)
  })
})

describe('deriveTitleFromText', () => {
  it('uses the first non-trivial line of the first page', () => {
    expect(
      deriveTitleFromText('\n\n   \nIntroduction to Quantum Computing\nabstract here'),
    ).toBe('Introduction to Quantum Computing')
  })
  it('returns empty when no usable line exists', () => {
    expect(deriveTitleFromText('   \n  .  \n')).toBe('')
  })
  it('caps the derived title to MAX_TITLE_LENGTH', () => {
    const result = deriveTitleFromText('The'.repeat(80))
    expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
  })
})
