<script setup lang="ts">
import type { Action } from '../lib/actions'

defineProps<{
  actions: Action[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'pick', action: Action): void
  (e: 'close'): void
}>()
</script>

<template>
  <div
    class="action-sheet"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="menu"
    @click.stop
  >
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
