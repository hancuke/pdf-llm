// Vocabulary book store (CONTEXT.md: 生词本 / ADR-0016).
//
// User-collected words from the read-aloud 词汇卡. Persisted to localStorage
// (browser-only, never uploaded — ADR-0001). Deliberately stores selected text
// (word + context sentence), diverging from the 书签 model which keeps only
// page + position (ADR-0016).

import { defineStore } from 'pinia'
import { STORAGE_KEYS, loadJson, saveJson, createId } from '../lib/storage'

/** A single collected word (CONTEXT.md: 生词本 entry). */
export interface VocabEntry {
  id: string
  /** The collected word (from a 词单元). */
  word: string
  /** IPA captured at collection time; may be empty for non-English. */
  phonetics: string
  /** The selection context the word was collected from. */
  context: string
  /** Clean title of the source document (display). */
  documentTitle: string
  /** Stable source document key (file name) — used for dedup + grouping. */
  fileName: string
  /** 0-based source page index, or null when unknown. */
  pageIndex: number | null
  /** Collection time (ms epoch). */
  createdAt: number
}

/** Fields needed to collect a word (id/createdAt assigned by the store). */
export type CollectPayload = Omit<VocabEntry, 'id' | 'createdAt'>

export const useVocabStore = defineStore('vocab', {
  state: () => ({
    entries: loadJson<VocabEntry[]>(STORAGE_KEYS.vocabBook, []),
  }),

  getters: {
    /** Total number of collected entries. */
    count: (state): number => state.entries.length,

    /**
     * Whether a given word is already collected for a document. Used by the
     * 词汇卡 to render 收藏 / 已收藏.
     */
    isCollected:
      (state) =>
      (word: string, fileName: string): boolean =>
        state.entries.some((e) => e.word === word && e.fileName === fileName),

    /**
     * Entries grouped by document title (empty title → "未命名文档"), newest
     * first within each group. Drives the 生词本面板 list.
     */
    grouped: (state): Record<string, VocabEntry[]> => {
      const groups: Record<string, VocabEntry[]> = {}
      for (const e of state.entries) {
        const key = e.documentTitle.trim() || '未命名文档'
        ;(groups[key] ??= []).push(e)
      }
      for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => b.createdAt - a.createdAt)
      }
      return groups
    },
  },

  actions: {
    /**
     * Add a word to the book. Same word in the same document is de-duplicated:
     * we refresh its context / phonetics / timestamp instead of appending a
     * duplicate (spec-vocab-book.md: 同文档内去重).
     */
    collect(payload: CollectPayload): void {
      const existing = this.entries.find(
        (e) => e.word === payload.word && e.fileName === payload.fileName,
      )
      if (existing) {
        existing.context = payload.context
        existing.phonetics = payload.phonetics
        existing.createdAt = Date.now()
        // Reassign so any shallow watchers re-render.
        this.entries = [...this.entries]
        saveJson(STORAGE_KEYS.vocabBook, this.entries)
        return
      }
      const entry: VocabEntry = { id: createId(), createdAt: Date.now(), ...payload }
      this.entries = [...this.entries, entry]
      saveJson(STORAGE_KEYS.vocabBook, this.entries)
    },

    remove(id: string): void {
      this.entries = this.entries.filter((e) => e.id !== id)
      saveJson(STORAGE_KEYS.vocabBook, this.entries)
    },

    /** Toggle a word in/out of the book (词汇卡 收藏 button). */
    toggle(payload: CollectPayload): void {
      if (this.isCollected(payload.word, payload.fileName)) {
        const existing = this.entries.find(
          (e) => e.word === payload.word && e.fileName === payload.fileName,
        )
        if (existing) this.remove(existing.id)
      } else {
        this.collect(payload)
      }
    },
  },
})
