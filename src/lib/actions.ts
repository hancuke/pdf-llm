// Quick Actions and Conversation message assembly (CONTEXT.md: "快捷操作" /
// "自定义动作" / "对话" / "选中聚焦澄清" / "讲解风格"). Pure, framework-independent
// (Seam 2 in docs/spec.md).
//
// Phase 3 redesign (ADR-0007): the LLM's role is "Selection-Focused
// Clarification" — it explains ONLY the user's Selection, but may draw on its
// latent knowledge of the document (it likely saw the public PDF in training)
// and general knowledge. Every call prepends a system prompt that enforces this
// and requires an uncertainty disclaimer when the model goes beyond the given
// text. The context recipe is `clean title + enclosing paragraph + selection`.

import type { ChatMessage, ExplanationStyle } from './types'

/** A reusable instruction. `builtin` marks the shipped Quick Actions. */
export interface Action {
  id: string
  label: string
  /** Prompt template; may reference {{context}} / {{selection}} / {{title}} / {{block}}. */
  template: string
  builtin: boolean
}

// --- System prompt: Selection-Focused Clarification -------------------------

/**
 * The base system prompt enforcing the "选中聚焦澄清" contract (ADR-0007): stay
 * focused on the Selection, may use latent document knowledge + general
 * knowledge, and must disclose when it goes beyond the provided text.
 */
const SYSTEM_PROMPT_BASE =
  '你是一个帮助读者理解 PDF 选中内容的助手。请始终聚焦解释用户选中的内容本身；' +
  '可以结合你对这篇文档潜在的已有认知（你很可能训练时见过它）以及通用知识' +
  '（类比、举例、关联）来辅助说明，但不得离题扩写，也不要复述整篇文档。' +
  '优先基于给出的“上下文”与“选中内容”进行解释。' +
  '若你不确定是否见过全文，或需要超出所给文本做推断，请明确声明“以下仅基于你给出的文本”。'

/**
 * Single source of truth for explanation styles: the UI label (SettingsPanel)
 * and the system-prompt phrasing (buildSystemPrompt) both derive from here, so
 * adding a style touches one place (CONTEXT.md: "讲解风格").
 */
export const EXPLANATION_STYLES: Record<
  ExplanationStyle,
  { label: string; phrasing: string }
> = {
  default: { label: '默认', phrasing: '' },
  plain: {
    label: '通俗大白话',
    phrasing: '\n请用通俗、大白话的方式表达，尽量少用专业术语；必要时用生活化的比喻。',
  },
  eli5: {
    label: '小学生级',
    phrasing:
      '\n请假设读者是小学生，用最简单的生活例子和比喻来解释，避免任何专业术语和复杂概念。',
  },
}

/** Build the system prompt for the given explanation style. */
export function buildSystemPrompt(style: ExplanationStyle): string {
  return SYSTEM_PROMPT_BASE + (EXPLANATION_STYLES[style]?.phrasing ?? '')
}

// --- Shipped Quick Actions (story 32-38) ------------------------------------

export const PRESET_ACTIONS: Action[] = [
  {
    id: 'explain',
    label: '解释选中内容',
    template:
      '请聚焦解释下面选中的内容，帮助我真正理解它。可以结合你对这篇文档潜在的已有认知以及通用知识来补充背景、举例或类比，但请始终围绕选中内容，不要离题去复述整篇文档。\n\n{{block}}',
    builtin: true,
  },
  {
    id: 'translate',
    label: '翻译选中内容',
    template:
      '请翻译下面的选中内容。若原文为中文则译为英文，若原文为英文则译为中文。\n\n{{block}}',
    builtin: true,
  },
  {
    id: 'summarize',
    label: '总结',
    template: '请总结下面的选中内容，保留关键信息与要点。\n\n{{block}}',
    builtin: true,
  },
]

/** Variables available to an Action template. */
export interface TemplateVariables {
  context: string
  selection: string
  /** Clean title extracted from PDF metadata / first page (may be empty). */
  title: string
  /** Fully assembled "文档 / 上下文 / 选中内容" block. */
  block: string
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

/**
 * Assemble the "文档 / 上下文 / 选中内容" block sent as the user message body.
 * The title line is omitted when empty (the raw filename is never shown).
 */
export function assembleContextBlock(
  title: string,
  context: string,
  selection: string,
): string {
  const lines: string[] = []
  const cleanTitle = title.trim()
  if (cleanTitle) lines.push(`文档：${cleanTitle}`)
  lines.push('上下文：', context.trim(), '', '选中内容：', selection.trim())
  return lines.join('\n')
}

/** Inputs to {@link buildMessages}. */
export interface BuildMessagesInput {
  /**
   * The Action whose template drives an anchor (first) turn. Required — both
   * callers pass the current action; for follow-ups it is retained for parity
   * though the template is not re-rendered.
   */
  action: Action
  /** The Context (enclosing paragraph or sentence fallback). */
  contextText: string
  /** The exact Selection text. */
  selectedText: string
  /** Clean title from PDF metadata / first page. */
  title?: string
  /** Global explanation style (CONTEXT.md: "讲解风格"). */
  style: ExplanationStyle
  /**
   * Conversation History so far (user/assistant turns only — no system
   * message). On the first turn this is empty.
   */
  history: ChatMessage[]
  /**
   * The free-text follow-up question. When present the turn is a follow-up
   * (plain text, no context block re-added); otherwise it is an anchor turn
   * driven by `action` + context + selection.
   */
  followUpText?: string
}

/**
 * Assemble the OpenAI-compatible `messages[]` for a single LLM call.
 *
 * Returns the FULL array to send — a system prompt followed by the history and
 * the new user message. Because the whole array is returned and sent on every
 * call, the system prompt and prior context-bearing turns are naturally resent
 * (story 11); the store keeps only the user/assistant turns and prepends a
 * fresh system prompt each call, so re-anchoring on a new Selection simply
 * appends a new context-bearing user message while history is preserved.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const { action, contextText, selectedText, title, style, history, followUpText } =
    input

  const systemPrompt = buildSystemPrompt(style)

  if (followUpText !== undefined) {
    return [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: followUpText },
    ]
  }

  const block = assembleContextBlock(title ?? '', contextText, selectedText)
  const content = renderTemplate(action.template, {
    context: contextText,
    selection: selectedText,
    title: title ?? '',
    block,
  })

  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content },
  ]
}
