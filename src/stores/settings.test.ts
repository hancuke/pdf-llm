// Seam 1 unit tests for the settings store.
// Covers spec story 18 (endpoint test states: idle → loading → ok/fail),
// ADR-0013 (the external-request disclosure toggle), and the Custom Action
// CRUD that backs the draft-preserving settings panel. LLM probe is mocked.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../lib/llm', () => {
  return {
    chatStream: vi.fn(),
    LlmError: class LlmError extends Error {},
    testEndpoint: vi.fn(),
  }
})

import { useSettingsStore } from './settings'
import { testEndpoint } from '../lib/llm'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(testEndpoint).mockReset()
})

describe('settings store — external request disclosure (ADR-0013)', () => {
  it('defaults to enabled and toggles off', () => {
    const settings = useSettingsStore()
    expect(settings.externalRequestsEnabled).toBe(true)

    settings.setExternalRequestsEnabled(false)
    expect(settings.externalRequestsEnabled).toBe(false)

    settings.setExternalRequestsEnabled(true)
    expect(settings.externalRequestsEnabled).toBe(true)
  })
})

describe('settings store — endpoint test states (story 18)', () => {
  it('reports failure when endpoint/key/model are missing', async () => {
    const settings = useSettingsStore()
    settings.endpoint = ''
    settings.apiKey = ''
    settings.model = ''

    await settings.runEndpointTest()

    expect(settings.endpointTestStatus).toBe('fail')
    expect(settings.endpointTestMessage).toContain('端点')
    // probe must not even be attempted
    expect(testEndpoint).not.toHaveBeenCalled()
  })

  it('probes and reflects an OK result', async () => {
    const settings = useSettingsStore()
    settings.endpoint = 'https://api.example.com'
    settings.apiKey = 'k'
    settings.model = 'm'
    vi.mocked(testEndpoint).mockResolvedValue({ ok: true, message: '连接成功' })

    await settings.runEndpointTest()

    expect(settings.endpointTestStatus).toBe('ok')
    expect(settings.endpointTestMessage).toBe('连接成功')
  })

  it('probes and reflects a FAIL result', async () => {
    const settings = useSettingsStore()
    settings.endpoint = 'https://api.example.com'
    settings.apiKey = 'k'
    settings.model = 'm'
    vi.mocked(testEndpoint).mockResolvedValue({ ok: false, message: '401 未授权' })

    await settings.runEndpointTest()

    expect(settings.endpointTestStatus).toBe('fail')
    expect(settings.endpointTestMessage).toBe('401 未授权')
  })

  it('reports an unknown error when the probe throws', async () => {
    const settings = useSettingsStore()
    settings.endpoint = 'https://api.example.com'
    settings.apiKey = 'k'
    settings.model = 'm'
    vi.mocked(testEndpoint).mockRejectedValue(new Error('network down'))

    await settings.runEndpointTest()

    expect(settings.endpointTestStatus).toBe('fail')
    expect(settings.endpointTestMessage).toContain('未知错误')
  })

  it('probes the draft override rather than the saved values (story 18)', async () => {
    const settings = useSettingsStore()
    // saved values are empty, but the panel passes an in-progress draft
    settings.endpoint = ''
    settings.apiKey = ''
    settings.model = ''
    vi.mocked(testEndpoint).mockResolvedValue({ ok: true, message: '草稿连接成功' })

    await settings.runEndpointTest({
      endpoint: 'https://draft.example.com',
      apiKey: 'dk',
      model: 'dm',
    })

    expect(settings.endpointTestStatus).toBe('ok')
    expect(settings.endpointTestMessage).toBe('草稿连接成功')
    expect(testEndpoint).toHaveBeenCalledWith({
      baseUrl: 'https://draft.example.com',
      apiKey: 'dk',
      model: 'dm',
    })
  })
})

describe('settings store — custom actions CRUD', () => {
  it('adds a custom action and persists it in allActions', () => {
    const settings = useSettingsStore()
    const before = settings.customActions.length

    const created = settings.addCustomAction('提炼要点', '请提炼：{{selection}}')
    expect(settings.customActions.length).toBe(before + 1)
    expect(created.label).toBe('提炼要点')
    expect(settings.allActions.some((a) => a.id === created.id)).toBe(true)
  })

  it('updates and removes a custom action', () => {
    const settings = useSettingsStore()
    const created = settings.addCustomAction('标签', '模板')
    settings.updateCustomAction(created.id, { label: '新标签' })
    expect(settings.customActionById(created.id)?.label).toBe('新标签')

    settings.removeCustomAction(created.id)
    expect(settings.customActionById(created.id)).toBeUndefined()
  })
})
