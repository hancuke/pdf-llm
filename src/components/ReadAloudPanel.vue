<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { useVocabStore } from '../stores/vocab'
import {
  isOpen,
  isPaused,
  isSynthesizing,
  isSpeaking,
  isWordSpeaking,
  currentText,
  currentTime,
  duration,
  ttsError,
  pause,
  resume,
  replay,
  stop,
  seek,
  download,
  close,
  collapse,
  speakWord,
  buildReadAloudFileName,
} from '../lib/tts'
import { segmentWords } from '../lib/segment'
import { fetchPhonetics } from '../lib/phonetics'
import { usePdfPaneAnchor } from '../lib/usePdfPaneAnchor'

const settings = useSettingsStore()
const reader = useReaderStore()
const ui = useUiStore()
const vocab = useVocabStore()

// Anchor to the top-center of the PDF area so the panel never covers the
// right-hand conversation panel.
const { top, left, paneWidth } = usePdfPaneAnchor()

/**
 * Read-aloud + phonetics send the selected word/text to third-party endpoints
 * (ADR-0013). When the user has disabled external requests in Settings, block
 * the request and explain why instead of silently firing it.
 */
function requireExternal(): boolean {
  if (settings.externalRequestsEnabled) return true
  ui.showToast('已在设置中关闭朗读 / 音标外部请求')
  return false
}

/** Word segments of the active read-aloud text (CONTEXT.md: 词单元). */
const segments = computed(() => segmentWords(currentText.value))

/** Disable transport until we know the track length. */
const canControl = computed(() => duration.value > 0)

/**
 * The primary (centre) transport button is context-aware:
 * - synthesizing → disabled "…"
 * - paused → ▶ to resume
 * - playing → ❚❚ to pause
 * - ended/idle (track fully loaded) → ▶ to replay from the start
 */
const primaryIcon = computed(() => {
  if (isSynthesizing.value) return '✕'
  if (isPaused.value) return '▶'
  if (isSpeaking.value) return '❚❚'
  return '▶'
})
const primaryLabel = computed(() => {
  if (isSynthesizing.value) return '停止'
  if (isPaused.value) return '继续'
  if (isSpeaking.value) return '暂停'
  if (canControl.value) return '重新播放'
  return '暂停'
})
function onPrimary() {
  if (isSynthesizing.value) stop()
  else if (isPaused.value) resume()
  else if (isSpeaking.value) pause()
  else if (requireExternal()) replay()
}

/** Replay button — also respects the external-request opt-out (ADR-0013). */
function onReplay() {
  if (requireExternal()) replay()
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Single-word phonetics popover -----------------------------------------

const activeWord = ref<string | null>(null)
const wordPhonetics = ref<string[]>([])
const popoverStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const popoverEl = ref<HTMLElement | null>(null)

async function onWordClick(word: string, event: MouseEvent) {
  // Toggle off if tapping the same word again.
  if (activeWord.value === word) {
    closePopover()
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  // The read-aloud panel floats at the top of the PDF area, so words sit high
  // on screen. A popover that always opens *below* the word would run off-screen
  // (and could be clipped). Open above the word when there isn't room below.
  const estHeight = 140
  const openAbove = window.innerHeight - rect.bottom < estHeight + 8
  const top = openAbove ? rect.top - estHeight - 6 : rect.bottom + 6
  const left = Math.min(rect.left, window.innerWidth - 8 - 220)
  popoverStyle.value = { left: `${Math.max(8, left)}px`, top: `${top}px` }

  activeWord.value = word
  wordPhonetics.value = []
  // Re-measure once laid out, then correct placement (precise flip + clamp).
  await nextTick()
  clampPopover(rect)

  // Honor the external-request opt-out (ADR-0013): no TTS/phonetics call.
  if (!requireExternal()) return
  // Pronounce immediately (CONTEXT.md: 单词发音) — reuses the TTS proxy.
  void speakWord(word, settings.ttsConfig)
  // Fetch IPA (CONTEXT.md: 单词音标). Empty result → no phonetics shown.
  const phonetics = await fetchPhonetics(word)
  // Guard against a stale result: if the user tapped another word while this
  // request was in flight, only apply the IPA when this word is still active.
  if (activeWord.value !== word) return
  wordPhonetics.value = phonetics
  // Content height changed (IPA lines added) — re-clamp.
  await nextTick()
  clampPopover(rect)
}

/**
 * Nudge the already-rendered popover so it stays fully on screen: flip above
 * the word if it would overflow the bottom, and clamp horizontally to the
 * viewport. Reads the popover's live measured rect, so it works regardless of
 * how many IPA lines are present.
 */
function clampPopover(rect: DOMRect) {
  const el = popoverEl.value
  if (!el) return
  const pr = el.getBoundingClientRect()
  let top = pr.top
  if (pr.bottom > window.innerHeight - 8) {
    top = rect.top - pr.height - 6
    if (top < 8) top = 8
  }
  let left = pr.left
  if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - 8 - pr.width
  if (left < 8) left = 8
  popoverStyle.value = { left: `${left}px`, top: `${top}px` }
}

function closePopover() {
  activeWord.value = null
  wordPhonetics.value = []
}

/**
 * Toggle the active word in/out of the 生词本 (CONTEXT.md: 词汇卡 / 生词本).
 * Collection never sends data to a 3rd party, so it works even when external
 * requests are disabled (ADR-0013) — only `phonetics` may be empty then.
 */
function onCollect() {
  if (!activeWord.value) return
  const word = activeWord.value
  const wasCollected = vocab.isCollected(word, reader.fileName)
  vocab.toggle({
    word,
    phonetics: wordPhonetics.value.join(' / '),
    context: currentText.value,
    documentTitle: reader.documentTitle,
    fileName: reader.fileName,
    pageIndex: reader.hasDocument
      ? (reader.currentSelection?.page ?? ui.currentPage) - 1
      : null,
  })
  if (!wasCollected) ui.showToast('已加入生词本')
}

/** Whether the active word is already in the 生词本 (drives the button label). */
const collected = computed(() =>
  activeWord.value ? vocab.isCollected(activeWord.value, reader.fileName) : false,
)

function onDownload() {
  const name = buildReadAloudFileName(reader.documentTitle, currentText.value)
  download(name)
}

// Close the phonetics popover on any outside click (document-level, so taps on
// the PDF or elsewhere dismiss it). Word taps and popover taps are ignored.
function onDocClick(event: MouseEvent) {
  if (!activeWord.value) return
  const target = event.target as HTMLElement
  if (popoverEl.value && popoverEl.value.contains(target)) return
  if (target.classList.contains('word-unit')) return
  closePopover()
}

// Dismiss the whole panel via Esc or an outside click (spec story 13).
function onPanelKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    close()
    // Stop the event reaching the global handler so opening Settings while the
    // read-aloud panel is up doesn't close both at once (spec story 12).
    event.stopPropagation()
  }
}
function onPanelOutside(event: MouseEvent) {
  if (!isOpen.value) return
  const target = event.target as HTMLElement
  if (target.closest('.read-aloud-panel')) return
  // Clicks inside the Settings modal are not "outside" the read-aloud panel.
  if (target.closest('.settings-overlay')) return
  close()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onPanelKey)
  document.addEventListener('click', onPanelOutside, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onPanelKey)
  document.removeEventListener('click', onPanelOutside, true)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="read-aloud-panel"
    role="dialog"
    aria-label="朗读面板"
    :style="{ top: `${top}px`, left: `${left}px`, maxWidth: `${paneWidth - 24}px` }"
  >
    <header class="ra-header">
      <span class="ra-title">朗读</span>
      <button
        class="icon-button"
        type="button"
        aria-label="收起"
        title="收起为迷你播放器"
        @click="collapse"
      >
        ⌄
      </button>
      <button class="icon-button" type="button" aria-label="关闭" @click="close">
        ✕
      </button>
    </header>

    <div class="ra-transport">
      <button
        class="ra-btn"
        type="button"
        :disabled="!canControl"
        aria-label="重新播放"
        title="重新播放"
        @click="onReplay"
      >
        ↺
      </button>

      <button
        class="ra-btn ra-primary"
        type="button"
        :disabled="isSynthesizing || !canControl"
        :aria-label="primaryLabel"
        :title="primaryLabel"
        @click="onPrimary"
      >
        {{ primaryIcon }}
      </button>

      <span class="ra-time">{{ formatTime(currentTime) }}</span>
      <input
        class="ra-progress"
        type="range"
        min="0"
        :max="duration || 0"
        step="0.1"
        :value="currentTime"
        :disabled="!canControl"
        aria-label="进度"
        @input="seek(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="ra-time">{{ formatTime(duration) }}</span>

      <button
        class="ra-btn"
        type="button"
        :disabled="!canControl"
        aria-label="下载语音"
        title="下载语音"
        @click="onDownload"
      >
        ↓
      </button>
    </div>

    <div class="ra-words">
      <span
        v-for="(seg, i) in segments"
        :key="i"
        :class="['ra-seg', { 'word-unit': seg.isWord }]"
        @click="seg.isWord && onWordClick(seg.text, $event)"
        >{{ seg.text }}</span
      >
    </div>

    <p v-if="ttsError" class="ra-error">{{ ttsError }}</p>

    <div
      v-if="activeWord"
      ref="popoverEl"
      class="ra-popover"
      :style="popoverStyle"
    >
      <div class="ra-popover-head">
        <strong>{{ activeWord }}</strong>
        <button class="ra-popover-x" type="button" aria-label="关闭" @click="closePopover">
          ✕
        </button>
      </div>
      <ul v-if="wordPhonetics.length" class="ra-phonetics">
        <li v-for="(p, i) in wordPhonetics" :key="i">{{ p }}</li>
      </ul>
      <div v-else-if="isWordSpeaking" class="ra-popover-sub">发音中…</div>
      <div v-else class="ra-popover-sub">无音标（仅支持英文）</div>
      <div class="ra-popover-foot">
        <button
          class="ra-collect"
          type="button"
          :class="{ active: collected }"
          @click="onCollect"
        >
          {{ collected ? '已收藏' : '收藏' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.read-aloud-panel {
  position: fixed;
  transform: translateX(-50%);
  width: 680px;
  max-width: 680px;
  z-index: 210;
  background: var(--surface, #fff);
  color: var(--text, #111);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  box-shadow: 0 12px 32px var(--shadow-color, rgba(0, 0, 0, 0.18));
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ra-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ra-title {
  font-weight: 600;
  font-size: 15px;
}

.ra-transport {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ra-btn {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--border, #e5e7eb);
  background: transparent;
  color: inherit;
  font-size: 15px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ra-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ra-primary {
  background: var(--accent, #5b5bd6);
  color: var(--accent-contrast, #fff);
  border-color: transparent;
}

.ra-time {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  opacity: 0.7;
  min-width: 32px;
  text-align: center;
}

.ra-progress {
  flex: 1;
  accent-color: var(--accent, #5b5bd6);
}

.ra-words {
  overflow-y: auto;
  line-height: 2;
  font-size: 16px;
  padding: 4px 2px;
  word-break: break-word;
}

.ra-seg {
  white-space: pre-wrap;
}

.word-unit {
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 0 1px;
  transition: background var(--motion-fast) ease;
}

.word-unit:hover {
  background: var(--accent-soft, rgba(91, 91, 214, 0.12));
}

.ra-error {
  color: #dc2626;
  font-size: 13px;
  margin: 0;
}

.ra-popover {
  position: fixed;
  z-index: 200;
  min-width: 140px;
  max-width: 220px;
  background: var(--surface, #fff);
  color: var(--text, #111);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  padding: 8px 10px;
}

.ra-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ra-popover-x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.6;
}

.ra-popover-sub {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.ra-popover-foot {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.ra-collect {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--motion-fast) ease, color var(--motion-fast) ease,
    border-color var(--motion-fast) ease;
}

.ra-collect:hover {
  background: var(--hover);
}

.ra-collect.active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: transparent;
}

.ra-phonetics {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}

.ra-phonetics li {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  padding: 2px 0;
}

/* On mobile the PDF area is full-width, so the floating card stays at the
   top-center (positioned via the inline style). Just cap its height. */
@media (max-width: 768px) {
  .read-aloud-panel {
    max-height: 60vh;
  }
}
</style>
