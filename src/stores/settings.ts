// Settings store — Endpoint configuration + Custom Actions (CONTEXT.md:
// "兼容端点" / "API 密钥" / "自定义动作"). Persisted to localStorage; the API
// key is stored as-is on the device and never sent to a self-owned backend
// (story 15, ADR-0001).
//
// Immediate-apply model (ADR-0017): every field edits straight through to
// localStorage via its `update*` action — there is no draft and no "保存"
// button. The 设置面板 binds each control to one of these actions.

import { defineStore } from 'pinia'
import { PRESET_ACTIONS, type Action } from '../lib/actions'
import type { ExplanationStyle, TtsConfig } from '../lib/types'

/** A user override applied to a built-in (preset) action (settings.ts). */
export interface PresetOverride {
  /** When set, replaces the preset's label. */
  label?: string
  /** When set, replaces the preset's template. */
  template?: string
  /** When true, the preset is removed from the action sheet. */
  hidden?: boolean
}
import {
  STORAGE_KEYS,
  loadString,
  saveString,
  loadJson,
  saveJson,
  loadBoolean,
  saveBoolean,
  createId,
} from '../lib/storage'
import { testEndpoint as probeEndpoint } from '../lib/llm'

/**
 * Read the persisted explanation style, validating it against the known union.
 * Falls back to 'default' for an unset or stale value (never an invalid string).
 */
function readExplanationStyle(): ExplanationStyle {
  const stored = loadString(STORAGE_KEYS.explanationStyle)
  return stored === 'plain' || stored === 'eli5' ? stored : 'default'
}

/** Defaults for the Edge TTS fields (mirrored from the store's initial state). */
export const DEFAULT_TTS = {
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  volume: '+0%',
  pitch: '+0Hz',
  proxy: 'https://tts.webextools.com/tts',
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    endpoint: loadString(STORAGE_KEYS.endpoint),
    apiKey: loadString(STORAGE_KEYS.apiKey),
    model: loadString(STORAGE_KEYS.model),
    customActions: loadJson<Action[]>(STORAGE_KEYS.customActions, []),
    /**
     * Per-preset edits / deletions (CONTEXT.md: "自定义动作"). Built-in actions
     * are immutable in code, so any user change to one is recorded here keyed by
     * its id: `label`/`template` override the shipped prompt, and `hidden: true`
     * removes it from the action sheet. Custom actions are NOT tracked here.
     */
    presetOverrides: loadJson<Record<string, PresetOverride>>(
      STORAGE_KEYS.presetOverrides,
      {},
    ),
    explanationStyle: readExplanationStyle(),
    ttsVoice: loadString(STORAGE_KEYS.ttsVoice) || DEFAULT_TTS.voice,
    ttsRate: loadString(STORAGE_KEYS.ttsRate) || DEFAULT_TTS.rate,
    ttsVolume: loadString(STORAGE_KEYS.ttsVolume) || DEFAULT_TTS.volume,
    ttsPitch: loadString(STORAGE_KEYS.ttsPitch) || DEFAULT_TTS.pitch,
    ttsProxy: loadString(STORAGE_KEYS.ttsProxy) || DEFAULT_TTS.proxy,
    /** Whether read-aloud / phonetics may send selected text to 3rd-party APIs (ADR-0013). */
    externalRequestsEnabled: loadBoolean(STORAGE_KEYS.externalRequests, true),
    /** Endpoint connectivity probe status (story 18). */
    endpointTestStatus: 'idle' as 'idle' | 'loading' | 'ok' | 'fail',
    endpointTestMessage: '',
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

    /** Preset Quick Actions (with any user overrides) followed by Custom Actions. */
    allActions: (state): Action[] => {
      const visible = PRESET_ACTIONS.filter(
        (p) => !state.presetOverrides[p.id]?.hidden,
      ).map((p) => {
        const o = state.presetOverrides[p.id]
        return o
          ? { ...p, label: o.label ?? p.label, template: o.template ?? p.template }
          : p
      })
      return [...visible, ...state.customActions]
    },

    customActionById: (state) => (id: string) =>
      state.customActions.find((a) => a.id === id),

    /** True once the user has edited or hidden any built-in preset action. */
    hasPresetOverrides: (state) => Object.keys(state.presetOverrides).length > 0,
  },

  actions: {
    updateEndpoint(value: string) {
      this.endpoint = value.trim()
      saveString(STORAGE_KEYS.endpoint, this.endpoint)
    },

    updateApiKey(value: string) {
      this.apiKey = value
      saveString(STORAGE_KEYS.apiKey, value)
    },
    updateModel(value: string) {
      this.model = value.trim()
      saveString(STORAGE_KEYS.model, this.model)
    },

    updateExplanationStyle(value: ExplanationStyle) {
      this.explanationStyle = value
      saveString(STORAGE_KEYS.explanationStyle, value)
    },

    /** Toggle whether read-aloud / phonetics send selected text to 3rd-party APIs (ADR-0013). */
    setExternalRequestsEnabled(value: boolean) {
      this.externalRequestsEnabled = value
      saveBoolean(STORAGE_KEYS.externalRequests, value)
    },

    /**
     * Probe the configured endpoint's connectivity (story 18). Uses the
     * default `fetch` (the browser's own network), so it reflects real CORS /
     * reachability the UI will hit. Results are reflected in
     * `endpointTestStatus` / `endpointTestMessage` for the panel to render.
     *
     * Accepts an optional override so the panel can test the in-progress DRAFT
     * (explicit-save model) rather than the previously-saved values — editing
     * the endpoint and clicking 测试连接 should probe what the user just typed.
     */
    async runEndpointTest(
      override?: { endpoint: string; apiKey: string; model: string },
    ): Promise<void> {
      const endpoint = (override?.endpoint ?? this.endpoint).trim()
      const apiKey = (override?.apiKey ?? this.apiKey).trim()
      const model = (override?.model ?? this.model).trim()
      if (!endpoint || !apiKey || !model) {
        this.endpointTestStatus = 'fail'
        this.endpointTestMessage = '请先填写端点、密钥与模型。'
        return
      }
      this.endpointTestStatus = 'loading'
      this.endpointTestMessage = ''
      try {
        const result = await probeEndpoint({ baseUrl: endpoint, apiKey, model })
        this.endpointTestStatus = result.ok ? 'ok' : 'fail'
        this.endpointTestMessage = result.message
      } catch {
        this.endpointTestStatus = 'fail'
        this.endpointTestMessage = '测试连接时发生未知错误。'
      }
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

    /** Persist an override (edit or hide) for a built-in preset action. */
    persistPresetOverride() {
      saveJson(STORAGE_KEYS.presetOverrides, this.presetOverrides)
    },

    /** Override the label / template of a built-in preset action. */
    updatePreset(
      id: string,
      patch: Partial<Pick<Action, 'label' | 'template'>>,
    ) {
      if (!PRESET_ACTIONS.some((p) => p.id === id)) return
      this.presetOverrides[id] = {
        ...this.presetOverrides[id],
        ...patch,
      }
      this.persistPresetOverride()
    },

    /** Hide (delete) a built-in preset action from the action sheet. */
    hidePreset(id: string) {
      if (!PRESET_ACTIONS.some((p) => p.id === id)) return
      this.presetOverrides[id] = {
        ...this.presetOverrides[id],
        hidden: true,
      }
      this.persistPresetOverride()
    },

    /** Discard all preset overrides, restoring every built-in action to default. */
    resetPresetOverrides() {
      this.presetOverrides = {}
      saveJson(STORAGE_KEYS.presetOverrides, this.presetOverrides)
    },

    persistCustomActions() {
      saveJson(STORAGE_KEYS.customActions, this.customActions)
    },
  },
})
