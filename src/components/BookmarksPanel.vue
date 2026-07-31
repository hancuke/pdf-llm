<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { useBookmarkStore } from '../stores/bookmarks'
import { jumpToPage } from '../lib/viewer'
import type { Bookmark } from '../lib/bookmarks'

const reader = useReaderStore()
const bookmarks = useBookmarkStore()
const { fileName } = storeToRefs(reader)

const list = computed(() => bookmarks.forDocument(fileName.value))

function onJump(bookmark: Bookmark) {
  // Restore the exact saved position (page + vertical fraction).
  jumpToPage(bookmark.pageIndex, bookmark.alignY)
}

function onRemove(id: string) {
  if (fileName.value) bookmarks.removeBookmark(fileName.value, id)
}

function onAdd() {
  bookmarks.addBookmarkAtCurrentPosition(fileName.value)
}
</script>

<template>
  <div class="bookmarks-panel">
    <div class="bookmarks-head">
      <span class="panel-empty" v-if="list.length === 0">还没有书签。</span>
      <button v-else class="link-button" type="button" @click="onAdd">
        + 添加当前位置
      </button>
    </div>
    <ul v-if="list.length > 0" class="bookmark-list">
      <li v-for="b in list" :key="b.id" class="bookmark-item">
        <button class="bookmark-jump" type="button" @click="onJump(b)">
          {{ b.label }}
        </button>
        <button
          class="link-button danger"
          type="button"
          title="删除"
          @click="onRemove(b.id)"
        >
          删除
        </button>
      </li>
    </ul>
    <button v-if="list.length === 0" class="add-bookmark" type="button" @click="onAdd">
      ⌘D 或点击此处，书签当前位置
    </button>
  </div>
</template>
