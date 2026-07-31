<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useReaderStore } from './stores/reader'
import { useUiStore } from './stores/ui'
import { useBookmarkStore } from './stores/bookmarks'
import Toolbar from './components/Toolbar.vue'
import LeftPanel from './components/LeftPanel.vue'
import PdfViewer from './components/PdfViewer.vue'
import ConversationPanel from './components/ConversationPanel.vue'
import SearchBar from './components/SearchBar.vue'
import CommandPalette from './components/CommandPalette.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import BottomTabBar from './components/BottomTabBar.vue'

const reader = useReaderStore()
const ui = useUiStore()
const bookmarks = useBookmarkStore()

const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type === 'application/pdf') {
    void reader.loadFile(file)
  }
}

function openFileDialog() {
  fileInput.value?.click()
}

async function onFilePicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await reader.loadFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

function addBookmarkAtCurrentPosition() {
  bookmarks.addBookmarkAtCurrentPosition(reader.fileName)
}

// --- Global keyboard shortcuts ---------------------------------------------
function onKeydown(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.openCommandPalette()
  } else if (mod && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    ui.openSearch()
  } else if (mod && event.key.toLowerCase() === 'd') {
    // Prevent the browser's native bookmark dialog BEFORE any early return.
    event.preventDefault()
    if (!reader.hasDocument) return
    addBookmarkAtCurrentPosition()
  } else if (event.key === 'Escape') {
    if (ui.commandPaletteOpen) ui.closeCommandPalette()
    else if (ui.searchOpen) ui.closeSearch()
  }
}

onMounted(() => {
  ui.initTheme()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="app"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <Toolbar />

    <main class="app-main">
      <LeftPanel
        class="pane left-pane"
        :class="{ collapsed: !ui.outlineOpen }"
      />
      <PdfViewer class="pane pdf-pane" />
      <ConversationPanel
        class="pane conv-pane"
        :class="{ collapsed: !ui.conversationOpen }"
      />
    </main>

    <!-- Mobile-only backdrop for the slide-over panes (below). Hidden on desktop. -->
    <div
      v-if="ui.outlineOpen || ui.conversationOpen"
      class="pane-scrim"
      @click="ui.outlineOpen = false; ui.conversationOpen = false"
    />

    <SearchBar v-if="ui.searchOpen" />
    <CommandPalette
      v-if="ui.commandPaletteOpen"
      :on-open-file="openFileDialog"
      @close="ui.closeCommandPalette()"
    />
    <SettingsPanel v-if="ui.settingsOpen" />

    <BottomTabBar />

    <input
      ref="fileInput"
      type="file"
      accept="application/pdf"
      class="hidden"
      @change="onFilePicked"
    />

    <div v-if="dragOver" class="drop-hint">松开以打开 PDF</div>
  </div>
</template>
