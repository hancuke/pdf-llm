// Quick Actions and Conversation message assembly (CONTEXT.md: "快捷操作" /
// "自定义动作" / "对话"). Pure, framework-independent (Seam 2 in docs/spec.md).
//
// `buildMessages` encodes the domain rule for multi-turn conversations:
//   - The FIRST turn builds one user message from the Action template, the
//     Context (the enclosing paragraph) and the Selection.
//   - Every FOLLOW-UP appends a new user message (the free-text question).
//   - Because the whole array is returned and sent on every call, the first
//     message — which still carries the Context — is naturally resent each
//     turn (story 11). The Context is never duplicated into follow-ups.

import type { ChatMessage } from './types'

/** A reusable instruction. `builtin` marks the shipped Quick Actions. */
export interface Action {
  id: string
  label: string
  /** Prompt template; may reference {{context}} and {{selection}}. */
  template: string
  builtin: boolean
}

/** Shipped Quick Actions (story 5-7). */
export const PRESET_ACTIONS: Action[] = [
  {
    id: 'explain',
    label: '解释选中内容',
    template:
      '请结合上下文解释下面这段选中内容，用简洁的中文说明它的含义。\n\n上下文：\n{{context}}\n\n选中内容：\n{{selection}}',
    builtin: true,
  },
  {
    id: 'translate',
    label: '翻译选中内容',
    template:
      '请翻译下面的选中内容。若原文为中文则译为英文，若原文为英文则译为中文。\n\n上下文：\n{{context}}\n\n选中内容：\n{{selection}}',
    builtin: true,
  },
  {
    id: 'summarize',
    label: '总结',
    template:
      '请总结下面的选中内容，保留关键信息。\n\n上下文：\n{{context}}\n\n选中内容：\n{{selection}}',
    builtin: true,
  },
  {
    id: 'rephrase',
    label: '换种说法',
    template:
      '请用另一种说法重写下面的选中内容，保持原意不变。\n\n上下文：\n{{context}}\n\n选中内容：\n{{selection}}',
    builtin: true,
  },
]

/** Variables available to an Action template. */
export interface TemplateVariables {
  context: string
  selection: string
}

/**
 * Interpolate `{{key}}` placeholders in a template with the given variables.
 * Unknown placeholders are left untouched so a template can reference future
 * variables without breaking.
 */
export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (key in variables) {
      return (variables as unknown as Record<string, string>)[key]
    }
    return match
  })
}

/** Inputs to {@link buildMessages}. */
export interface BuildMessagesInput {
  /** The Action whose template should drive the first turn. */
  action: Action
  /** The Context (enclosing paragraph or sentence fallback). */
  contextText: string
  /** The exact Selection text. */
  selectedText: string
  /**
   * Conversation History so far. Empty on the first turn. On follow-ups it
   * already contains the first (context-bearing) user message and any
   * assistant replies.
   */
  history: ChatMessage[]
  /**
   * The free-text follow-up question. Required (and only used) when `history`
   * is non-empty, i.e. for follow-up turns.
   */
  followUpText?: string
}

/**
 * Assemble the OpenAI-compatible `messages[]` for a single LLM call.
 *
 * Returns the FULL array to be sent — first turn seeds it with the
 * context-bearing user message; follow-ups append a new user message without
 * re-adding the Context.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const { action, contextText, selectedText, history, followUpText } = input

  if (history.length === 0) {
    const content = renderTemplate(action.template, {
      context: contextText,
      selection: selectedText,
    })
    return [{ role: 'user', content }]
  }

  // Follow-up: append the new question, preserving the existing history
  // (which already carries the Context in its first user message).
  const content = followUpText ?? ''
  return [...history, { role: 'user', content }]
}
