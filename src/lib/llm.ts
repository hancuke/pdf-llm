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
