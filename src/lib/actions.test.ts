import { describe, it, expect } from 'vitest'
import {
  buildMessages,
  renderTemplate,
  PRESET_ACTIONS,
  type Action,
} from './actions'
import type { ChatMessage } from './types'

const explain = PRESET_ACTIONS.find((a) => a.id === 'explain')!
const context = 'Para one about cats.\nPara one continues.'
const selection = 'cats'

describe('renderTemplate', () => {
  it('interpolates context and selection placeholders', () => {
    const out = renderTemplate('ctx={{context}} sel={{selection}}', {
      context,
      selection,
    })
    expect(out).toBe(`ctx=${context} sel=${selection}`)
  })

  it('leaves unknown placeholders untouched', () => {
    const out = renderTemplate('keep {{unknown}} {{context}}', {
      context,
      selection,
    })
    expect(out).toBe(`keep {{unknown}} ${context}`)
  })
})

describe('buildMessages', () => {
  it('first turn: single user message with template + context + selection', () => {
    const messages = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      history: [],
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    // The assembled content must contain the action template text plus the
    // resolved context and selection.
    expect(messages[0].content).toContain('请结合上下文解释')
    expect(messages[0].content).toContain(context)
    expect(messages[0].content).toContain(selection)
  })

  it('follow-up: appends a new user message without duplicating context', () => {
    const first = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      history: [],
    })
    const history: ChatMessage[] = [
      ...first,
      { role: 'assistant', content: 'A cat is a small domesticated animal.' },
    ]

    const followUp = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      history,
      followUpText: '用一句话再说明它的起源？',
    })

    expect(followUp).toHaveLength(3)
    // The original context-bearing message is preserved verbatim.
    expect(followUp[0]).toEqual(first[0])
    expect(followUp[1].role).toBe('assistant')
    // The new user message carries only the follow-up question.
    expect(followUp[2].role).toBe('user')
    expect(followUp[2].content).toBe('用一句话再说明它的起源？')
    expect(followUp[2].content).not.toContain(context)
  })

  it('history length grows by exactly one per turn', () => {
    const first = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      history: [],
    })
    expect(first).toHaveLength(1)

    const afterFirst: ChatMessage[] = [
      ...first,
      { role: 'assistant', content: 'reply' },
    ]
    const second = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      history: afterFirst,
      followUpText: 'more?',
    })
    expect(second).toHaveLength(afterFirst.length + 1)
  })

  it('interpolates a custom action template correctly', () => {
    const custom: Action = {
      id: 'eli5',
      label: 'Explain like I’m five',
      template: '像给五岁小孩解释一样：{{selection}}（背景：{{context}}）',
      builtin: false,
    }
    const messages = buildMessages({
      action: custom,
      contextText: context,
      selectedText: selection,
      history: [],
    })
    expect(messages[0].content).toBe(
      `像给五岁小孩解释一样：${selection}（背景：${context}）`,
    )
  })
})
