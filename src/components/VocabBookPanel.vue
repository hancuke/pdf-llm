<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useReaderStore } from '../stores/reader'
import { useVocabStore } from '../stores/vocab'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { jumpToPage } from '../lib/viewer'
import { speakWord } from '../lib/tts'
import type { VocabEntry } from '../stores/vocab'

const reader = useReaderStore()
const vocab = useVocabStore()
const settings = useSettingsStore()
const ui = useUiStore()
const { entries, grouped } = storeToRefs(vocab)
const { fileName } = storeToRefs(reader)

const groupList = computed(() => Object.entries(grouped.value))

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
    ? '点底部「朗读」选中文字，再点词收藏'
    : '在朗读面板中点词，即可收藏到生词本',
)

/**
 * Read-aloud / phonetics send selected text to 3rd-party APIs (ADR-0013). When
 * disabled, block the pronunciation request and explain instead of firing it.
 */
function requireExternal(): boolean {
  if (settings.externalRequestsEnabled) return true
  ui.showToast('已在设置中关闭朗读 / 音标外部请求')
  return false
}

function onPlay(entry: VocabEntry) {
  if (!requireExternal()) return
  void speakWord(entry.word, settings.ttsConfig)
}

/** Jump back to the source page only when that document is still open. */
function canJump(entry: VocabEntry): boolean {
  return entry.pageIndex !== null && reader.hasDocument && entry.fileName === fileName.value
}
function onJump(entry: VocabEntry) {
  if (entry.pageIndex === null) return
  if (!canJump(entry)) {
    ui.showToast('文档未打开，无法跳转')
    return
  }
  jumpToPage(entry.pageIndex, 0)
}

function onRemove(id: string) {
  vocab.remove(id)
}
</script>

<template>
  <div class="vocab-book">
    <p v-if="entries.length === 0" class="vocab-empty">{{ emptyHint }}</p>

    <template v-for="[title, group] in groupList" :key="title">
      <div class="vocab-group-title">{{ title }}</div>
      <ul class="vocab-list">
        <li v-for="entry in group" :key="entry.id" class="vocab-item">
          <div class="vocab-main">
            <button class="vocab-word" type="button" @click="onPlay(entry)">
              {{ entry.word }}
            </button>
            <span v-if="entry.phonetics" class="vocab-phon">/{{ entry.phonetics }}/</span>
          </div>
          <p v-if="entry.context" class="vocab-context">{{ entry.context }}</p>
          <div class="vocab-actions">
            <button
              class="link-button"
              type="button"
              :disabled="!canJump(entry)"
              @click="onJump(entry)"
            >
              跳转
            </button>
            <button class="link-button danger" type="button" @click="onRemove(entry.id)">
              删除
            </button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
