<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Action } from '../lib/actions'

const props = defineProps<{
  actions: Action[]
  selectedText: string
  x: number
  y: number
  originX: number
  placement: 'above' | 'below'
}>()

const emit = defineEmits<{
  (e: 'pick', action: Action): void
  (e: 'close'): void
}>()

const root = ref<HTMLElement | null>(null)

// Arrow sits horizontally under the selection centre, clamped inside the sheet.
const arrowLeft = computed(() => {
  const w = root.value?.offsetWidth ?? 220
  const left = props.originX - props.x
  return Math.max(16, Math.min(left, w - 16))
})

// --- Inline icons (Feather-style, currentColor) -----------------------------
const ICONS: Record<string, string> = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  explain:
    '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10c.8.8 1 1.5 1 2h6c0-.5.2-1.2 1-2a6 6 0 0 0-4-10z"/>',
  translate:
    '<path d="M4 5h7"/><path d="M7.5 4c0 4 3 7 6.5 8"/><path d="M5.5 9c.5 3 2.5 6 5.5 7"/><path d="M13 20l4-9 4 9"/><path d="M14.5 17h5"/>',
  analogy:
    '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3"/><path d="M15 18H9a3 3 0 0 1-3-3"/>',
  relate:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  why:
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7"/><path d="M12 17h.01"/>',
  summarize: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/>',
  custom:
    '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z"/><path d="M19 14l.9 2.3L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.7z"/>',
  cancel: '<path d="M6 6l12 12M18 6L6 18"/>',
}

function iconFor(action: Action): string {
  if (action.id in ICONS && action.id !== 'custom') return action.id
  // Unknown ids fall back to the generic "custom" glyph.
  return action.builtin && action.id in ICONS ? action.id : 'custom'
}

function iconSvg(key: string): string {
  const inner = ICONS[key] ?? ICONS.custom
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
}

// Geometric selection is not a native selection, so offer an explicit copy.
const copied = ref(false)
async function copyText() {
  try {
    await navigator.clipboard.writeText(props.selectedText)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div
    ref="root"
    class="action-sheet"
    :class="placement"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="menu"
    @click.stop
  >
    <div class="action-list">
      <button class="action-item copy" role="menuitem" @click="copyText">
        <span class="action-icon" v-html="iconSvg('copy')" />
        <span class="action-label">{{ copied ? '已复制' : '复制' }}</span>
      </button>

      <button
        v-for="action in actions"
        :key="action.id"
        class="action-item"
        role="menuitem"
        @click="emit('pick', action)"
      >
        <span class="action-icon" v-html="iconSvg(iconFor(action))" />
        <span class="action-label">
          {{ action.label }}
          <span v-if="!action.builtin" class="badge">自定义</span>
        </span>
      </button>

      <button class="action-item cancel" role="menuitem" @click="emit('close')">
        <span class="action-icon" v-html="iconSvg('cancel')" />
        <span class="action-label">取消</span>
      </button>
    </div>

    <span class="action-arrow" :style="{ left: `${arrowLeft - 6}px` }" />
  </div>
</template>
