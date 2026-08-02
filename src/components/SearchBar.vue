<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { jumpToPage } from '../lib/viewer'

const reader = useReaderStore()
const ui = useUiStore()
const { searchQuery, searchResults, searching } = storeToRefs(reader)

const input = ref<HTMLInputElement | null>(null)
/** Index of the currently-focused match among searchResults. */
const activeIndex = ref(0)
let debounce: ReturnType<typeof setTimeout> | null = null

// Keep the input in sync if the query is cleared elsewhere.
watch(searchQuery, (q) => {
  if (q === '' && input.value?.value) input.value.value = ''
})

// Reset the focused match whenever the result set changes.
watch(searchResults, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = 0
})

// Autofocus the input the moment the bar opens (story 23).
watch(
  () => ui.searchOpen,
  (open) => {
    if (open) {
      activeIndex.value = 0
      void nextTick().then(() => input.value?.focus())
    }
  },
  { immediate: true },
)

function onInput() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    void reader.runSearch(input.value?.value ?? '')
  }, 250)
}

function focusMatch(index: number) {
  const list = searchResults.value
  if (list.length === 0) return
  activeIndex.value = (index + list.length) % list.length
  const hit = list[activeIndex.value]
  if (hit) jumpToPage(hit.pageIndex)
}

function next() {
  focusMatch(activeIndex.value + 1)
}
function prev() {
  focusMatch(activeIndex.value - 1)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) prev()
    else next()
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    if (event.shiftKey) prev()
    else next()
  } else if (event.key === 'Escape') {
    close()
  }
}

// Global ⌘G / Ctrl+G navigation while the search bar is open (story 22).
function onGlobalKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
    if (!ui.searchOpen) return
    event.preventDefault()
    if (event.shiftKey) prev()
    else next()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

function onJump(pageIndex: number) {
  focusMatch(searchResults.value.findIndex((h) => h.pageIndex === pageIndex))
}

function close() {
  ui.closeSearch()
  reader.clearSearch()
  if (input.value) input.value.value = ''
  activeIndex.value = 0
}
</script>

<template>
  <div class="search-bar">
    <div class="search-row">
      <input
        ref="input"
        v-model="searchQuery"
        class="search-input"
        type="search"
        placeholder="搜索文档…"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button class="search-prev" type="button" aria-label="上一个" :disabled="!searchResults.length" @click="prev">↑</button>
      <button class="search-next" type="button" aria-label="下一个" :disabled="!searchResults.length" @click="next">↓</button>
    </div>

    <span v-if="searching" class="search-status">搜索中…</span>
    <span v-else-if="searchQuery && searchResults.length" class="search-status">
      {{ activeIndex + 1 }} / {{ searchResults.length }} 条结果
    </span>
    <span v-else-if="searchQuery && !searching" class="search-status">无匹配结果</span>
    <span v-else class="search-status">输入关键字以在文档中查找</span>

    <button class="link-button" type="button" @click="close">关闭</button>

    <ul v-if="searchResults.length > 0" class="search-results">
      <li
        v-for="(hit, i) in searchResults"
        :key="i"
        class="search-hit"
        :class="{ current: i === activeIndex }"
        @click="onJump(hit.pageIndex)"
      >
        <span class="hit-page">第 {{ hit.pageIndex + 1 }} 页</span>
        <span class="hit-snippet">{{ hit.snippet }}</span>
      </li>
    </ul>
  </div>
</template>
