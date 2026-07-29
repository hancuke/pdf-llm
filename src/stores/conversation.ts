// Conversation store — an in-memory multi-turn dialogue around one Selection
// (CONTEXT.md: "对话" / "对话历史"). Never persisted (ADR-0004); cleared on
// refresh or when a new Document opens. Each turn sends the FULL message array
// so the first-paragraph Context and entire History are resent every call
// (story 11).

import { defineStore } from 'pinia'
import { buildMessages, PRESET_ACTIONS, type Action } from '../lib/actions'
import { chatStream, LlmError } from '../lib/llm'
import { useSettingsStore } from './settings'
import type { ChatMessage } from '../lib/types'

interface ConversationState {
  messages: ChatMessage[]
  active: boolean
  loading: boolean
  /** Surfaced error (e.g. CORS / provider failure) shown in the panel (story 18). */
  error: string | null
  currentAction: Action | null
}

export const useConversationStore = defineStore('conversation', {
  state: (): ConversationState => ({
    messages: [],
    active: false,
    loading: false,
    error: null,
    currentAction: null,
  }),

  getters: {
    canFollowUp: (state) => state.active && !state.loading,
    lastUserQuestion: (state) => {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') return state.messages[i].content
      }
      return ''
    },
  },

  actions: {
    /** Set the not-configured error and stop. Returns false when blocked. */
    assertConfigured(): boolean {
      const settings = useSettingsStore()
      if (settings.isConfigured) return true
      this.active = true
      this.error = '请先在设置中配置端点与 API 密钥'
      this.loading = false
      return false
    },

    /** Begin a Conversation from an Action + its resolved Context/Selection. */
    async start(
      action: Action,
      contextText: string,
      selectedText: string,
    ): Promise<void> {
      this.currentAction = action
      this.active = true
      if (!this.assertConfigured()) return

      const first = buildMessages({
        action,
        contextText,
        selectedText,
        history: [],
      })
      this.messages = first
      this.error = null
      await this.streamInto(first)
    },

    /** Append a free-text follow-up and stream the next reply (story 10). */
    async followUp(text: string): Promise<void> {
      if (!this.active || this.loading) return
      if (!this.assertConfigured()) return

      const next = buildMessages({
        action: this.currentAction ?? PRESET_ACTIONS[0],
        contextText: '',
        selectedText: '',
        history: this.messages,
        followUpText: text,
      })
      this.messages = next
      this.error = null
      await this.streamInto(next)
    },

    /**
     * Push a placeholder assistant message and stream tokens into it. The API
     * receives `toSend` (the full history, NOT the placeholder) so the Context
     * from the first turn is resent every call (story 11).
     */
    async streamInto(toSend: ChatMessage[]): Promise<void> {
      const settings = useSettingsStore()
      this.loading = true
      const assistant: ChatMessage = { role: 'assistant', content: '' }
      this.messages.push(assistant)

      try {
        for await (const token of chatStream(
          toSend,
          settings.endpointSettings,
          { stream: true },
        )) {
          assistant.content += token
        }
      } catch (err) {
        const message =
          err instanceof LlmError ? err.message : '调用 LLM 时发生未知错误'
        this.error = message
        assistant.content += `\n\n[出错] ${message}`
      } finally {
        this.loading = false
      }
    },

    clear(): void {
      this.messages = []
      this.active = false
      this.loading = false
      this.error = null
      this.currentAction = null
    },
  },
})
