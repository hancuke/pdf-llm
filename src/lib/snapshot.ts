// Settings snapshot: serialize / restore the user's data for export & WebDAV
// sync (CONTEXT.md: 同步与备份 / ADR-0019).
//
// Scope (confirmed with the user): Settings + Bookmarks + Vocab book (+ theme).
// Sensitive fields (API key, WebDAV password) ARE included verbatim so a backup
// is a complete restore — consistent with the existing `apiKey` plaintext
// localStorage policy. Conversation history is intentionally excluded
// (ADR-0004).
//
// Must be called within an active Pinia context (the stores are pulled in via
// their `use*Store()` hooks).

import { useSettingsStore, type PresetOverride } from '../stores/settings'
import { useUiStore, type Theme } from '../stores/ui'
import { useBookmarkStore } from '../stores/bookmarks'
import { useVocabStore, type VocabEntry } from '../stores/vocab'
import type { Action } from '../lib/actions'
import type { ExplanationStyle } from '../lib/types'
import { STORAGE_KEYS, saveString, saveJson } from './storage'

/** Bump when the snapshot shape changes in a backward-incompatible way. */
export const SCHEMA_VERSION = 1

export interface SettingsSnapshot {
  schemaVersion: number
  /** ISO timestamp of when the snapshot was produced. */
  exportedAt: string
  settings: {
    endpoint: string
    apiKey: string
    model: string
    customActions: Action[]
    presetOverrides: Record<string, PresetOverride>
    explanationStyle: ExplanationStyle
    ttsVoice: string
    ttsRate: string
    ttsVolume: string
    ttsPitch: string
    ttsProxy: string
    externalRequestsEnabled: boolean
  }
  theme: Theme
  bookmarks: {
    byDocument: Record<string, import('../lib/bookmarks').Bookmark[]>
    lastPositions: Record<string, import('../lib/bookmarks').ReadingPosition>
  }
  vocab: VocabEntry[]
}

/** Read the current state of all stores and return a pretty JSON string. */
export function buildSnapshot(): string {
  const settings = useSettingsStore()
  const ui = useUiStore()
  const bookmarks = useBookmarkStore()
  const vocab = useVocabStore()

  const snapshot: SettingsSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.model,
      customActions: settings.customActions,
      presetOverrides: settings.presetOverrides,
      explanationStyle: settings.explanationStyle,
      ttsVoice: settings.ttsVoice,
      ttsRate: settings.ttsRate,
      ttsVolume: settings.ttsVolume,
      ttsPitch: settings.ttsPitch,
      ttsProxy: settings.ttsProxy,
      externalRequestsEnabled: settings.externalRequestsEnabled,
    },
    theme: ui.theme,
    bookmarks: {
      byDocument: bookmarks.byDocument,
      lastPositions: bookmarks.lastPositions,
    },
    vocab: vocab.entries,
  }

  return JSON.stringify(snapshot, null, 2)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Parse `json` and write every recognised field back into the stores,
 * persisting each via the storage wrapper. Returns `{ ok: true }` on success or
 * `{ ok: false, error }` with a Chinese message when the payload is unusable.
 */
export function applySnapshot(json: string): { ok: boolean; error?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: '文件不是合法的 JSON。' }
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: '备份文件格式无法识别。' }
  }

  const snap = parsed as Partial<SettingsSnapshot>
  if (snap.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `备份版本不兼容（文件为 v${snap.schemaVersion ?? '?'}，当前支持 v${SCHEMA_VERSION}）。`,
    }
  }
  if (!isRecord(snap.settings) || !isRecord(snap.bookmarks) || !Array.isArray(snap.vocab)) {
    return { ok: false, error: '备份文件缺少必要的数据区段。' }
  }

  const s = snap.settings as SettingsSnapshot['settings']
  const b = snap.bookmarks as SettingsSnapshot['bookmarks']

  const settings = useSettingsStore()
  const ui = useUiStore()
  const bookmarks = useBookmarkStore()
  const vocab = useVocabStore()

  // --- Settings -------------------------------------------------------------
  settings.endpoint = s.endpoint ?? ''
  saveString(STORAGE_KEYS.endpoint, settings.endpoint)
  settings.apiKey = s.apiKey ?? ''
  saveString(STORAGE_KEYS.apiKey, settings.apiKey)
  settings.model = s.model ?? ''
  saveString(STORAGE_KEYS.model, settings.model)
  settings.customActions = Array.isArray(s.customActions) ? s.customActions : []
  saveJson(STORAGE_KEYS.customActions, settings.customActions)
  settings.presetOverrides = isRecord(s.presetOverrides) ? s.presetOverrides : {}
  saveJson(STORAGE_KEYS.presetOverrides, settings.presetOverrides)
  const style = s.explanationStyle
  settings.explanationStyle =
    style === 'plain' || style === 'eli5' || style === 'default' ? style : 'default'
  saveString(STORAGE_KEYS.explanationStyle, settings.explanationStyle)
  settings.ttsVoice = s.ttsVoice ?? ''
  saveString(STORAGE_KEYS.ttsVoice, settings.ttsVoice)
  settings.ttsRate = s.ttsRate ?? ''
  saveString(STORAGE_KEYS.ttsRate, settings.ttsRate)
  settings.ttsVolume = s.ttsVolume ?? ''
  saveString(STORAGE_KEYS.ttsVolume, settings.ttsVolume)
  settings.ttsPitch = s.ttsPitch ?? ''
  saveString(STORAGE_KEYS.ttsPitch, settings.ttsPitch)
  settings.ttsProxy = s.ttsProxy ?? ''
  saveString(STORAGE_KEYS.ttsProxy, settings.ttsProxy)
  settings.externalRequestsEnabled = Boolean(s.externalRequestsEnabled)
  saveJson(STORAGE_KEYS.externalRequests, settings.externalRequestsEnabled)

  // --- Theme ----------------------------------------------------------------
  if (snap.theme === 'light' || snap.theme === 'dark' || snap.theme === 'sepia') {
    ui.setTheme(snap.theme)
  }

  // --- Bookmarks (incl. last reading positions) -----------------------------
  bookmarks.byDocument = isRecord(b.byDocument) ? (b.byDocument as SettingsSnapshot['bookmarks']['byDocument']) : {}
  bookmarks.lastPositions = isRecord(b.lastPositions)
    ? (b.lastPositions as SettingsSnapshot['bookmarks']['lastPositions'])
    : {}
  saveJson(STORAGE_KEYS.bookmarks, bookmarks.byDocument)
  saveJson(STORAGE_KEYS.lastPositions, bookmarks.lastPositions)

  // --- Vocab book -----------------------------------------------------------
  vocab.entries = snap.vocab as VocabEntry[]
  saveJson(STORAGE_KEYS.vocabBook, vocab.entries)

  return { ok: true }
}
