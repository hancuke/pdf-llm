<script setup lang="ts">
// Settings — macOS System Settings–style redesign (ADR-0017).
//
// Information architecture: a left category rail (桌面端) + a detail pane.
// On desktop the panel is a right slide-over with the PDF visible behind a
// scrim; on mobile (≤768px) it becomes the existing bottom drawer and drills
// down (category list → detail with a back affordance).
//
// Save model: immediate-apply. Every control writes straight through to the
// settings store (and thus localStorage) via its `update*` action — there is
// no draft, no "保存/取消" footer, and no dirty-tracking. "测试连接" / "测试朗读"
// act on the live values, so a bad endpoint is caught by probing, not by an
// undo. Visual language follows ADR-0012 (「沉静编辑式」: indigo accent,
// soft shadows + hairline borders, no frosted glass).

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore, DEFAULT_TTS } from '../stores/settings'
import { useUiStore, type Theme } from '../stores/ui'
import { EXPLANATION_STYLES } from '../lib/actions'
import type { ExplanationStyle } from '../lib/types'
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
const {
  endpointTestStatus,
  endpointTestMessage,
  externalRequestsEnabled,
  syncStatus,
  syncMessage,
} = storeToRefs(settings)

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'sepia', label: '护眼' },
]

const styleOptions = (
  Object.entries(EXPLANATION_STYLES) as [ExplanationStyle, { label: string }][]
).map(([value, cfg]) => ({ value, label: cfg.label }))

// --- Categories (5: ADR-0017 的 4 类 + 同步与备份, ADR-0019) ------------
type CategoryId = 'general' | 'model' | 'readaloud' | 'actions' | 'sync'
const categories: { id: CategoryId; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'model', label: '模型服务' },
  { id: 'readaloud', label: '朗读' },
  { id: 'actions', label: '动作' },
  { id: 'sync', label: '同步与备份' },
]
const activeCategory = ref<CategoryId | null>('general')
const activeCategoryLabel = computed(
  () => categories.find((c) => c.id === activeCategory.value)?.label ?? '',
)

// --- Responsive: desktop sidebar vs mobile drill-down ----------------------
const isMobile = ref(false)
function syncMobile() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}
/**
 * On mobile the panel opens at the category list (null → list renders);
 * on desktop it opens with the first category selected (sidebar + detail).
 * A previously shown 测试连接 result must not survive a reopen.
 */
function resetView() {
  syncMobile()
  activeCategory.value = isMobile.value ? null : 'general'
  settings.endpointTestStatus = 'idle'
  settings.endpointTestMessage = ''
}

// --- Immediate-apply field bindings ---------------------------------------
// Each control writes through to the store on every edit; no draft. Trimming
// of the endpoint/model happens at this UI layer (not in the store) so the
// store's business logic stays verbatim (ADR-0017: UI/interaction-only change).
const endpoint = computed({
  get: () => settings.endpoint,
  set: (v: string) => settings.updateEndpoint(v.trim()),
})
const apiKey = computed({
  get: () => settings.apiKey,
  set: (v: string) => settings.updateApiKey(v),
})
const model = computed({
  get: () => settings.model,
  set: (v: string) => settings.updateModel(v.trim()),
})
const explanationStyle = computed({
  get: () => settings.explanationStyle,
  set: (v: ExplanationStyle) => settings.updateExplanationStyle(v),
})
const ttsVoice = computed({
  get: () => settings.ttsVoice,
  set: (v: string) => settings.updateTtsVoice(v),
})
const ttsProxy = computed({
  get: () => settings.ttsProxy,
  set: (v: string) => settings.updateTtsProxy(v),
})

// --- Endpoint validation ---------------------------------------------------
const endpointError = computed(() => {
  const v = endpoint.value.trim()
  if (!v) return null
  try {
    const url = new URL(v)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return '地址需以 http:// 或 https:// 开头'
    return null
  } catch {
    return '不是合法的 URL（含协议与域名）'
  }
})

// --- Connection test (probes the live store values) ------------------------
function testConnection() {
  void settings.runEndpointTest()
}

// --- TTS sliders -----------------------------------------------------------
function parsePercent(str: string): number {
  const match = str.match(/([+-]?\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : 0
}
function formatPercent(v: number): string {
  return v >= 0 ? `+${v}%` : `${v}%`
}
function formatHertz(v: number): string {
  return v >= 0 ? `+${v}Hz` : `${v}Hz`
}
const rateValue = computed({
  get: () => parsePercent(settings.ttsRate),
  set: (v: number) => settings.updateTtsRate(formatPercent(v)),
})
const volumeValue = computed({
  get: () => parsePercent(settings.ttsVolume),
  set: (v: number) => settings.updateTtsVolume(formatPercent(v)),
})
const pitchValue = computed({
  get: () => parsePercent(settings.ttsPitch),
  set: (v: number) => settings.updateTtsPitch(formatHertz(v)),
})

const ttsBusy = computed(() => isSpeaking.value || isSynthesizing.value)
const testText = ref('这是一段用于测试朗读效果的示例文本，可以听一听音色是否合适。')
function testTts() {
  ttsError.value = null
  // Open expanded so the user can verify the full panel (spec-ui-redesign story 12).
  void speak(testText.value, settings.ttsConfig, { expand: true })
}

// --- Sync & backup (ADR-0019) --------------------------------------------
const webdavUrl = computed({
  get: () => settings.webdavUrl,
  set: (v: string) => settings.updateWebdavUrl(v.trim()),
})
const webdavUsername = computed({
  get: () => settings.webdavUsername,
  set: (v: string) => settings.updateWebdavUsername(v),
})
const webdavPassword = computed({
  get: () => settings.webdavPassword,
  set: (v: string) => settings.updateWebdavPassword(v),
})
const webdavPath = computed({
  get: () => settings.webdavPath,
  set: (v: string) => settings.updateWebdavPath(v.trim()),
})

/** Download the current snapshot as a local JSON file. */
function exportJson() {
  const json = settings.exportSnapshot()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `pdf-llm-backup-${stamp}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const importInput = ref<HTMLInputElement | null>(null)
function triggerImport() {
  importInput.value?.click()
}
function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result ?? '')
    const result = settings.importSnapshot(text)
    if (result.ok) {
      ui.showToast('已从 JSON 恢复设置。')
    } else {
      ui.showToast(result.error ?? '导入失败。')
    }
    // Reset so the same file can be re-selected.
    input.value = ''
  }
  reader.onerror = () => ui.showToast('读取文件失败。')
  reader.readAsText(file)
}

const syncBusy = computed(() => syncStatus.value === 'loading')

// --- Section resets --------------------------------------------------------
const confirmResetProvider = ref(false)
function requestResetProvider() {
  confirmResetProvider.value = true
}
function confirmResetProviderNow() {
  settings.updateEndpoint('')
  settings.updateApiKey('')
  settings.updateModel('')
  settings.updateExplanationStyle('default')
  confirmResetProvider.value = false
}
function cancelResetProvider() {
  confirmResetProvider.value = false
}
function resetTts() {
  settings.updateTtsVoice(DEFAULT_TTS.voice)
  settings.updateTtsRate(DEFAULT_TTS.rate)
  settings.updateTtsVolume(DEFAULT_TTS.volume)
  settings.updateTtsPitch(DEFAULT_TTS.pitch)
  settings.updateTtsProxy(DEFAULT_TTS.proxy)
}

// --- Close ----------------------------------------------------------------
function close() {
  ui.closeSettings()
}

// --- Focus management + trap + Esc -----------------------------------------
const panelRef = ref<HTMLElement | null>(null)
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

function onResize() {
  syncMobile()
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  // The panel is mounted with `v-if="ui.settingsOpen"`, so this runs on every
  // open — initialise the view (mobile → category list, desktop → first
  // category) and clear any stale 测试连接 result here.
  resetView()
  void nextTick().then(() => focusable()[0]?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  previouslyFocused?.focus?.()
})

const suggestedVoices = SUGGESTED_VOICES

// --- Voice selector --------------------------------------------------------
const CUSTOM_VOICE = '__custom__'
const voiceSelectValue = computed(() =>
  suggestedVoices.some((v) => v.value === ttsVoice.value)
    ? ttsVoice.value
    : CUSTOM_VOICE,
)
const isCustomVoice = computed(() => voiceSelectValue.value === CUSTOM_VOICE)
function onVoiceSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value !== CUSTOM_VOICE) ttsVoice.value = value
}
</script>

<template>
  <div class="settings-overlay" @click.self="close">
    <div
      ref="panelRef"
      class="settings-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <!-- Shell header: desktop, and mobile category-list view -->
      <header
        v-if="!isMobile || !activeCategory"
        class="settings-shell-header"
      >
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

      <div
        class="settings-split"
        :class="{ 'is-detail': isMobile && activeCategory }"
      >
        <!-- Category rail (desktop) / list (mobile root) -->
        <nav
          v-if="!isMobile || !activeCategory"
          class="settings-sidebar"
          aria-label="设置分类"
        >
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="settings-sidebar-item"
            :class="{ active: activeCategory === cat.id && !isMobile }"
            :aria-current="activeCategory === cat.id && !isMobile ? 'page' : undefined"
            @click="activeCategory = cat.id"
          >
            {{ cat.label }}
          </button>
        </nav>

        <!-- Detail pane -->
        <section
          v-if="!isMobile || activeCategory"
          class="settings-detail"
        >
          <!-- Mobile detail header (back + title + close) -->
          <header
            v-if="isMobile && activeCategory"
            class="settings-detail-header"
          >
            <button
              class="icon-button"
              type="button"
              aria-label="返回设置分类"
              @click="activeCategory = null"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h2 class="settings-detail-title">{{ activeCategoryLabel }}</h2>
            <button
              class="icon-button settings-detail-close"
              type="button"
              aria-label="关闭设置"
              @click="close"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <div class="settings-detail-body">
            <!-- 通用: 外观 + 外部请求 -->
            <template v-if="activeCategory === 'general'">
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

              <section class="settings-group">
                <div class="group-head">
                  <h3 class="group-title">外部请求</h3>
                  <button
                    class="toggle"
                    type="button"
                    role="switch"
                    :aria-checked="externalRequestsEnabled"
                    :class="{ on: externalRequestsEnabled }"
                    @click="settings.setExternalRequestsEnabled(!externalRequestsEnabled)"
                  >
                    <span class="toggle-knob" />
                  </button>
                </div>
                <p class="group-note">
                  本应用不持有你的文档，但为使「朗读」与「音标」可用，选中内容的片段会发往对应第三方接口（TTS 代理、外部词典）。关闭后将禁用这两项功能，选中文字时仅保留复制等操作。
                </p>
              </section>
            </template>

            <!-- 模型服务: 兼容端点 -->
            <template v-else-if="activeCategory === 'model'">
              <section class="settings-group">
                <div class="group-head">
                  <h3 class="group-title">服务端点</h3>
                  <button
                    v-if="!confirmResetProvider"
                    class="link-button danger"
                    type="button"
                    @click="requestResetProvider"
                  >
                    清除
                  </button>
                  <template v-else>
                    <span class="group-confirm-text">清除端点设置？</span>
                    <button class="link-button danger" type="button" @click="confirmResetProviderNow">清除</button>
                    <button class="link-button" type="button" @click="cancelResetProvider">取消</button>
                  </template>
                </div>
                <p class="group-note">
                  你的密钥仅保存在本机浏览器（localStorage），由你直连 LLM，不上传到任何自有服务器。
                  若端点不支持 CORS，调用会失败——请使用本地或支持 CORS 的端点。
                </p>

                <label class="field">
                  <span class="field-label">端点 Base URL</span>
                  <input
                    v-model="endpoint"
                    class="field-input"
                    :class="{ invalid: endpointError }"
                    type="text"
                    placeholder="https://api.openai.com/v1 或 http://localhost:11434/v1"
                  />
                  <span v-if="endpointError" class="field-error">{{ endpointError }}</span>
                </label>

                <label class="field">
                  <span class="field-label">API 密钥</span>
                  <input
                    v-model="apiKey"
                    class="field-input"
                    type="password"
                    placeholder="sk-..."
                    autocomplete="off"
                    spellcheck="false"
                  />
                </label>

                <label class="field">
                  <span class="field-label">模型</span>
                  <input
                    v-model="model"
                    class="field-input"
                    type="text"
                    placeholder="gpt-4o-mini / llama3 / ..."
                  />
                </label>

                <div class="field">
                  <span class="field-label">讲解风格</span>
                  <SegmentedControl
                    v-model="explanationStyle"
                    :options="styleOptions"
                    aria-label="讲解风格"
                  />
                </div>

                <div class="test-row">
                  <button
                    class="btn-secondary"
                    type="button"
                    :disabled="endpointTestStatus === 'loading'"
                    @click="testConnection"
                  >
                    {{ endpointTestStatus === 'loading' ? '测试中…' : '测试连接' }}
                  </button>
                  <span
                    v-if="endpointTestStatus !== 'idle'"
                    class="test-result"
                    :class="endpointTestStatus === 'ok' ? 'ok' : 'fail'"
                  >
                    <svg v-if="endpointTestStatus === 'ok'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
                    {{ endpointTestMessage }}
                  </span>
                </div>
              </section>
            </template>

            <!-- 朗读: Edge TTS -->
            <template v-else-if="activeCategory === 'readaloud'">
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
                  <select
                    class="field-input"
                    :value="voiceSelectValue"
                    aria-label="语音"
                    @change="onVoiceSelect"
                  >
                    <option
                      v-for="v in suggestedVoices"
                      :key="v.value"
                      :value="v.value"
                    >
                      {{ v.label }}
                    </option>
                    <option :value="CUSTOM_VOICE">自定义…</option>
                  </select>
                  <input
                    v-if="isCustomVoice"
                    v-model="ttsVoice"
                    class="field-input custom-voice-input"
                    type="text"
                    placeholder="zh-CN-XiaoxiaoNeural"
                  />
                </label>

                <label class="field">
                  <span class="field-label">端点地址</span>
                  <input
                    v-model="ttsProxy"
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
            </template>

            <!-- 动作: 自定义动作 -->
            <template v-else-if="activeCategory === 'actions'">
              <section class="settings-group">
                <div class="group-head">
                  <h3 class="group-title">自定义动作</h3>
                </div>
                <p class="group-note">
                  自建快捷操作，保存在本机，跨刷新保留。模板可用变量占位符，运行时替换为对应内容。
                </p>
                <CustomActionsSettings />
              </section>
            </template>

            <!-- 同步与备份: 本地 JSON + WebDAV (ADR-0019) -->
            <template v-else-if="activeCategory === 'sync'">
              <section class="settings-group">
                <div class="group-head">
                  <h3 class="group-title">本地备份</h3>
                </div>
                <p class="group-note">
                  导出的 JSON 包含全部设置、书签与生词本，<strong>含 API 密钥与 WebDAV 密码</strong>，请妥善保管，勿分享他人。
                </p>
                <div class="test-row">
                  <button class="btn-secondary" type="button" @click="exportJson">
                    导出为 JSON
                  </button>
                  <button class="btn-secondary" type="button" @click="triggerImport">
                    从 JSON 导入
                  </button>
                  <input
                    ref="importInput"
                    type="file"
                    accept="application/json,.json"
                    class="hidden"
                    @change="onImportFile"
                  />
                </div>
              </section>

              <section class="settings-group">
                <div class="group-head">
                  <h3 class="group-title">WebDAV 同步</h3>
                </div>
                <p class="group-note">
                  将备份上传到你的 WebDAV 服务器，换设备时再「恢复」即可。需服务器开启 CORS（含 Authorization 预检）。
                </p>

                <label class="field">
                  <span class="field-label">服务器地址</span>
                  <input
                    v-model="webdavUrl"
                    class="field-input"
                    type="text"
                    placeholder="https://dav.example.com/remote.php/dav/files/user/"
                  />
                </label>

                <label class="field">
                  <span class="field-label">用户名</span>
                  <input
                    v-model="webdavUsername"
                    class="field-input"
                    type="text"
                    autocomplete="username"
                    spellcheck="false"
                  />
                </label>

                <label class="field">
                  <span class="field-label">密码</span>
                  <input
                    v-model="webdavPassword"
                    class="field-input"
                    type="password"
                    autocomplete="current-password"
                    spellcheck="false"
                  />
                </label>

                <label class="field">
                  <span class="field-label">远端文件名</span>
                  <input
                    v-model="webdavPath"
                    class="field-input"
                    type="text"
                    placeholder="pdf-llm-backup.json"
                    spellcheck="false"
                  />
                </label>

                <div class="test-row">
                  <button
                    class="btn-primary"
                    type="button"
                    :disabled="syncBusy"
                    @click="settings.uploadToWebdav()"
                  >
                    {{ syncBusy ? '同步中…' : '备份到 WebDAV' }}
                  </button>
                  <button
                    class="btn-secondary"
                    type="button"
                    :disabled="syncBusy"
                    @click="settings.downloadFromWebdav()"
                  >
                    {{ syncBusy ? '同步中…' : '从 WebDAV 恢复' }}
                  </button>
                  <span
                    v-if="syncStatus !== 'idle'"
                    class="test-result"
                    :class="syncStatus === 'ok' ? 'ok' : 'fail'"
                  >
                    {{ syncMessage }}
                  </span>
                </div>
              </section>
            </template>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
