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

export const useUiStore = defineStore('ui', {
  state: () => ({
    settingsOpen: false,
    /** Left 目录/书签 panel visible. */
    outlineOpen: loadBoolean(STORAGE_KEYS.outlineOpen, false),
    /** Right 对话 panel visible. */
    conversationOpen: loadBoolean(STORAGE_KEYS.conversationOpen, true),
    theme: detectInitialTheme(),
    /** Command palette (⌘K) visibility. */
    commandPaletteOpen: false,
    /** In-PDF search bar visibility. */
    searchOpen: false,
    /** Current zoom scale (1 = 100%), kept in sync from the viewer. */
    currentZoom: 1,
    /** Current 1-based page number, kept in sync from the viewer. */
    currentPage: 1,
  }),

  actions: {
    openSettings() {
      this.settingsOpen = true
    },
    closeSettings() {
      this.settingsOpen = false
    },

    toggleOutline() {
      // Bottom drawers are mutually exclusive so two sheets never stack.
      if (!this.outlineOpen) this.conversationOpen = false
      this.outlineOpen = !this.outlineOpen
      saveBoolean(STORAGE_KEYS.outlineOpen, this.outlineOpen)
    },
    toggleConversation() {
      if (!this.conversationOpen) this.outlineOpen = false
      this.conversationOpen = !this.conversationOpen
      saveBoolean(STORAGE_KEYS.conversationOpen, this.conversationOpen)
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

    setZoom(zoom: number) {
      this.currentZoom = zoom
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
