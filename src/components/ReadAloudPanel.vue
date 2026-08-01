<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useReaderStore } from '../stores/reader'
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
  seek,
  download,
  close,
  speakWord,
  buildReadAloudFileName,
} from '../lib/tts'
import { segmentWords } from '../lib/segment'
import { fetchPhonetics } from '../lib/phonetics'

const settings = useSettingsStore()
const reader = useReaderStore()

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
  if (isSynthesizing.value) return '…'
  if (isPaused.value) return '▶'
  if (isSpeaking.value) return '❚❚'
  return '▶'
})
const primaryLabel = computed(() => {
  if (isPaused.value) return '继续'
  if (isSpeaking.value) return '暂停'
  if (canControl.value) return '重新播放'
  return '暂停'
})
function onPrimary() {
  if (isPaused.value) resume()
  else if (isSpeaking.value) pause()
  else replay()
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
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  // Anchor just below the word, clamped so it stays on screen.
  const left = Math.min(rect.left, window.innerWidth - 200)
  popoverStyle.value = { left: `${Math.max(8, left)}px`, top: `${rect.bottom + 6}px` }

  // Toggle off if tapping the same word again.
  if (activeWord.value === word) {
    closePopover()
    return
  }

  activeWord.value = word
  wordPhonetics.value = []
  // Pronounce immediately (CONTEXT.md: 单词发音) — reuses the TTS proxy.
  void speakWord(word, settings.ttsConfig)
  // Fetch IPA (CONTEXT.md: 单词音标). Empty result → no phonetics shown.
  const phonetics = await fetchPhonetics(word)
  // Guard against a stale result: if the user tapped another word while this
  // request was in flight, only apply the IPA when this word is still active.
  if (activeWord.value !== word) return
  wordPhonetics.value = phonetics
}

function closePopover() {
  activeWord.value = null
  wordPhonetics.value = []
}

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

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div v-if="isOpen" class="read-aloud-panel" role="dialog" aria-label="朗读面板">
    <header class="ra-header">
      <span class="ra-title">朗读</span>
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
        @click="replay"
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
    </div>
  </div>
</template>

<style scoped>
.read-aloud-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 130;
  background: var(--surface, #fff);
  color: var(--text, #111);
  border-top: 1px solid var(--border, #e5e7eb);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  max-height: 60vh;
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
  background: var(--accent, #2563eb);
  color: #fff;
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
  accent-color: var(--accent, #2563eb);
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
  border-radius: 4px;
  padding: 0 1px;
  transition: background 0.12s ease;
}

.word-unit:hover {
  background: var(--accent-soft, rgba(37, 99, 235, 0.12));
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
</style>
