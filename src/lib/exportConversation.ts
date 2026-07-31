// UI action: export the active Conversation as a Markdown file (story 31).
// Kept separate from the store (which must stay DOM-free) and from the pure
// builder in `lib/export.ts`. User-initiated only — nothing is persisted by the
// app (ADR-0004 / ADR-0006).

import { useReaderStore } from '../stores/reader'
import { useConversationStore } from '../stores/conversation'
import { conversationToMarkdown } from './export'

/** Build and trigger a download of the current conversation as .md. */
export function downloadConversationMarkdown(): void {
  const reader = useReaderStore()
  const conversation = useConversationStore()
  if (!conversation.active) return

  const markdown = conversationToMarkdown(
    reader.currentSelection,
    conversation.messages,
  )

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const base = reader.fileName.replace(/\.pdf$/i, '') || 'conversation'
  a.download = `${base}-对话.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
