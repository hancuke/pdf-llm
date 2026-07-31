<script setup lang="ts">
import { ref } from 'vue'
import OutlinePanel from './OutlinePanel.vue'
import BookmarksPanel from './BookmarksPanel.vue'

// Two tabs share the left panel (CONTEXT.md: 目录 / 书签).
const activeTab = ref<'outline' | 'bookmarks'>('outline')
</script>

<template>
  <aside class="left-panel">
    <div class="panel-tabs">
      <button
        class="tab"
        type="button"
        :class="{ active: activeTab === 'outline' }"
        @click="activeTab = 'outline'"
      >
        目录
      </button>
      <button
        class="tab"
        type="button"
        :class="{ active: activeTab === 'bookmarks' }"
        @click="activeTab = 'bookmarks'"
      >
        书签
      </button>
    </div>
    <div class="panel-body">
      <OutlinePanel v-if="activeTab === 'outline'" />
      <BookmarksPanel v-else />
    </div>
  </aside>
</template>
