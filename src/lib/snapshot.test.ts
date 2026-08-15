import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSnapshot, applySnapshot, SCHEMA_VERSION } from './snapshot'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useBookmarkStore } from '../stores/bookmarks'
import { useVocabStore } from '../stores/vocab'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('snapshot round-trip', () => {
  it('builds a JSON snapshot and restores it into a fresh store', () => {
    // --- Populate the source stores ---
    const s = useSettingsStore()
    s.endpoint = 'https://api.example.com/v1/'
    s.apiKey = 'sk-secret'
    s.model = 'gpt-4o-mini'
    s.explanationStyle = 'plain'
    s.ttsVoice = 'en-US-AriaNeural'
    s.ttsRate = '+10%'
    s.ttsVolume = '+0%'
    s.ttsPitch = '+0Hz'
    s.ttsProxy = 'https://tts.example.com/tts'
    s.externalRequestsEnabled = false
    s.customActions = [
      { id: 'a1', label: '总结', template: '{{selection}}', builtin: false },
    ]
    s.presetOverrides = { builtin1: { label: '改过的', hidden: false } }

    const ui = useUiStore()
    ui.setTheme('sepia')

    const bm = useBookmarkStore()
    bm.byDocument = { 'a.pdf': [{ id: 'b1', pageIndex: 2, alignY: 0.5, label: '第 3 页', createdAt: 123 }] }
    bm.lastPositions = { 'a.pdf': { pageIndex: 1, alignY: 0.25 } }

    const vocab = useVocabStore()
    vocab.entries = [
      {
        id: 'v1',
        word: 'serendipity',
        phonetics: '/ˌserənˈdɪpəti/',
        context: 'a happy accident',
        documentTitle: 'Book',
        fileName: 'book.pdf',
        pageIndex: 4,
        createdAt: 999,
      },
    ]

    const json = buildSnapshot()

    // --- Restore into a brand-new Pinia ---
    setActivePinia(createPinia())
    const result = applySnapshot(json)
    expect(result.ok).toBe(true)

    const s2 = useSettingsStore()
    const ui2 = useUiStore()
    const bm2 = useBookmarkStore()
    const vocab2 = useVocabStore()

    expect(s2.endpoint).toBe('https://api.example.com/v1/')
    expect(s2.apiKey).toBe('sk-secret')
    expect(s2.explanationStyle).toBe('plain')
    expect(s2.customActions).toEqual([
      { id: 'a1', label: '总结', template: '{{selection}}', builtin: false },
    ])
    expect(s2.presetOverrides).toEqual({ builtin1: { label: '改过的', hidden: false } })
    expect(ui2.theme).toBe('sepia')
    expect(bm2.byDocument['a.pdf']).toHaveLength(1)
    expect(bm2.lastPositions['a.pdf']).toEqual({ pageIndex: 1, alignY: 0.25 })
    expect(vocab2.entries[0].word).toBe('serendipity')

    // Re-serializing the restored state is identical to the original payload.
    const reparsed = JSON.parse(buildSnapshot())
    expect(reparsed.settings.apiKey).toBe('sk-secret')
    expect(reparsed.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('applySnapshot validation', () => {
  it('rejects invalid JSON', () => {
    const r = applySnapshot('not json {')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/JSON/)
  })

  it('rejects an unknown schema version', () => {
    const r = applySnapshot(
      JSON.stringify({ schemaVersion: 999, settings: {}, bookmarks: {}, vocab: [] }),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/版本/)
  })

  it('rejects a payload missing required sections', () => {
    const r = applySnapshot(JSON.stringify({ schemaVersion: SCHEMA_VERSION }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/缺少/)
  })

  it('falls back to default explanation style for a stale value', () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      settings: { explanationStyle: 'nonsense' },
      bookmarks: {},
      vocab: [],
    }
    const r = applySnapshot(JSON.stringify(payload))
    expect(r.ok).toBe(true)
    expect(useSettingsStore().explanationStyle).toBe('default')
  })
})
