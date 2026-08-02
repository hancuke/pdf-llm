// Seam 1 unit tests for the conversation store.
// Covers spec story 7 (first message shown as a readable summary, not the raw
// prompt), story 8 (Stop interrupts the in-flight stream), and story 9 (clear
// confirmation flow). The LLM client is mocked so tests stay offline + fast.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the LLM client entirely — we only exercise store orchestration.
vi.mock('../lib/llm', () => {
  return {
    chatStream: vi.fn(),
    LlmError: class LlmError extends Error {},
    testEndpoint: vi.fn(),
  }
})

import { useConversationStore } from './conversation'
import { useSettingsStore } from './settings'
import { PRESET_ACTIONS } from '../lib/actions'
import { chatStream } from '../lib/llm'

const action = PRESET_ACTIONS[0]

async function* fastStream() {
  yield '回'
  yield '答'
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(chatStream).mockImplementation(fastStream)
  const settings = useSettingsStore()
  // configure so start() is allowed to stream
  settings.endpoint = 'https://api.example.com'
  settings.apiKey = 'test-key'
  settings.model = 'test-model'
})

describe('conversation store — first message summary (story 7)', () => {
  it('replaces the first user turn with a readable summary in displayMessages', async () => {
    const conv = useConversationStore()
    await conv.start(action, '上下文内容', '选中的文本片段', '示例文档')

    // summary is recorded and references the action + a snippet of the selection
    expect(conv.firstUserSummary).toContain(action.label)
    expect(conv.firstUserSummary).toContain('选中的文本片段')

    // displayMessages shows the summary, not the raw prompt, as the first user turn
    const displayed = conv.displayMessages
    expect(displayed[0].role).toBe('user')
    expect(displayed[0].content).toBe(conv.firstUserSummary)
    expect(displayed[0].content).not.toContain('上下文内容')
  })

  it('keeps follow-up user messages as typed (only the anchor turn is summarized)', async () => {
    const conv = useConversationStore()
    await conv.start(action, 'ctx', '选中', '标题')

    conv.messages.push({ role: 'user', content: '后续追问' })
    const displayed = conv.displayMessages

    expect(displayed[0].content).toBe(conv.firstUserSummary)
    expect(displayed.find((m) => m.role === 'user' && m.content === '后续追问')).toBeTruthy()
  })

  it('keeps the original anchor summary on re-anchor (story 7/11)', async () => {
    const conv = useConversationStore()
    await conv.start(action, 'ctx1', '原文A', '标题')
    const original = conv.firstUserSummary as string
    expect(original).toContain('原文A')

    // re-anchor with a different selection — the first anchor must keep its summary
    await conv.start(action, 'ctx2', '新文B', '标题')

    expect(conv.firstUserSummary).toBe(original)
    expect(conv.firstUserSummary).toContain('原文A')
    expect(conv.displayMessages[0].content).toBe(original)
  })
})

describe('conversation store — Stop control (story 8)', () => {
  it('is a no-op when nothing is loading', () => {
    const conv = useConversationStore()
    conv.loading = false
    conv.stop()
    expect(conv.loading).toBe(false)
  })

  it('interrupts an in-flight stream and stops loading', async () => {
    // a stream that only ends once its signal is aborted
    vi.mocked(chatStream).mockImplementation(
      async function* (_toSend: unknown, _settings: unknown, opts?: { signal?: AbortSignal }) {
        const signal = opts?.signal
        while (signal && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 5))
        }
      },
    )

    const conv = useConversationStore()
    const pending = conv.start(action, 'ctx', '选中', '标题')

    // synchronous portion of start() has begun streaming
    expect(conv.loading).toBe(true)

    conv.stop()
    await pending

    expect(conv.loading).toBe(false)
  })
})

describe('conversation store — clear confirmation (story 9)', () => {
  it('requests, cancels, then confirms clearing history', async () => {
    const conv = useConversationStore()
    await conv.start(action, 'ctx', '选中', '标题')
    conv.messages.push({ role: 'user', content: '追问' })
    expect(conv.messages.length).toBeGreaterThan(0)
    expect(conv.active).toBe(true)

    // request confirmation
    conv.requestClear()
    expect(conv.clearRequested).toBe(true)

    // cancel keeps history intact
    conv.cancelClear()
    expect(conv.clearRequested).toBe(false)
    expect(conv.messages.length).toBeGreaterThan(0)

    // confirm wipes everything
    conv.confirmClear()
    expect(conv.clearRequested).toBe(false)
    expect(conv.messages).toHaveLength(0)
    expect(conv.active).toBe(false)
    expect(conv.firstUserSummary).toBeNull()
    expect(conv.loading).toBe(false)
  })
})
