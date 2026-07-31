// Pure builder that renders a Conversation as Markdown (CONTEXT.md: 对话).
// User-initiated export only (story 31) — respects the no-auto-persist rule
// because nothing is written to storage; the caller decides whether to copy or
// download the returned string.

import type { ChatMessage } from './types'
import type { ExtractedContext } from './types'

function roleLabel(role: ChatMessage['role']): string {
  if (role === 'assistant') return '助手'
  if (role === 'system') return '系统'
  return '我'
}

/**
 * Render a conversation (plus the Selection it started from) as Markdown.
 * Every message is rendered in order; the selection is included as a separate
 * "选中内容" block when available, so the export is a faithful transcript.
 */
export function conversationToMarkdown(
  selection: ExtractedContext | null,
  messages: ChatMessage[],
): string {
  const lines: string[] = ['# PDF-LLM 对话导出', '']

  if (selection && selection.selectedText) {
    lines.push('## 选中内容', '', '> ' + selection.selectedText.replace(/\n/g, '\n> '), '')
  }

  for (const message of messages) {
    lines.push(`## ${roleLabel(message.role)}`, '', message.content.trim(), '')
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
