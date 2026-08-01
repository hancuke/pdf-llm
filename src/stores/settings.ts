// Settings store — Endpoint configuration + Custom Actions (CONTEXT.md:
// "兼容端点" / "API 密钥" / "自定义动作"). Persisted to localStorage; the API
// key is stored as-is on the device and never sent to a self-owned backend
// (story 15, ADR-0001).

import { defineStore } from 'pinia'
import { PRESET_ACTIONS, type Action } from '../lib/actions'
import type { ExplanationStyle, TtsConfig } from '../lib/types'
import {
  STORAGE_KEYS,
  loadString,
  saveString,
  loadJson,
  saveJson,
  createId,
} from '../lib/storage'

/**
 * Read the persisted explanation style, validating it against the known union.
 * Falls back to 'default' for an unset or stale value (never an invalid string).
 */
function readExplanationStyle(): ExplanationStyle {
  const stored = loadString(STORAGE_KEYS.explanationStyle)
  return stored === 'plain' || stored === 'eli5' ? stored : 'default'
}

/** Defaults for the Edge TTS fields (mirrored from the store's initial state). */
const DEFAULT_TTS = {
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  volume: '+0%',
  pitch: '+0Hz',
  proxy: 'https://tts.webextools.com/tts',
}

/**
 * The editable surface of the settings panel. The panel edits a draft of this
 * shape and commits it via {@link applyDraft} only when the user hits "保存"
 * (explicit-save semantics) — so an accidental edit never touches localStorage
 * until confirmed.
 */
export interface SettingsDraft {
  endpoint: string
  apiKey: string
  model: string
  explanationStyle: ExplanationStyle
  ttsVoice: string
  ttsRate: string
  ttsVolume: string
  ttsPitch: string
  ttsProxy: string
  customActions: Action[]
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    endpoint: loadString(STORAGE_KEYS.endpoint),
    apiKey: loadString(STORAGE_KEYS.apiKey),
    model: loadString(STORAGE_KEYS.model),
    customActions: loadJson<Action[]>(STORAGE_KEYS.customActions, []),
    explanationStyle: readExplanationStyle(),
    ttsVoice: loadString(STORAGE_KEYS.ttsVoice) || DEFAULT_TTS.voice,
    ttsRate: loadString(STORAGE_KEYS.ttsRate) || DEFAULT_TTS.rate,
    ttsVolume: loadString(STORAGE_KEYS.ttsVolume) || DEFAULT_TTS.volume,
    ttsPitch: loadString(STORAGE_KEYS.ttsPitch) || DEFAULT_TTS.pitch,
    ttsProxy: loadString(STORAGE_KEYS.ttsProxy) || DEFAULT_TTS.proxy,
  }),

  getters: {
    /** Endpoint settings shaped for the LLM client. */
    endpointSettings: (state) => ({
      baseUrl: state.endpoint,
      apiKey: state.apiKey,
      model: state.model,
    }),

    /** Edge TTS configuration consumed by the read-aloud feature. */
    ttsConfig: (state): TtsConfig => ({
      voice: state.ttsVoice,
      rate: state.ttsRate,
      volume: state.ttsVolume,
      pitch: state.ttsPitch,
      proxy: state.ttsProxy,
    }),

    /** Endpoint + Key + Model present enough to attempt a call (story 17). */
    isConfigured: (state) =>
      state.endpoint.trim().length > 0 &&
      state.apiKey.trim().length > 0 &&
      state.model.trim().length > 0,

    /** Preset Quick Actions followed by the user's Custom Actions. */
    allActions: (state): Action[] => [...PRESET_ACTIONS, ...state.customActions],

    customActionById: (state) => (id: string) =>
      state.customActions.find((a) => a.id === id),
  },

  actions: {
    updateEndpoint(value: string) {
      this.endpoint = value
      saveString(STORAGE_KEYS.endpoint, value)
    },

    /**
     * Commit a panel draft to the store and persist it. Normalizes the TTS
     * fields exactly like the individual `updateTts*` actions so a saved draft
     * behaves identically to per-field edits. Clears the API key's transient
     * show/hide concern by storing it verbatim.
     */
    applyDraft(draft: SettingsDraft) {
      this.endpoint = draft.endpoint.trim()
      this.apiKey = draft.apiKey
      this.model = draft.model.trim()
      this.explanationStyle =
        draft.explanationStyle === 'plain' || draft.explanationStyle === 'eli5'
          ? draft.explanationStyle
          : 'default'
      this.ttsVoice = draft.ttsVoice.trim() || DEFAULT_TTS.voice
      this.ttsRate = draft.ttsRate.trim() || DEFAULT_TTS.rate
      this.ttsVolume = draft.ttsVolume.trim() || DEFAULT_TTS.volume
      this.ttsPitch = draft.ttsPitch.trim() || DEFAULT_TTS.pitch
      this.ttsProxy = draft.ttsProxy.trim()
      this.customActions = draft.customActions.map((a) => ({ ...a }))

      saveString(STORAGE_KEYS.endpoint, this.endpoint)
      saveString(STORAGE_KEYS.apiKey, this.apiKey)
      saveString(STORAGE_KEYS.model, this.model)
      saveString(STORAGE_KEYS.explanationStyle, this.explanationStyle)
      saveString(STORAGE_KEYS.ttsVoice, this.ttsVoice)
      saveString(STORAGE_KEYS.ttsRate, this.ttsRate)
      saveString(STORAGE_KEYS.ttsVolume, this.ttsVolume)
      saveString(STORAGE_KEYS.ttsPitch, this.ttsPitch)
      saveString(STORAGE_KEYS.ttsProxy, this.ttsProxy)
      saveJson(STORAGE_KEYS.customActions, this.customActions)
    },
    updateApiKey(value: string) {
      this.apiKey = value
      saveString(STORAGE_KEYS.apiKey, value)
    },
    updateModel(value: string) {
      this.model = value
      saveString(STORAGE_KEYS.model, value)
    },

    updateExplanationStyle(value: ExplanationStyle) {
      this.explanationStyle = value
      saveString(STORAGE_KEYS.explanationStyle, value)
    },

    updateTtsVoice(value: string) {
      this.ttsVoice = value.trim() || 'zh-CN-XiaoxiaoNeural'
      saveString(STORAGE_KEYS.ttsVoice, this.ttsVoice)
    },
    updateTtsRate(value: string) {
      this.ttsRate = value.trim() || '+0%'
      saveString(STORAGE_KEYS.ttsRate, this.ttsRate)
    },
    updateTtsVolume(value: string) {
      this.ttsVolume = value.trim() || '+0%'
      saveString(STORAGE_KEYS.ttsVolume, this.ttsVolume)
    },
    updateTtsPitch(value: string) {
      this.ttsPitch = value.trim() || '+0Hz'
      saveString(STORAGE_KEYS.ttsPitch, this.ttsPitch)
    },
    updateTtsProxy(value: string) {
      this.ttsProxy = value.trim()
      saveString(STORAGE_KEYS.ttsProxy, this.ttsProxy)
    },

    addCustomAction(label: string, template: string): Action {
      const action: Action = {
        id: createId(),
        label: label.trim(),
        template: template,
        builtin: false,
      }
      this.customActions.push(action)
      this.persistCustomActions()
      return action
    },

    updateCustomAction(id: string, patch: Partial<Pick<Action, 'label' | 'template'>>) {
      const target = this.customActions.find((a) => a.id === id)
      if (!target) return
      if (patch.label !== undefined) target.label = patch.label.trim()
      if (patch.template !== undefined) target.template = patch.template
      this.persistCustomActions()
    },

    removeCustomAction(id: string) {
      this.customActions = this.customActions.filter((a) => a.id !== id)
      this.persistCustomActions()
    },

    persistCustomActions() {
      saveJson(STORAGE_KEYS.customActions, this.customActions)
    },
  },
})
