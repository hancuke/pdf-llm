<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { useBookmarkStore } from '../stores/bookmarks'
import { jumpToPage } from '../lib/viewer'
import type { Bookmark } from '../lib/bookmarks'

const reader = useReaderStore()
const bookmarks = useBookmarkStore()
const { fileName } = storeToRefs(reader)

const list = computed(() => bookmarks.forDocument(fileName.value))

// Reactive mobile detection (re-evaluates on rotate/resize).
const isMobile = ref(false)
function updateMobile() {
  isMobile.value =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 768px)').matches
      : false
}
updateMobile()
onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(max-width: 768px)').addEventListener('change', updateMobile)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(max-width: 768px)').removeEventListener('change', updateMobile)
  }
})

const emptyHint = computed(() =>
  isMobile.value
    ? '点底部「书签」标签，书签当前位置'
    : '⌘D 或点击下方「+ 添加当前位置」，书签当前位置',
)

// Optional name/note captured when adding a bookmark (story 26).
const newName = ref('')
// Bookmark currently being renamed (inline edit).
const editingId = ref<string | null>(null)
const editValue = ref('')

function onJump(bookmark: Bookmark) {
  jumpToPage(bookmark.pageIndex, bookmark.alignY)
}

function onRemove(id: string) {
  if (fileName.value) bookmarks.removeBookmark(fileName.value, id)
}

function onAdd() {
  bookmarks.addBookmarkAtCurrentPosition(fileName.value, newName.value.trim() || undefined)
  newName.value = ''
}

function startRename(bookmark: Bookmark) {
  editingId.value = bookmark.id
  editValue.value = bookmark.label
}
function commitRename(id: string) {
  if (fileName.value) bookmarks.updateBookmarkLabel(fileName.value, id, editValue.value)
  editingId.value = null
  editValue.value = ''
}
function cancelRename() {
  editingId.value = null
  editValue.value = ''
}
</script>

<template>
  <div class="bookmarks-panel">
    <div class="bookmarks-head">
      <button
        v-if="list.length === 0"
        class="panel-empty"
        type="button"
        @click="onAdd"
      >
        {{ emptyHint }}
      </button>
      <div v-else class="add-row">
        <input
          v-model="newName"
          class="bookmark-name-input"
          type="text"
          placeholder="可选名称 / 备注"
          @keydown.enter.prevent="onAdd"
        />
        <button class="link-button" type="button" @click="onAdd">+ 添加</button>
      </div>
    </div>

    <ul v-if="list.length > 0" class="bookmark-list">
      <li v-for="b in list" :key="b.id" class="bookmark-item">
        <button
          v-if="editingId !== b.id"
          class="bookmark-jump"
          type="button"
          @click="onJump(b)"
          @dblclick="startRename(b)"
        >
          {{ b.label }}
        </button>
        <input
          v-else
          v-model="editValue"
          class="bookmark-name-input"
          type="text"
          @keydown.enter.prevent="commitRename(b.id)"
          @blur="commitRename(b.id)"
        />
        <div class="bookmark-actions">
          <button
            v-if="editingId !== b.id"
            class="link-button"
            type="button"
            @click="startRename(b)"
          >
            重命名
          </button>
          <button v-else class="link-button" type="button" @click="cancelRename">取消</button>
          <button class="link-button danger" type="button" @click="onRemove(b.id)">删除</button>
        </div>
      </li>
    </ul>

    <button v-if="list.length === 0" class="add-bookmark" type="button" @click="onAdd">
      + 添加当前位置
    </button>
  </div>
</template>
