<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  isSpeaking,
  isPaused,
  isSynthesizing,
  currentText,
  currentTime,
  duration,
  ttsError,
  pause,
  resume,
  replay,
  stop,
  seek,
  expand,
  close,
} from '../lib/tts'
import { usePdfPaneAnchor } from '../lib/usePdfPaneAnchor'

// Anchor to the top-center of the PDF area so the bar never covers the
// right-hand conversation panel.
const { top, left } = usePdfPaneAnchor()

/** Disable transport until we know the track length. */
const canControl = computed(() => duration.value > 0)

/** Context-aware primary button (mirrors the full panel's logic). */
const primaryIcon = computed(() => {
  if (isSynthesizing.value) return '✕'
  if (isPaused.value) return '▶'
  if (isSpeaking.value) return '❚❚'
  return '▶'
})
function onPrimary() {
  if (isSynthesizing.value) stop()
  else if (isPaused.value) resume()
  else if (isSpeaking.value) pause()
  else replay()
}

/** Selection snippet shown in the mini-player. */
const snippet = computed(() => {
  const t = currentText.value.trim()
  return t.length > 16 ? `${t.slice(0, 16)}…` : t
})

/** Thin progress line — click to seek. */
const progressRef = ref<HTMLElement | null>(null)
function onSeek(event: MouseEvent) {
  const bar = progressRef.value
  if (!bar || duration.value <= 0) return
  const rect = bar.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  seek(Math.min(1, Math.max(0, ratio)) * duration.value)
}
const progressPct = computed(() =>
  duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0,
)
</script>

<template>
  <div
    class="ra-mini"
    role="dialog"
    aria-label="朗读迷你播放器"
    :style="{ top: `${top}px`, left: `${left}px` }"
  >
    <div ref="progressRef" class="ra-mini-progress" @click="onSeek">
      <div class="ra-mini-fill" :style="{ width: `${progressPct}%` }" />
    </div>

    <span v-if="isSpeaking" class="ra-mini-dot" aria-hidden="true" />
    <span class="ra-mini-title" :title="currentText">{{
      ttsError ? ttsError : `正在朗读：${snippet}`
    }}</span>

    <button
      class="ra-mini-btn"
      type="button"
      :disabled="!canControl"
      aria-label="重新播放"
      title="重新播放"
      @click="replay"
    >
      ↺
    </button>
    <button
      class="ra-mini-btn ra-primary"
      type="button"
      :disabled="isSynthesizing"
      :aria-label="isSynthesizing ? '停止' : isPaused ? '继续' : isSpeaking ? '暂停' : '重新播放'"
      :title="isSynthesizing ? '停止' : isPaused ? '继续' : isSpeaking ? '暂停' : '重新播放'"
      @click="onPrimary"
    >
      {{ primaryIcon }}
    </button>
    <button
      class="ra-mini-btn"
      type="button"
      aria-label="展开"
      title="展开全文"
      @click="expand"
    >
      ⤒
    </button>
    <button class="ra-mini-btn" type="button" aria-label="关闭" title="关闭" @click="close">
      ✕
    </button>
  </div>
</template>

<style scoped>
.ra-mini {
  position: fixed;
  transform: translateX(-50%);
  z-index: 215;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow-md);
  padding: 6px 10px;
  max-width: min(92vw, 440px);
}

.ra-mini-progress {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 0;
  height: 3px;
  border-radius: 999px;
  background: var(--border);
  cursor: pointer;
  overflow: hidden;
}
.ra-mini-fill {
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.ra-mini-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 rgba(91, 91, 214, 0.5);
  animation: ra-mini-pulse 1.4s infinite;
}
@keyframes ra-mini-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(91, 91, 214, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(91, 91, 214, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(91, 91, 214, 0);
  }
}

.ra-mini-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.ra-mini-btn {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) ease;
}
.ra-mini-btn:hover {
  background: var(--hover);
}
.ra-mini-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.ra-mini-btn.ra-primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: transparent;
}

/* Mobile: keep the pill at the top-center of the PDF area (position is driven
   by the inline style from usePdfPaneAnchor, so only sizing is overridden). */
@media (max-width: 768px) {
  .ra-mini {
    padding: 8px 12px;
  }
  .ra-mini-progress {
    left: 0;
    right: 0;
    border-radius: 0;
  }
}
</style>
