import { describe, it, expect } from 'vitest'
import { conversationToMarkdown } from './export'
import type { ChatMessage, ExtractedContext } from './types'

const selection: ExtractedContext = {
  selectedText: '量子纠缠是一种关联',
  contextText: '量子纠缠是一种关联，两个粒子状态相连。',
}

const messages: ChatMessage[] = [
  { role: 'user', content: '解释选中内容' },
  { role: 'assistant', content: '它描述两个粒子的非局域关联。' },
  { role: 'user', content: '能举个例子吗？' },
  { role: 'assistant', content: '比如硬币同时正反。' },
]

describe('conversationToMarkdown', () => {
  it('includes the selection block and every message as a faithful transcript', () => {
    const md = conversationToMarkdown(selection, messages)
    expect(md).toContain('# PDF-LLM 对话导出')
    expect(md).toContain('量子纠缠是一种关联')
    expect(md).toContain('## 助手')
    expect(md).toContain('非局域关联')
    expect(md).toContain('## 我')
    expect(md).toContain('解释选中内容')
    expect(md).toContain('能举个例子吗')
  })

  it('omits the selection block when none is provided but still exports the transcript', () => {
    const md = conversationToMarkdown(null, messages)
    expect(md).not.toContain('## 选中内容')
    expect(md).toContain('非局域关联')
    expect(md).toContain('解释选中内容')
  })
})
