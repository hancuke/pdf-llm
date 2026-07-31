// Conversation store — an in-memory multi-turn dialogue around one or more
// Selections (CONTEXT.md: "对话" / "对话历史"). Never persisted (ADR-0004);
// cleared on refresh or when a new Document opens. Each turn sends the FULL
// message array (system prompt + history + new user message) so the Context and
// entire History are resent every call (story 11 — its "always resend the first
// paragraph" phrasing is superseded by Phase 3 re-anchoring, but the resend
// mechanism is unchanged). A new Selection while a Conversation is active
// re-anchors it (appends a fresh context-bearing user message, preserving
// history — Phase 3 option 2). The system prompt lives only in the sent array,
// never in `messages`.

import { defineStore } from 'pinia'
import { buildMessages, PRESET_ACTIONS, type Action } from '../lib/actions'
import { chatStream, LlmError } from '../lib/llm'
import { useSettingsStore } from './settings'
import type { ChatMessage } from '../lib/types'

/**
 * `buildMessages` returns `[system, ...turns]`; the stored conversation holds
 * only the user/assistant turns (the system prompt is re-prepended per call).
 */
function conversationTurns(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(1)
}

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

    /**
     * Begin (or re-anchor) a Conversation from an Action + its resolved
     * Context/Selection. When a Conversation is already active, the new
     * Selection is merged into the same thread: the context-bearing user
     * message is appended and history is preserved (Phase 3, option 2). The
     * system prompt is kept out of stored `messages` and re-prepended per call.
     */
    async start(
      action: Action,
      contextText: string,
      selectedText: string,
      title?: string,
    ): Promise<void> {
      this.currentAction = action
      this.active = true
      if (!this.assertConfigured()) return

      const settings = useSettingsStore()
      const toSend = buildMessages({
        action,
        contextText,
        selectedText,
        title,
        style: settings.explanationStyle,
        history: this.messages,
      })
      this.messages = conversationTurns(toSend)
      this.error = null
      await this.streamInto(toSend)
    },

    /** Append a free-text follow-up and stream the next reply (story 10). */
    async followUp(text: string): Promise<void> {
      if (!this.active || this.loading) return
      if (!this.assertConfigured()) return

      const settings = useSettingsStore()
      const next = buildMessages({
        action: this.currentAction ?? PRESET_ACTIONS[0],
        contextText: '',
        selectedText: '',
        style: settings.explanationStyle,
        history: this.messages,
        followUpText: text,
      })
      this.messages = conversationTurns(next)
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
