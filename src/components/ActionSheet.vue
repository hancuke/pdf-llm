<script setup lang="ts">
import { ref } from 'vue'
import type { Action } from '../lib/actions'

const props = defineProps<{
  actions: Action[]
  selectedText: string
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'pick', action: Action): void
  (e: 'close'): void
}>()

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
    class="action-sheet"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="menu"
    @click.stop
  >
    <button class="action-item copy" role="menuitem" @click="copyText">
      {{ copied ? '已复制' : '复制' }}
    </button>
    <button
      v-for="action in actions"
      :key="action.id"
      class="action-item"
      role="menuitem"
      @click="emit('pick', action)"
    >
      {{ action.label }}
      <span v-if="!action.builtin" class="badge">自定义</span>
    </button>
    <button class="action-item cancel" role="menuitem" @click="emit('close')">
      取消
    </button>
  </div>
</template>
