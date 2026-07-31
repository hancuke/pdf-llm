<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '../stores/ui'
import { useReaderStore } from '../stores/reader'

const ui = useUiStore()
const reader = useReaderStore()
const { outlineOpen, conversationOpen, searchOpen, settingsOpen } = storeToRefs(ui)

const fileInput = ref<HTMLInputElement | null>(null)

function openFileDialog() {
  fileInput.value?.click()
}
async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await reader.loadFile(file)
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <nav class="bottom-tabbar" aria-label="主导航">
    <input
      ref="fileInput"
      type="file"
      accept="application/pdf"
      class="hidden"
      @change="onFile"
    />

    <button class="tab" type="button" @click="openFileDialog">
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      </span>
      <span class="tab-label">打开</span>
    </button>

    <button
      class="tab"
      type="button"
      :class="{ active: outlineOpen }"
      @click="ui.toggleOutline()"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
      </span>
      <span class="tab-label">目录</span>
    </button>

    <button
      class="tab"
      type="button"
      :class="{ active: searchOpen }"
      @click="ui.openSearch()"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      </span>
      <span class="tab-label">搜索</span>
    </button>

    <button
      class="tab"
      type="button"
      :class="{ active: conversationOpen }"
      @click="ui.toggleConversation()"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.8A8 8 0 1 1 21 12z"/></svg>
      </span>
      <span class="tab-label">对话</span>
    </button>

    <button
      class="tab"
      type="button"
      :class="{ active: settingsOpen }"
      @click="ui.openSettings()"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3v-.1a2 2 0 1 1 4 0V3a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10v.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
      </span>
      <span class="tab-label">设置</span>
    </button>
  </nav>
</template>
