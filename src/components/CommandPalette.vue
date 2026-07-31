<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useUiStore } from '../stores/ui'
import { useReaderStore } from '../stores/reader'
import { useBookmarkStore } from '../stores/bookmarks'
import { downloadConversationMarkdown } from '../lib/exportConversation'
import { zoomIn, zoomOut } from '../lib/viewer'

const ui = useUiStore()
const reader = useReaderStore()
const bookmarks = useBookmarkStore()

const props = defineProps<{ onOpenFile: () => void }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

interface Command {
  id: string
  label: string
  run: () => void
}

const allCommands = computed<Command[]>(() => [
  { id: 'open', label: '打开 PDF 文件', run: () => props.onOpenFile() },
  { id: 'outline', label: '切换目录面板', run: () => ui.toggleOutline() },
  { id: 'conversation', label: '切换对话面板', run: () => ui.toggleConversation() },
  { id: 'search', label: '搜索文档', run: () => ui.openSearch() },
  { id: 'theme', label: '切换主题（浅色/深色/护眼）', run: () => ui.cycleTheme() },
  { id: 'zoom-in', label: '放大', run: () => zoomIn() },
  { id: 'zoom-out', label: '缩小', run: () => zoomOut() },
  {
    id: 'bookmark',
    label: '添加书签（当前位置）',
    run: () => bookmarks.addBookmarkAtCurrentPosition(reader.fileName),
  },
  {
    id: 'export',
    label: '导出对话为 Markdown',
    run: () => downloadConversationMarkdown(),
  },
  { id: 'settings', label: '打开设置', run: () => ui.openSettings() },
])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value
  return allCommands.value.filter((c) => c.label.toLowerCase().includes(q))
})

watch(query, () => {
  activeIndex.value = 0
})

watch(
  () => ui.commandPaletteOpen,
  (open) => {
    if (open) {
      query.value = ''
      activeIndex.value = 0
      void nextTick().then(() => inputEl.value?.focus())
    }
  },
)

function run(command: Command | undefined) {
  if (!command) return
  command.run()
  emit('close')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(filtered.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div class="palette-overlay" @click.self="emit('close')">
    <div class="palette" role="dialog" aria-modal="true">
      <input
        ref="inputEl"
        v-model="query"
        class="palette-input"
        type="text"
        placeholder="输入命令…"
        @keydown="onKey"
      />
      <ul class="palette-list">
        <li
          v-for="(command, i) in filtered"
          :key="command.id"
          class="palette-item"
          :class="{ active: i === activeIndex }"
          @mouseenter="activeIndex = i"
          @click="run(command)"
        >
          {{ command.label }}
        </li>
        <li v-if="filtered.length === 0" class="palette-empty">无匹配命令</li>
      </ul>
    </div>
  </div>
</template>
