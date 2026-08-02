// UI store — transient + persisted view preferences (CONTEXT.md: 面板 / 工具栏).
// Pane visibility and theme persist to localStorage so the layout survives a
// refresh (ADR-0006: UI prefs are coordinate-class state, safe to persist).

import { defineStore } from 'pinia'
import {
  STORAGE_KEYS,
  loadString,
  saveString,
  loadBoolean,
  saveBoolean,
} from '../lib/storage'
import type { ZoomFitMode, ZoomLevel } from '../lib/viewer'
import { ZOOM_MODE_LABELS } from '../lib/viewer'

export type Theme = 'light' | 'dark' | 'sepia'

/** Reflect the active theme onto <html> so CSS variables apply app-wide. */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/** Whether the user has explicitly chosen a theme (vs. OS-following). */
function hasStoredTheme(): boolean {
  const stored = loadString(STORAGE_KEYS.theme)
  return stored === 'light' || stored === 'dark' || stored === 'sepia'
}

function detectInitialTheme(): Theme {
  // An explicit choice always wins — even on a differently-configured OS.
  if (hasStoredTheme()) return loadString(STORAGE_KEYS.theme) as Theme
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  }
  return 'light'
}

/**
 * First-time mobile readers should land on the document, not a conversation
 * drawer covering it (spec story 6). On desktop the default is the expanded
 * conversation (reading mode off). An explicit stored choice always wins.
 */
function detectInitialConversationOpen(): boolean {
  // An explicit stored choice always wins (use the documented storage wrapper).
  const stored = loadBoolean(STORAGE_KEYS.conversationOpen, false)
  // Distinguish "explicitly stored" from "defaulted": only trust the stored
  // value when a key actually exists.
  const hasStored =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(STORAGE_KEYS.conversationOpen) !== null
  if (hasStored) return stored
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mobile = window.matchMedia('(max-width: 768px)').matches
    return !mobile
  }
  return true
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    settingsOpen: false,
    /** Left 目录/书签 panel visible. */
    outlineOpen: loadBoolean(STORAGE_KEYS.outlineOpen, false),
    /** Right 对话 panel visible. */
    conversationOpen: detectInitialConversationOpen(),
    theme: detectInitialTheme(),
    /** Command palette (⌘K) visibility. */
    commandPaletteOpen: false,
    /** In-PDF search bar visibility. */
    searchOpen: false,
    /** Current zoom scale (1 = 100%), kept in sync from the viewer. */
    currentZoom: 1,
    /** Active fit mode, or null when the zoom is a plain scale factor. */
    zoomMode: null as ZoomFitMode | null,
    /** Current 1-based page number, kept in sync from the viewer. */
    currentPage: 1,
    /** Transient toast message (e.g. "仅支持 PDF 文件"), or null. */
    toast: null as string | null,
  }),

  getters: {
    /** What the toolbar's zoom control reads out: a fit mode or a percentage. */
    zoomLabel(state): string {
      if (state.zoomMode) return ZOOM_MODE_LABELS[state.zoomMode]
      return `${Math.round(state.currentZoom * 100)}%`
    },
  },

  actions: {
    openSettings() {
      this.settingsOpen = true
    },
    closeSettings() {
      this.settingsOpen = false
    },

    // --- Panels open independently (ADR-0012 / CONTEXT.md: 面板独立开合) -----
    // Opening one must NOT close the other. Every close path — the toolbar
    // button, the mobile scrim, and the tab bar — funnels through the same
    // `closeOutline` / `closeConversation` action, so button-close and
    // scrim-close persist identically and a refresh never surprises the user.

    toggleOutline() {
      this.outlineOpen = !this.outlineOpen
      saveBoolean(STORAGE_KEYS.outlineOpen, this.outlineOpen)
    },
    toggleConversation() {
      this.conversationOpen = !this.conversationOpen
      saveBoolean(STORAGE_KEYS.conversationOpen, this.conversationOpen)
    },

    openOutline() {
      this.outlineOpen = true
      saveBoolean(STORAGE_KEYS.outlineOpen, true)
    },
    openConversation() {
      this.conversationOpen = true
      saveBoolean(STORAGE_KEYS.conversationOpen, true)
    },
    closeOutline() {
      this.outlineOpen = false
      saveBoolean(STORAGE_KEYS.outlineOpen, false)
    },
    closeConversation() {
      this.conversationOpen = false
      saveBoolean(STORAGE_KEYS.conversationOpen, false)
    },

    /** Show a transient toast; auto-dismisses after `ms` (default 2.4s). */
    showToast(message: string, ms = 2400): void {
      this.toast = message
      if (typeof window !== 'undefined') {
        window.clearTimeout((this as unknown as { _toastTimer?: number })._toastTimer)
        ;(this as unknown as { _toastTimer?: number })._toastTimer = window.setTimeout(
          () => this.clearToast(),
          ms,
        )
      }
    },
    clearToast(): void {
      this.toast = null
    },

    setTheme(theme: Theme) {
      this.theme = theme
      saveString(STORAGE_KEYS.theme, theme)
      applyTheme(theme)
    },
    /** Cycle light → dark → sepia → light. */
    cycleTheme() {
      const order: Theme[] = ['light', 'dark', 'sepia']
      const next = order[(order.indexOf(this.theme) + 1) % order.length]
      this.setTheme(next)
    },

    openCommandPalette() {
      this.commandPaletteOpen = true
    },
    closeCommandPalette() {
      this.commandPaletteOpen = false
    },

    openSearch() {
      this.searchOpen = true
    },
    closeSearch() {
      this.searchOpen = false
    },

    /**
     * Record the resolved scale, plus the level it came from so a fit mode
     * keeps reading out as "适合宽度" rather than the percentage it happens to
     * resolve to at the current viewport width.
     */
    setZoom(zoom: number, level?: ZoomLevel) {
      this.currentZoom = zoom
      this.zoomMode = typeof level === 'string' ? level : null
    },

    setCurrentPage(page: number) {
      this.currentPage = page
    },

    /** Apply the persisted theme on app boot. */
    initTheme() {
      applyTheme(this.theme)
      // Follow the OS only when the user hasn't made an explicit choice.
      if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        !hasStoredTheme()
      ) {
        window
          .matchMedia('(prefers-color-scheme: dark)')
          .addEventListener('change', (event) => {
            this.setTheme(event.matches ? 'dark' : 'light')
          })
      }
    },
  },
})
