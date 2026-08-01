<script setup lang="ts">
// Settings — modern, production-grade redesign.
//
// Explicit-save model: the panel edits a `draft` clone of the persisted store
// and only commits it via `settings.applyDraft` when the user hits 保存. Closing
// (Esc / overlay / 取消) discards the draft. Theme is a separate, immediately
// applied preference (ui store). Layout follows the app's existing iOS design
// language (grouped cards, segmented controls, frosted header) and adapts to a
// bottom drawer on mobile.

import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useSettingsStore, type SettingsDraft } from '../stores/settings'
import { useUiStore, type Theme } from '../stores/ui'
import { EXPLANATION_STYLES } from '../lib/actions'
import type { ExplanationStyle } from '../lib/types'
import { testEndpoint } from '../lib/llm'
import {
  speak,
  isSpeaking,
  isSynthesizing,
  ttsError,
  SUGGESTED_VOICES,
} from '../lib/tts'
import SegmentedControl from './SegmentedControl.vue'
import CustomActionsSettings from './CustomActionsSettings.vue'

const settings = useSettingsStore()
const ui = useUiStore()

const DEFAULT_TTS = {
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  volume: '+0%',
  pitch: '+0Hz',
  proxy: 'https://tts.webextools.com/tts',
}

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'sepia', label: '护眼' },
]

const styleOptions = (
  Object.entries(EXPLANATION_STYLES) as [ExplanationStyle, { label: string }][]
).map(([value, cfg]) => ({ value, label: cfg.label }))

// --- Draft state ------------------------------------------------------------
function snapshot(): SettingsDraft {
  return {
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.model,
    explanationStyle: settings.explanationStyle,
    ttsVoice: settings.ttsVoice,
    ttsRate: settings.ttsRate,
    ttsVolume: settings.ttsVolume,
    ttsPitch: settings.ttsPitch,
    ttsProxy: settings.ttsProxy,
    customActions: settings.customActions.map((a) => ({ ...a })),
  }
}

const draft = reactive<SettingsDraft>(snapshot())

const showKey = ref(false)
const testing = ref(false)
const connResult = ref<{ ok: boolean; message: string } | null>(null)
const testText = ref('这是一段用于测试朗读效果的示例文本，可以听一听音色是否合适。')

/** Re-arm the draft whenever the panel opens. */
function resetDraft() {
  Object.assign(draft, snapshot())
  showKey.value = false
  testing.value = false
  connResult.value = null
}

watch(
  () => ui.settingsOpen,
  (open) => {
    if (open) resetDraft()
  },
)

// --- Dirty detection --------------------------------------------------------
const isDirty = computed(() => {
  const s = settings
  return (
    draft.endpoint.trim() !== s.endpoint ||
    draft.apiKey !== s.apiKey ||
    draft.model.trim() !== s.model ||
    draft.explanationStyle !== s.explanationStyle ||
    draft.ttsVoice.trim() !== s.ttsVoice ||
    draft.ttsRate.trim() !== s.ttsRate ||
    draft.ttsVolume.trim() !== s.ttsVolume ||
    draft.ttsPitch.trim() !== s.ttsPitch ||
    draft.ttsProxy.trim() !== s.ttsProxy ||
    JSON.stringify(draft.customActions) !== JSON.stringify(s.customActions)
  )
})

// --- Endpoint validation ----------------------------------------------------
const endpointError = computed(() => {
  const v = draft.endpoint.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:')
      return '地址需以 http:// 或 https:// 开头'
    return null
  } catch {
    return '不是合法的 URL（含协议与域名）'
  }
})

// --- Connection test --------------------------------------------------------
async function testConnection() {
  connResult.value = null
  if (!draft.endpoint.trim()) {
    connResult.value = { ok: false, message: '请先填写端点 Base URL。' }
    return
  }
  testing.value = true
  try {
    connResult.value = await testEndpoint({
      baseUrl: draft.endpoint.trim(),
      apiKey: draft.apiKey,
      model: draft.model.trim(),
    })
  } finally {
    testing.value = false
  }
}

// --- TTS sliders ------------------------------------------------------------
function parsePct(str: string): number {
  const m = str.match(/([+-]?\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 0
}
function fmtPct(v: number): string {
  return v >= 0 ? `+${v}%` : `${v}%`
}
function pctModel(key: 'ttsRate' | 'ttsVolume' | 'ttsPitch') {
  return computed({
    get: () => parsePct(draft[key]),
    set: (v: number) => {
      draft[key] = fmtPct(v)
    },
  })
}
const rateValue = pctModel('ttsRate')
const volumeValue = pctModel('ttsVolume')
const pitchValue = pctModel('ttsPitch')

const ttsBusy = computed(() => isSpeaking.value || isSynthesizing.value)
function testTts() {
  ttsError.value = null
  void speak(testText.value, {
    voice: draft.ttsVoice.trim() || DEFAULT_TTS.voice,
    rate: draft.ttsRate.trim() || DEFAULT_TTS.rate,
    volume: draft.ttsVolume.trim() || DEFAULT_TTS.volume,
    pitch: draft.ttsPitch.trim() || DEFAULT_TTS.pitch,
    proxy: draft.ttsProxy.trim(),
  })
}

// --- Section resets ---------------------------------------------------------
function resetProvider() {
  draft.endpoint = ''
  draft.apiKey = ''
  draft.model = ''
  draft.explanationStyle = 'default'
}
function resetTts() {
  Object.assign(draft, { ...DEFAULT_TTS })
}

// --- Commit / close ---------------------------------------------------------
function save() {
  settings.applyDraft(draft)
  ui.closeSettings()
}
function close() {
  ui.closeSettings()
}

// --- Focus management + trap + Esc ------------------------------------------
const panelRef = ref<HTMLElement | null>(null)
const firstField = ref<HTMLInputElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function focusable(): HTMLElement[] {
  if (!panelRef.value) return []
  return Array.from(
    panelRef.value.querySelectorAll<HTMLElement>(
      'input:not([type="radio"]), textarea, select, button, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'Tab') {
    const items = focusable()
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    } else if (!panelRef.value?.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKeydown)
  void nextTick().then(() => firstField.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  previouslyFocused?.focus?.()
})

const suggestedVoices = SUGGESTED_VOICES
</script>

<template>
  <div class="settings-overlay" @click.self="close">
    <div
      ref="panelRef"
      class="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <header class="settings-header">
        <h2 id="settings-title">设置</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="关闭设置"
          @click="close"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>

      <div class="settings-body">
        <!-- Appearance -->
        <section class="settings-group">
          <div class="group-head">
            <h3 class="group-title">外观</h3>
          </div>
          <div class="group-row">
            <span class="row-label">主题</span>
            <SegmentedControl
              :model-value="ui.theme"
              :options="themeOptions"
              aria-label="外观主题"
              @update:model-value="(v: string) => ui.setTheme(v as Theme)"
            />
          </div>
          <p class="group-note">主题会立即生效并保存到本机。</p>
        </section>

        <!-- Provider / Endpoint -->
        <section class="settings-group">
          <div class="group-head">
            <h3 class="group-title">服务端点</h3>
            <button class="link-button" type="button" @click="resetProvider">
              恢复默认
            </button>
          </div>
          <p class="group-note">
            你的密钥仅保存在本机浏览器（localStorage），由你直连 LLM，不上传到任何自有服务器。
            若端点不支持 CORS，调用会失败——请使用本地或支持 CORS 的端点。
          </p>

          <label class="field">
            <span class="field-label">端点 Base URL</span>
            <input
              ref="firstField"
              v-model="draft.endpoint"
              class="field-input"
              :class="{ invalid: endpointError }"
              type="text"
              placeholder="https://api.openai.com/v1 或 http://localhost:11434/v1"
            />
            <span v-if="endpointError" class="field-error">{{ endpointError }}</span>
          </label>

          <label class="field">
            <span class="field-label">API 密钥</span>
            <div class="input-affix">
              <input
                v-model="draft.apiKey"
                class="field-input"
                :type="showKey ? 'text' : 'password'"
                placeholder="sk-..."
                autocomplete="off"
                spellcheck="false"
              />
              <button
                class="affix-button"
                type="button"
                :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
                @click="showKey = !showKey"
              >
                <svg v-if="!showKey" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18.4 18.4 0 0 1-2.2 3.2M6.6 6.6A18.3 18.3 0 0 0 2 11s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.8"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
              </button>
            </div>
          </label>

          <label class="field">
            <span class="field-label">模型</span>
            <input
              v-model="draft.model"
              class="field-input"
              type="text"
              placeholder="gpt-4o-mini / llama3 / ..."
            />
          </label>

          <div class="field">
            <span class="field-label">讲解风格</span>
            <SegmentedControl
              v-model="draft.explanationStyle"
              :options="styleOptions"
              aria-label="讲解风格"
            />
          </div>

          <div class="test-row">
            <button
              class="btn-secondary"
              type="button"
              :disabled="testing"
              @click="testConnection"
            >
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
            <span
              v-if="connResult"
              class="test-result"
              :class="connResult.ok ? 'ok' : 'fail'"
            >
              <svg v-if="connResult.ok" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
              {{ connResult.message }}
            </span>
          </div>
        </section>

        <!-- Read-aloud (Edge TTS) -->
        <section class="settings-group">
          <div class="group-head">
            <h3 class="group-title">朗读（Edge TTS）</h3>
            <button class="link-button" type="button" @click="resetTts">
              恢复默认
            </button>
          </div>
          <p class="group-note">
            使用微软 Edge 在线语音合成，无需密钥。朗读请求发往下方端点（POST 文本，返回音频），
            默认走一个公共代理；也可填入你自建的端点（如 Cloudflare Pages 函数）。
          </p>

          <label class="field">
            <span class="field-label">语音</span>
            <input
              v-model="draft.ttsVoice"
              class="field-input"
              type="text"
              list="tts-voice-list"
              placeholder="zh-CN-XiaoxiaoNeural"
            />
            <datalist id="tts-voice-list">
              <option v-for="v in suggestedVoices" :key="v.value" :value="v.value">
                {{ v.label }}
              </option>
            </datalist>
          </label>

          <label class="field">
            <span class="field-label">端点地址</span>
            <input
              v-model="draft.ttsProxy"
              class="field-input"
              type="text"
              placeholder="https://tts.webextools.com/tts（默认公共代理）"
            />
          </label>

          <div class="slider-row">
            <div class="slider-field">
              <div class="slider-head">
                <span class="field-label">语速</span>
                <span class="slider-value">{{ rateValue }}%</span>
              </div>
              <input v-model.number="rateValue" class="slider" type="range" min="-50" max="50" step="5" />
            </div>
            <div class="slider-field">
              <div class="slider-head">
                <span class="field-label">音量</span>
                <span class="slider-value">{{ volumeValue }}%</span>
              </div>
              <input v-model.number="volumeValue" class="slider" type="range" min="-50" max="50" step="5" />
            </div>
            <div class="slider-field">
              <div class="slider-head">
                <span class="field-label">音调</span>
                <span class="slider-value">{{ pitchValue }}Hz</span>
              </div>
              <input v-model.number="pitchValue" class="slider" type="range" min="-50" max="50" step="5" />
            </div>
          </div>

          <label class="field">
            <span class="field-label">测试文本</span>
            <textarea v-model="testText" class="custom-textarea" rows="2" />
          </label>

          <div class="test-row">
            <button
              class="btn-primary"
              type="button"
              :disabled="ttsBusy"
              @click="testTts"
            >
              {{ ttsBusy ? '合成中…' : '测试朗读' }}
            </button>
            <span v-if="ttsError" class="test-result fail">{{ ttsError }}</span>
          </div>
        </section>

        <!-- Custom Actions -->
        <section class="settings-group">
          <div class="group-head">
            <h3 class="group-title">自定义动作</h3>
          </div>
          <p class="group-note">
            自建快捷操作，保存在本机，跨刷新保留。模板可用变量占位符，运行时替换为对应内容。
          </p>
          <CustomActionsSettings v-model:actions="draft.customActions" />
        </section>
      </div>

      <footer class="settings-footer">
        <span class="dirty-hint" :class="{ show: isDirty }">
          {{ isDirty ? '有未保存的更改' : '已全部保存' }}
        </span>
        <div class="footer-actions">
          <button class="btn-secondary" type="button" @click="close">取消</button>
          <button
            class="btn-primary"
            type="button"
            :disabled="!isDirty"
            @click="save"
          >
            保存
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
