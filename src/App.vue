<script setup lang="ts">
import { ref } from 'vue'
import { useReaderStore } from './stores/reader'
import { useUiStore } from './stores/ui'
import PdfViewer from './components/PdfViewer.vue'
import ConversationPanel from './components/ConversationPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const reader = useReaderStore()
const ui = useUiStore()

const dragOver = ref(false)

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type === 'application/pdf') {
    void reader.loadFile(file)
  }
}
</script>

<template>
  <div
    class="app"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <header class="app-header">
      <div class="brand">
        <span class="brand-name">PDF-LLM</span>
        <span class="brand-sub">本地 PDF · 选中即理解</span>
      </div>
      <button class="settings-button" type="button" @click="ui.openSettings()">
        设置
      </button>
    </header>

    <main class="app-main">
      <PdfViewer class="pane pdf-pane" />
      <ConversationPanel class="pane conv-pane" />
    </main>

    <SettingsPanel v-if="ui.settingsOpen" />

    <div v-if="dragOver" class="drop-hint">松开以打开 PDF</div>
  </div>
</template>
