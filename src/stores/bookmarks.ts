// Bookmarks + last reading position store (CONTEXT.md: 书签 / 面板).
//
// Per ADR-0006 these persist ONLY coordinates (page + vertical fraction), never
// document text or conversation. They are keyed by file name because the
// document bytes themselves are not persisted (ADR-0001): across refreshes we
// can only match by name, which is acceptable for a position memory.

import { defineStore } from 'pinia'
import { STORAGE_KEYS, loadJson, saveJson, createId } from '../lib/storage'
import type { Bookmark, ReadingPosition } from '../lib/bookmarks'
import { getReadingPosition, getCurrentPage } from '../lib/viewer'

type BookmarkMap = Record<string, Bookmark[]>
type PositionMap = Record<string, ReadingPosition>

export const useBookmarkStore = defineStore('bookmarks', {
  state: () => ({
    /** Bookmarks grouped by file name. */
    byDocument: loadJson<BookmarkMap>(STORAGE_KEYS.bookmarks, {}),
    /** Last reading position grouped by file name. */
    lastPositions: loadJson<PositionMap>(STORAGE_KEYS.lastPositions, {}),
  }),

  getters: {
    /** Bookmarks for a given file, newest first. */
    forDocument: (state) => (fileName: string): Bookmark[] =>
      [...(state.byDocument[fileName] ?? [])].sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
  },

  actions: {
    /** Persist a bookmark at an explicit position. */
    addBookmark(fileName: string, position: ReadingPosition): void {
      const list = this.byDocument[fileName] ?? []
      const bookmark: Bookmark = {
        id: createId(),
        pageIndex: position.pageIndex,
        alignY: position.alignY,
        label: `第 ${position.pageIndex + 1} 页`,
        createdAt: Date.now(),
      }
      this.byDocument = {
        ...this.byDocument,
        [fileName]: [...list, bookmark],
      }
      saveJson(STORAGE_KEYS.bookmarks, this.byDocument)
    },

    /**
     * Capture the current reading position (page + vertical fraction) from the
     * live viewer and store it as a bookmark. Single source of truth shared by
     * the ⌘D shortcut, the bookmarks panel, and the command palette.
     */
    addBookmarkAtCurrentPosition(fileName: string): void {
      if (!fileName) return
      const position =
        getReadingPosition() ?? {
          pageIndex: getCurrentPage() - 1,
          alignY: 0,
        }
      this.addBookmark(fileName, position)
    },

    removeBookmark(fileName: string, id: string): void {
      const list = this.byDocument[fileName] ?? []
      const next = list.filter((b) => b.id !== id)
      this.byDocument = { ...this.byDocument, [fileName]: next }
      saveJson(STORAGE_KEYS.bookmarks, this.byDocument)
    },

    /** Record the last reading position for a file (auto-resume). */
    setLastPosition(fileName: string, position: ReadingPosition): void {
      this.lastPositions = {
        ...this.lastPositions,
        [fileName]: position,
      }
      saveJson(STORAGE_KEYS.lastPositions, this.lastPositions)
    },

    getLastPosition(fileName: string): ReadingPosition | undefined {
      return this.lastPositions[fileName]
    },
  },
})
