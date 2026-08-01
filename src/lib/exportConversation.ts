// UI action: export the active Conversation as a Markdown file (story 31).
// Kept separate from the store (which must stay DOM-free) and from the pure
// builder in `lib/export.ts`. User-initiated only — nothing is persisted by the
// app (ADR-0004 / ADR-0006).

import { useReaderStore } from '../stores/reader'
import { useConversationStore } from '../stores/conversation'
import { conversationToMarkdown } from './export'
import { downloadBlob } from './download'

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
  const base = reader.fileName.replace(/\.pdf$/i, '') || 'conversation'
  downloadBlob(blob, `${base}-对话.md`)
}
