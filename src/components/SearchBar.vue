<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { useUiStore } from '../stores/ui'
import { jumpToPage } from '../lib/viewer'

const reader = useReaderStore()
const ui = useUiStore()
const { searchQuery, searchResults, searching } = storeToRefs(reader)

const input = ref('')
let debounce: ReturnType<typeof setTimeout> | null = null

// Keep the input in sync if the query is cleared elsewhere.
watch(searchQuery, (q) => {
  if (q === '' && input.value !== '') input.value = ''
})

function onInput() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    void reader.runSearch(input.value)
  }, 250)
}

function onJump(pageIndex: number) {
  jumpToPage(pageIndex)
}

function close() {
  ui.closeSearch()
  reader.clearSearch()
  input.value = ''
}
</script>

<template>
  <div class="search-bar">
    <input
      v-model="input"
      class="search-input"
      type="search"
      placeholder="搜索文档…"
      @input="onInput"
      @keyup.esc="close"
    />
    <span v-if="searching" class="search-status">搜索中…</span>
    <span v-else-if="searchQuery" class="search-status">
      {{ searchResults.length }} 条结果
    </span>
    <button class="link-button" type="button" @click="close">关闭</button>

    <ul v-if="searchResults.length > 0" class="search-results">
      <li
        v-for="(hit, i) in searchResults"
        :key="i"
        class="search-hit"
        @click="onJump(hit.pageIndex)"
      >
        <span class="hit-page">第 {{ hit.pageIndex + 1 }} 页</span>
        <span class="hit-snippet">{{ hit.snippet }}</span>
      </li>
    </ul>
  </div>
</template>
