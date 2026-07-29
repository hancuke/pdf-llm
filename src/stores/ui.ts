// UI store — transient view state (e.g. whether the Settings panel is open).
// Intentionally minimal; not persisted.

import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    settingsOpen: false,
  }),
  actions: {
    openSettings() {
      this.settingsOpen = true
    },
    closeSettings() {
      this.settingsOpen = false
    },
  },
})
