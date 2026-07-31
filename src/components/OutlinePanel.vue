<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { jumpToPage } from '../lib/viewer'

const reader = useReaderStore()
const { outline } = storeToRefs(reader)

function onJump(pageIndex: number) {
  if (pageIndex >= 0) jumpToPage(pageIndex)
}
</script>

<template>
  <div class="outline-panel">
    <p v-if="outline.length === 0" class="panel-empty">
      该 PDF 没有嵌入目录。
    </p>
    <ul v-else class="outline-list">
      <li
        v-for="(item, i) in outline"
        :key="i"
        class="outline-item"
        :class="{ disabled: item.pageIndex < 0 }"
        :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
        @click="onJump(item.pageIndex)"
      >
        {{ item.title }}
      </li>
    </ul>
  </div>
</template>
