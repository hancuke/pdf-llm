<script setup lang="ts">
// 工具栏（Toolbar）— three zones, the layout mature PDF readers converged on:
//   left   = document identity + pane toggles
//   centre = reading position + zoom
//   right  = tools + appearance
// Icon-first with tooltips/aria-labels so the row survives narrow widths; on
// mobile (≤768px) the navigation entries live in the 底部 Tab 栏 instead and
// the top bar keeps only 标题 + 页码 + 主题 (ADR-0014).

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '../stores/ui'
import { useReaderStore } from '../stores/reader'
import {
  jumpToPage,
  zoomIn,
  zoomOut,
  setZoomLevel,
  type ZoomLevel,
  ZOOM_PRESETS,
} from '../lib/viewer'

const ui = useUiStore()
const reader = useReaderStore()
const { numPages, hasDocument } = storeToRefs(reader)
const { conversationOpen, outlineOpen, theme, currentPage, zoomLabel, zoomMode, selectMode } =
  storeToRefs(ui)

const fileInput = ref<HTMLInputElement | null>(null)

const themeLabels: Record<string, string> = {
  light: '浅色',
  dark: '深色',
  sepia: '护眼',
}

/** The 干净题目 when we have one, else the file name, else the app name. */
const documentLabel = computed(
  () => reader.documentTitle || reader.fileName || 'PDF-LLM',
)

function openFileDialog() {
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await reader.loadFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

// --- Page field -------------------------------------------------------------
// One control replaces the old "跳页输入框 + 第 N 页读数" pair: it shows the
// current page and accepts a new one. While the user is typing we stop
// mirroring the scroll position, and any invalid entry is discarded on blur.
const pageInput = ref<HTMLInputElement | null>(null)
const pageDraft = ref(String(currentPage.value))
const editingPage = ref(false)

watch(currentPage, (page) => {
  if (!editingPage.value) pageDraft.value = String(page)
})

const canGoPrevious = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < numPages.value)

function goToPreviousPage() {
  if (canGoPrevious.value) jumpToPage(currentPage.value - 2)
}

function goToNextPage() {
  if (canGoNext.value) jumpToPage(currentPage.value)
}

function onPageFocus() {
  editingPage.value = true
  pageInput.value?.select()
}

function onPageBlur() {
  editingPage.value = false
  pageDraft.value = String(currentPage.value)
}

function commitPage() {
  const page = Number(pageDraft.value)
  if (Number.isInteger(page) && page >= 1 && page <= numPages.value) {
    jumpToPage(page - 1)
  }
  // Blur resets the draft to whatever page we actually ended up on.
  pageInput.value?.blur()
}

// --- Zoom -------------------------------------------------------------------
const zoomMenuOpen = ref(false)

function stepZoom(direction: 1 | -1) {
  if (direction > 0) zoomIn()
  else zoomOut()
}

function applyZoomPreset(level: ZoomLevel) {
  setZoomLevel(level)
  zoomMenuOpen.value = false
}

function isZoomPresetActive(level: ZoomLevel): boolean {
  if (typeof level === 'string') return zoomMode.value === level
  return zoomMode.value === null && Math.round(ui.currentZoom * 100) === level * 100
}

function toggleZoomMenu() {
  zoomMenuOpen.value = !zoomMenuOpen.value
}

function closeZoomMenu() {
  zoomMenuOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!zoomMenuOpen.value) return
  if ((event.target as HTMLElement).closest('.tb-zoom')) return
  zoomMenuOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', onDocumentPointerDown),
)
</script>

<template>
  <header class="toolbar">
    <div class="tb-zone tb-left">
      <span class="brand-mark" aria-hidden="true">P</span>
      <button
        class="tb-icon hide-under-768"
        type="button"
        :class="{ active: outlineOpen }"
        :aria-pressed="outlineOpen"
        title="目录 / 书签"
        aria-label="目录 / 书签"
        @click="ui.toggleOutline()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
      </button>
      <button
        class="tb-icon hide-under-768"
        type="button"
        title="打开 PDF"
        aria-label="打开 PDF"
        @click="openFileDialog"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf"
        class="hidden"
        @change="onFile"
      />
      <span class="doc-title" :title="reader.fileName || documentLabel">
        {{ documentLabel }}
      </span>
    </div>

    <div v-if="hasDocument" class="tb-zone tb-center">
      <div class="tb-pager">
        <button
          class="tb-icon hide-under-900"
          type="button"
          :disabled="!canGoPrevious"
          title="上一页"
          aria-label="上一页"
          @click="goToPreviousPage"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>
        </button>
        <div class="page-field">
          <input
            ref="pageInput"
            v-model="pageDraft"
            class="page-input"
            type="text"
            inputmode="numeric"
            aria-label="页码"
            @focus="onPageFocus"
            @blur="onPageBlur"
            @keyup.enter="commitPage"
          />
          <span class="page-total">/ {{ numPages }}</span>
        </div>
        <button
          class="tb-icon hide-under-900"
          type="button"
          :disabled="!canGoNext"
          title="下一页"
          aria-label="下一页"
          @click="goToNextPage"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      <div class="tb-zoom hide-under-768" @keydown.esc="closeZoomMenu">
        <button class="tb-icon" type="button" title="缩小" aria-label="缩小" @click="stepZoom(-1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14"/></svg>
        </button>
        <button
          class="zoom-label"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="zoomMenuOpen"
          title="缩放"
          @click="toggleZoomMenu"
        >
          {{ zoomLabel }}
          <svg class="zoom-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <button class="tb-icon" type="button" title="放大" aria-label="放大" @click="stepZoom(1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>

        <ul v-if="zoomMenuOpen" class="tb-menu" role="menu">
          <li v-for="preset in ZOOM_PRESETS" :key="String(preset.level)">
            <button
              class="tb-menu-item"
              type="button"
              role="menuitemradio"
              :aria-checked="isZoomPresetActive(preset.level)"
              @click="applyZoomPreset(preset.level)"
            >
              <span class="tb-menu-check" aria-hidden="true">
                {{ isZoomPresetActive(preset.level) ? '✓' : '' }}
              </span>
              {{ preset.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div class="tb-zone tb-right">
      <button
        class="tb-icon"
        type="button"
        :class="{ active: selectMode }"
        :aria-pressed="selectMode"
        title="划词模式（开启后拖动选字）"
        aria-label="划词模式"
        @click="ui.toggleSelectMode()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h10M4 17h7"/><path d="M15 10l5 5M20 10l-5 5"/></svg>
      </button>
      <button
        class="tb-icon hide-under-768"
        type="button"
        title="搜索 (Ctrl/Cmd+F)"
        aria-label="搜索"
        @click="ui.openSearch()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      </button>
      <button
        class="tb-icon hide-under-768"
        type="button"
        :class="{ active: conversationOpen }"
        :aria-pressed="conversationOpen"
        title="对话"
        aria-label="对话"
        @click="ui.toggleConversation()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.8A8 8 0 1 1 21 12z"/></svg>
      </button>
      <button
        class="tb-icon"
        type="button"
        :title="`主题：${themeLabels[theme]}（点击切换）`"
        :aria-label="`主题：${themeLabels[theme]}，点击切换`"
        @click="ui.cycleTheme()"
      >
        <svg v-if="theme === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg v-else-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>
      </button>
      <button
        class="tb-kbd hide-under-1024"
        type="button"
        title="命令面板 (Ctrl/Cmd+K)"
        aria-label="命令面板"
        @click="ui.openCommandPalette()"
      >
        ⌘K
      </button>
      <button
        class="tb-icon hide-under-768"
        type="button"
        title="设置"
        aria-label="设置"
        @click="ui.openSettings()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px max(16px, env(safe-area-inset-right)) 8px
    max(16px, env(safe-area-inset-left));
  padding-top: calc(8px + env(safe-area-inset-top));
  background: var(--bar-bg);
  border-bottom: 1px solid var(--bar-border);
}

.tb-zone {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Left and right grow equally so the centre zone stays optically centred. */
.tb-left {
  flex: 1 1 0;
  min-width: 0;
  gap: 8px;
}
.tb-center {
  flex: 0 0 auto;
  gap: 10px;
}
.tb-right {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-end;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 13px;
  font-weight: 700;
  flex: 0 0 auto;
}
.doc-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}
.tb-icon svg {
  width: 20px;
  height: 20px;
}
.tb-icon:hover:not(:disabled) {
  background: var(--hover);
}
.tb-icon:disabled {
  opacity: 0.35;
  cursor: default;
}
.tb-icon.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.tb-kbd {
  flex: 0 0 auto;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}
.tb-kbd:hover {
  background: var(--hover);
  color: var(--text);
}

.tb-pager {
  display: flex;
  align-items: center;
  gap: 2px;
}
.page-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--surface-2);
  border-radius: 999px;
}
.page-input {
  width: 4ch;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: right;
  padding: 3px 0;
  font-variant-numeric: tabular-nums;
}
.page-total {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.tb-zoom {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.zoom-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 82px;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease);
}
.zoom-label:hover {
  background: var(--hover);
}
.zoom-caret {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
}

.tb-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  min-width: 140px;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  animation: menu-in var(--motion-fast) var(--ease);
}
.tb-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.tb-menu-item:hover {
  background: var(--hover);
}
.tb-menu-check {
  width: 12px;
  color: var(--accent);
}
@keyframes menu-in {
  from {
    opacity: 0;
    transform: translate(-50%, -4px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.tb-icon:focus-visible,
.tb-kbd:focus-visible,
.zoom-label:focus-visible,
.page-input:focus-visible,
.tb-menu-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Progressive disclosure: shed the least essential control first, rather than
   hiding a whole group at one breakpoint. */
@media (max-width: 1024px) {
  .hide-under-1024 {
    display: none !important;
  }
}
@media (max-width: 900px) {
  .hide-under-900 {
    display: none !important;
  }
}
@media (max-width: 768px) {
  /* Navigation entries live in the 底部 Tab 栏; the top bar keeps document
     identity, reading position and appearance (ADR-0014). */
  .hide-under-768 {
    display: none !important;
  }
  .toolbar {
    gap: 8px;
    padding: 6px max(12px, env(safe-area-inset-right)) 6px
      max(12px, env(safe-area-inset-left));
    padding-top: calc(6px + env(safe-area-inset-top));
  }
  /* Title takes the slack; page field and theme sit at the trailing edge. */
  .tb-center,
  .tb-right {
    flex: 0 0 auto;
  }
  .tb-icon {
    width: 44px;
    height: 44px;
  }
  .page-field {
    min-height: 44px;
    padding: 0 12px;
  }
  /* 16px keeps iOS Safari from zooming the page when the field takes focus. */
  .page-input {
    font-size: 16px;
  }
  .page-total {
    font-size: 13px;
  }
}
</style>
