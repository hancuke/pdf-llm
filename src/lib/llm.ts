// LLM client — OpenAI-compatible chat/completions (ADR-0003). Pure and
// framework-independent (Seam 3 in docs/spec.md). Talks directly browser →
// provider using the user's own key; no self-owned backend (ADR-0001).
//
// `fetch` is injected so this can be integration-tested against a stub
// endpoint without a network (explicit dependency, testable in Node).

import type { ChatMessage, EndpointSettings } from './types'

/** Error surfaced when an LLM call fails (network / CORS / HTTP / parse). */
export class LlmError extends Error {
  /** HTTP status when the request reached the server but was not 2xx. */
  readonly status?: number
  /** Original cause (e.g. the underlying network/CORS error). */
  readonly cause?: unknown

  constructor(message: string, status?: number, cause?: unknown) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.cause = cause
  }
}

/** Options controlling a single chat call. */
export interface ChatOptions {
  /** Abort the in-flight request. */
  signal?: AbortSignal
  /** Enable Server-Sent-Events streaming (progressive responses, story 20). */
  stream?: boolean
  /** Receives each streamed token; only used when `stream` is true. */
  onToken?: (token: string) => void
}

/** Build the chat/completions URL from a possibly-trailing-slash base URL. */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return `${trimmed}/chat/completions`
}

type Fetcher = typeof fetch

function buildHeaders(settings: EndpointSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  }
}

/**
 * Open the chat/completions request and return the raw Response. Propagates
 * network / CORS failures and non-2xx statuses as {@link LlmError}. Shared by
 * the streaming and non-streaming call paths so they don't duplicate the
 * request / error handling.
 */
async function openChatRequest(
  messages: ChatMessage[],
  settings: EndpointSettings,
  stream: boolean,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<Response> {
  const url = buildChatCompletionsUrl(settings.baseUrl)
  const body = { model: settings.model, messages, stream }

  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: buildHeaders(settings),
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // Network / CORS failure — propagate so the UI can surface it.
    throw new LlmError(
      '无法连接到 LLM 端点（可能是网络不通或缺少 CORS 支持）',
      undefined,
      err,
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new LlmError(
      `LLM 端点返回错误：${response.status} ${detail.slice(0, 200)}`,
      response.status,
    )
  }
  return response
}

/**
 * Perform a non-streaming chat completion. Returns the assistant's text
 * content. Any failure (network, CORS, non-2xx, parse error) is propagated as
 * an {@link LlmError} rather than swallowed (story 18).
 */
export async function chat(
  messages: ChatMessage[],
  settings: EndpointSettings,
  options: ChatOptions = {},
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await openChatRequest(
    messages,
    settings,
    false,
    fetcher,
    options.signal,
  )

  const data = (await response.json().catch((err) => {
    throw new LlmError('无法解析 LLM 响应', undefined, err)
  })) as {
    choices?: { message?: { content?: string } }[]
  }

  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Perform a streaming chat completion, yielding assistant tokens as they
 * arrive (story 20). Throws {@link LlmError} on connection or HTTP failure,
 * and on a malformed stream line (the partial line is skipped, not fatal).
 */
/**
 * Lightweight connectivity/key check for the user's configured endpoint.
 * Tries `GET {baseUrl}/models` first (no model required); if that endpoint is
 * unsupported it falls back to a minimal `chat/completions` POST. Returns a
 * friendly, localized result the UI can render inline — no thrown errors.
 */
export async function testEndpoint(
  settings: EndpointSettings,
  fetcher: Fetcher = fetch,
  timeoutMs = 10000,
): Promise<{ ok: boolean; message: string }> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const mapNetworkError = (err: unknown): { ok: boolean; message: string } => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: '连接超时，请检查网络或端点地址。' }
    }
    return {
      ok: false,
      message: '无法连接到端点（网络不通，或端点缺少 CORS 支持）。',
    }
  }

  const tryChat = async (): Promise<{ ok: boolean; message: string }> => {
    const url = `${base}/chat/completions`
    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: buildHeaders(settings),
        body: JSON.stringify({
          model: settings.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (res.ok) return { ok: true, message: '连接成功，密钥有效。' }
      if (res.status === 401 || res.status === 403)
        return { ok: false, message: '密钥无效（401），请检查 API 密钥。' }
      if (res.status === 404)
        return {
          ok: false,
          message: '端点返回 404，请确认 Base URL 是否包含 /v1 等路径。',
        }
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        message: `端点返回错误 ${res.status}：${detail.slice(0, 160)}`,
      }
    } catch (err) {
      return mapNetworkError(err)
    }
  }

  try {
    const modelsRes = await fetcher(`${base}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: controller.signal,
    })
    if (modelsRes.ok) return { ok: true, message: '连接成功，密钥有效。' }
    if (modelsRes.status === 401 || modelsRes.status === 403)
      return { ok: false, message: '密钥无效（401），请检查 API 密钥。' }
    // /models unsupported (e.g. 404) — fall back to a real completion call.
    return await tryChat()
  } catch {
    // Network/CORS on the models probe — still try the completion path.
    return await tryChat()
  } finally {
    clearTimeout(timer)
  }
}

export async function* chatStream(
  messages: ChatMessage[],
  settings: EndpointSettings,
  options: ChatOptions = {},
  fetcher: Fetcher = fetch,
): AsyncGenerator<string> {
  const response = await openChatRequest(
    messages,
    settings,
    true,
    fetcher,
    options.signal,
  )

  const reader = response.body?.getReader()
  if (!reader) {
    throw new LlmError('LLM 端点未返回数据流')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
          }
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            options.onToken?.(token)
            yield token
          }
        } catch {
          // Skip a malformed SSE line rather than aborting the whole stream.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
