<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUiStore } from '../stores/ui'
import OutlinePanel from './OutlinePanel.vue'
import BookmarksPanel from './BookmarksPanel.vue'
import VocabBookPanel from './VocabBookPanel.vue'

// Two tabs share the left panel (CONTEXT.md: 目录 / 书签); 生词本 is a third
// (CONTEXT.md: 生词本 / ADR-0016). The active tab lives in the ui store so the
// bottom Tab 栏 can open the panel on a specific tab.
const ui = useUiStore()
const { leftTab } = storeToRefs(ui)
</script>

<template>
  <aside class="left-panel">
    <div class="panel-tabs">
      <button
        class="tab"
        type="button"
        :class="{ active: leftTab === 'outline' }"
        @click="ui.toggleLeftTab('outline')"
      >
        目录
      </button>
      <button
        class="tab"
        type="button"
        :class="{ active: leftTab === 'bookmarks' }"
        @click="ui.toggleLeftTab('bookmarks')"
      >
        书签
      </button>
      <button
        class="tab"
        type="button"
        :class="{ active: leftTab === 'vocab' }"
        @click="ui.toggleLeftTab('vocab')"
      >
        生词本
      </button>
    </div>
    <div class="panel-body">
      <OutlinePanel v-if="leftTab === 'outline'" />
      <BookmarksPanel v-else-if="leftTab === 'bookmarks'" />
      <VocabBookPanel v-else />
    </div>
  </aside>
</template>
