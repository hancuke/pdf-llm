import { describe, it, expect } from 'vitest'
import {
  buildMessages,
  buildSystemPrompt,
  renderTemplate,
  assembleContextBlock,
  PRESET_ACTIONS,
  type Action,
} from './actions'
import type { ChatMessage } from './types'

const explain = PRESET_ACTIONS.find((a) => a.id === 'explain')!
const context = 'Para one about cats.\nPara one continues.'
const selection = 'cats'

describe('renderTemplate', () => {
  it('interpolates context, selection, title and block placeholders', () => {
    const out = renderTemplate('ctx={{context}} sel={{selection}} title={{title}} block={{block}}', {
      context,
      selection,
      title: 'T',
      block: 'BLOCK',
    })
    expect(out).toBe(`ctx=${context} sel=${selection} title=T block=BLOCK`)
  })

  it('leaves unknown placeholders untouched', () => {
    const out = renderTemplate('keep {{unknown}} {{context}}', {
      context,
      selection,
      title: '',
      block: '',
    })
    expect(out).toBe(`keep {{unknown}} ${context}`)
  })
})

describe('buildSystemPrompt', () => {
  it('always enforces selection-focused clarification', () => {
    expect(buildSystemPrompt('default')).toContain('聚焦解释')
    expect(buildSystemPrompt('default')).toContain('仅基于你给出的文本')
  })
  it('appends style-specific phrasing', () => {
    expect(buildSystemPrompt('plain')).toContain('大白话')
    expect(buildSystemPrompt('eli5')).toContain('小学生')
  })
})

describe('assembleContextBlock', () => {
  it('includes the title line when present', () => {
    const block = assembleContextBlock('Attention Is All You Need', context, selection)
    expect(block).toContain('文档：Attention Is All You Need')
    expect(block).toContain('上下文：')
    expect(block).toContain('选中内容：')
  })
  it('omits the title line when empty', () => {
    expect(assembleContextBlock('', context, selection)).not.toContain('文档：')
  })
})

describe('buildMessages', () => {
  it('first turn: system prompt + user message with context + selection', () => {
    const messages = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      style: 'default',
      history: [],
    })
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('聚焦解释')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain(context)
    expect(messages[1].content).toContain(selection)
    expect(messages[1].content).toContain('上下文：')
  })

  it('first turn embeds the clean title when provided', () => {
    const messages = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      title: 'Attention Is All You Need',
      style: 'default',
      history: [],
    })
    expect(messages[1].content).toContain('文档：Attention Is All You Need')
  })

  it('first turn reflects the explanation style in the system prompt', () => {
    const messages = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      style: 'eli5',
      history: [],
    })
    expect(messages[0].content).toContain('小学生')
  })

  it('follow-up: prepends a fresh system prompt, appends only the question', () => {
    const first = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      style: 'default',
      history: [],
    })
    // The store keeps only the system-free turns.
    const history: ChatMessage[] = [
      ...first.slice(1),
      { role: 'assistant', content: 'A cat is a small domesticated animal.' },
    ]

    const followUp = buildMessages({
      action: explain,
      contextText: '',
      selectedText: '',
      style: 'default',
      history,
      followUpText: '用一句话再说明它的起源？',
    })

    expect(followUp[0].role).toBe('system')
    // system + prior (user+assistant) + new user question
    expect(followUp).toHaveLength(history.length + 2)
    // index 1 = original anchor user, index 2 = prior assistant reply.
    expect(followUp[2].content).toBe('A cat is a small domesticated animal.')
    const lastFollowUp = followUp[followUp.length - 1]
    expect(lastFollowUp.role).toBe('user')
    expect(lastFollowUp.content).toBe('用一句话再说明它的起源？')
    expect(lastFollowUp.content).not.toContain(context)
  })

  it('re-anchor: a new selection merges into the same thread preserving history', () => {
    const first = buildMessages({
      action: explain,
      contextText: context,
      selectedText: selection,
      style: 'default',
      history: [],
    })
    const history = first.slice(1) // [user]

    const reanchor = buildMessages({
      action: explain,
      contextText: 'Totally different paragraph about dogs.',
      selectedText: 'dogs',
      style: 'default',
      history,
    })

    expect(reanchor[0].role).toBe('system')
    expect(reanchor).toHaveLength(history.length + 2)
    // The latest user turn carries the new selection's context, not the old.
    const lastReanchor = reanchor[reanchor.length - 1]
    expect(lastReanchor.content).toContain('Totally different paragraph about dogs.')
    expect(lastReanchor.content).not.toContain('cats')
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
      style: 'default',
      history: [],
    })
    // messages[0] is the system prompt; the user message is messages[1].
    expect(messages[1].content).toBe(
      `像给五岁小孩解释一样：${selection}（背景：${context}）`,
    )
  })
})
