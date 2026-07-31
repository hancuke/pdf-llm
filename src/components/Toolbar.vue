<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '../stores/ui'
import { useReaderStore } from '../stores/reader'
import { jumpToPage, zoomIn, zoomOut, getCurrentZoom } from '../lib/viewer'

const ui = useUiStore()
const reader = useReaderStore()
const { numPages } = storeToRefs(reader)
const { conversationOpen, outlineOpen, theme, currentZoom, currentPage } =
  storeToRefs(ui)

const fileInput = ref<HTMLInputElement | null>(null)
const gotoValue = ref('')

const zoomPercent = computed(() => Math.round(currentZoom.value * 100))

const themeLabels: Record<string, string> = {
  light: '浅色',
  dark: '深色',
  sepia: '护眼',
}

function openFileDialog() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await reader.loadFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

function applyZoom(delta: number) {
  if (delta > 0) zoomIn()
  else zoomOut()
  ui.setZoom(getCurrentZoom())
}

function gotoPage() {
  const page = Number(gotoValue.value)
  if (!Number.isFinite(page) || page < 1 || page > numPages.value) return
  jumpToPage(page - 1)
  gotoValue.value = ''
}
</script>

<template>
  <header class="toolbar">
    <div class="tb-group tb-brand">
      <span class="brand-mark">P</span>
      <span class="brand-name tb-hide-mobile">PDF-LLM</span>
      <button class="tb-button tb-hide-mobile" type="button" @click="openFileDialog">打开</button>
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf"
        class="hidden"
        @change="onFile"
      />
      <span v-if="reader.fileName" class="file-name" :title="reader.fileName">
        {{ reader.fileName }}
      </span>
    </div>

    <div class="tb-group tb-hide-mobile">
      <button
        class="tb-button"
        type="button"
        :class="{ active: outlineOpen }"
        title="目录 / 书签"
        @click="ui.toggleOutline()"
      >
        目录
      </button>
      <button
        class="tb-button"
        type="button"
        title="搜索 (Ctrl/Cmd+F)"
        @click="ui.openSearch()"
      >
        搜索
      </button>
      <button
        class="tb-button"
        type="button"
        :class="{ active: conversationOpen }"
        title="对话"
        @click="ui.toggleConversation()"
      >
        对话
      </button>
    </div>

    <div class="tb-group tb-hide-mobile">
      <button class="tb-icon" type="button" title="缩小" @click="applyZoom(-1)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>
      </button>
      <span class="zoom-label">{{ zoomPercent }}%</span>
      <button class="tb-icon" type="button" title="放大" @click="applyZoom(1)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <div class="goto">
        <input
          v-model="gotoValue"
          class="goto-input"
          type="number"
          min="1"
          :max="numPages"
          placeholder="页"
          @keyup.enter="gotoPage"
        />
        <span class="goto-total">/ {{ numPages }}</span>
      </div>
      <span class="current-page">第 {{ currentPage }} 页</span>
    </div>

    <div class="tb-group tb-right">
      <button
        class="tb-button tb-hide-mobile"
        type="button"
        :title="`主题：${themeLabels[theme]} (点击切换)`"
        @click="ui.cycleTheme()"
      >
        {{ themeLabels[theme] }}
      </button>
      <button
        class="tb-button tb-hide-mobile tb-hide-md"
        type="button"
        title="命令面板 (Ctrl/Cmd+K)"
        @click="ui.openCommandPalette()"
      >
        命令 ⌘K
      </button>
      <button class="tb-button tb-hide-mobile" type="button" @click="ui.openSettings()">
        设置
      </button>
    </div>
  </header>
</template>
