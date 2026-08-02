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
  /** Readable summary of the first (anchor) turn — shown instead of the raw prompt. */
  firstUserSummary: string | null
  /** True while a "clear conversation?" confirmation is pending (story 9). */
  clearRequested: boolean
}

/** Controls the in-flight stream so the user can Stop generation (story 8). */
let activeStream: AbortController | null = null

/**
 * Build the readable first-message summary shown in the panel instead of the
 * raw context-block prompt (spec story 7). Keeps the action label + a short
 * snippet of the Selection so the thread reads like a real product, not a
 * debug view.
 */
function buildUserSummary(
  action: Action,
  selectedText: string,
  title?: string,
): string {
  const clean = selectedText.replace(/\s+/g, ' ').trim()
  const snippet = clean.length > 80 ? `${clean.slice(0, 80)}…` : clean
  const titlePart = title ? `《${title}》中` : ''
  return `已对${titlePart}选中的内容执行「${action.label}」：${snippet}`
}

export const useConversationStore = defineStore('conversation', {
  state: (): ConversationState => ({
    messages: [],
    active: false,
    loading: false,
    error: null,
    currentAction: null,
    firstUserSummary: null,
    clearRequested: false,
  }),

  getters: {
    canFollowUp: (state) => state.active && !state.loading,
    lastUserQuestion: (state) => {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') return state.messages[i].content
      }
      return ''
    },
    /**
     * Messages for display: the FIRST user (anchor) turn is replaced with its
     * readable summary so the thread doesn't dump the raw prompt template
     * (spec story 7). Follow-up user messages stay as typed.
     */
    displayMessages: (state): ChatMessage[] => {
      if (!state.firstUserSummary) return state.messages
      let replaced = false
      return state.messages.map((m) => {
        if (!replaced && m.role === 'user') {
          replaced = true
          return { role: 'user', content: state.firstUserSummary as string }
        }
        return m
      })
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
      // Record the readable summary only for the FIRST (anchor) turn. On
      // re-anchor (an active conversation gets a new Selection appended),
      // `displayMessages` rewrites the first user turn — so the original
      // anchor's summary must be preserved, not overwritten (spec story 7/11).
      if (!this.firstUserSummary) {
        this.firstUserSummary = buildUserSummary(action, selectedText, title)
      }
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
     * from the first turn is resent every call (story 11). The stream is
     * abortable via {@link stop} (story 8).
     */
    async streamInto(toSend: ChatMessage[]): Promise<void> {
      const settings = useSettingsStore()
      this.loading = true
      const assistant: ChatMessage = { role: 'assistant', content: '' }
      this.messages.push(assistant)

      const controller = new AbortController()
      activeStream = controller

      try {
        for await (const token of chatStream(
          toSend,
          settings.endpointSettings,
          { stream: true, signal: controller.signal },
        )) {
          assistant.content += token
        }
      } catch (err) {
        // A Stop-abort is intentional, not an error — leave the partial answer.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message =
          err instanceof LlmError ? err.message : '调用 LLM 时发生未知错误'
        this.error = message
        assistant.content += `\n\n[出错] ${message}`
      } finally {
        if (activeStream === controller) activeStream = null
        this.loading = false
      }
    },

    /** Interrupt an in-progress generation (story 8). */
    stop(): void {
      if (!this.loading) return
      activeStream?.abort()
      activeStream = null
      this.loading = false
    },

    /** Request confirmation before wiping history (story 9, matches delete-custom-action). */
    requestClear(): void {
      this.clearRequested = true
    },
    cancelClear(): void {
      this.clearRequested = false
    },
    /** Actually clear — invoked only after the user confirms. */
    confirmClear(): void {
      this.clearRequested = false
      this.clear()
    },

    clear(): void {
      activeStream?.abort()
      activeStream = null
      this.messages = []
      this.active = false
      this.loading = false
      this.error = null
      this.currentAction = null
      this.firstUserSummary = null
      this.clearRequested = false
    },
  },
})
