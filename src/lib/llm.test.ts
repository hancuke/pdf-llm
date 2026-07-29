import { describe, it, expect } from 'vitest'
import { chat, chatStream, LlmError, buildChatCompletionsUrl } from './llm'
import type { ChatMessage, EndpointSettings } from './types'

const settings: EndpointSettings = {
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test-123',
  model: 'gpt-4o-mini',
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }]

/** Stub fetch shape compatible with the injected `Fetcher`. */
type TestFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

/** A stub fetch returning a non-streaming JSON body. */
function jsonFetcher(body: unknown, status = 200): TestFetcher {
  return async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response
  }
}

describe('buildChatCompletionsUrl', () => {
  it('strips trailing slashes and appends the path', () => {
    expect(buildChatCompletionsUrl('https://x.com/v1/')).toBe(
      'https://x.com/v1/chat/completions',
    )
    expect(buildChatCompletionsUrl('https://x.com/v1')).toBe(
      'https://x.com/v1/chat/completions',
    )
  })
})

describe('chat (non-streaming)', () => {
  it('sends Authorization: Bearer <apiKey>, model and messages in the body', async () => {
    let capturedUrl: string | undefined
    let capturedAuth: string | undefined
    let capturedBody: any

    const fetcher: TestFetcher = async (url, init) => {
      capturedUrl = url.toString()
      capturedAuth = (
        (init as RequestInit).headers as unknown as Record<string, string>
      )['Authorization']
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'hi there' } }] }),
        { status: 200 },
      ) as unknown as Response
    }

    const content = await chat(messages, settings, {}, fetcher)
    expect(content).toBe('hi there')
    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions')
    expect(capturedAuth).toBe('Bearer sk-test-123')
    expect(capturedBody.model).toBe('gpt-4o-mini')
    expect(capturedBody.messages).toEqual(messages)
    expect(capturedBody.stream).toBe(false)
  })

  it('parses the assistant content from a real-shaped response', async () => {
    const body = {
      id: 'x',
      choices: [{ index: 0, message: { role: 'assistant', content: '答：猫' }, finish_reason: 'stop' }],
    }
    const content = await chat(messages, settings, {}, jsonFetcher(body))
    expect(content).toBe('答：猫')
  })

  it('returns empty string when the response has no content', async () => {
    const content = await chat(messages, settings, {}, jsonFetcher({ choices: [{}] }))
    expect(content).toBe('')
  })

  it('propagates network / CORS failures instead of swallowing them', async () => {
    const fetcher = async () => {
      throw new TypeError('Failed to fetch') // browser CORS-style error
    }
    await expect(chat(messages, settings, {}, fetcher)).rejects.toBeInstanceOf(
      LlmError,
    )
    await expect(chat(messages, settings, {}, fetcher)).rejects.toMatchObject({
      cause: expect.any(TypeError),
    })
  })

  it('throws LlmError with status on a non-2xx response', async () => {
    const fetcher = jsonFetcher({ error: 'bad key' }, 401)
    const err = await chat(messages, settings, {}, fetcher).catch((e) => e)
    expect(err).toBeInstanceOf(LlmError)
    expect((err as LlmError).status).toBe(401)
  })
})

describe('chatStream (streaming)', () => {
  function sseFetcher(chunks: string[]): TestFetcher {
    return async (_url: RequestInfo | URL, _init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          for (const c of chunks) controller.enqueue(enc.encode(c))
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }) as unknown as Response
    }
  }

  it('yields streamed tokens and supports onToken callback', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    const tokens: string[] = []
    const collected: string[] = []
    for await (const t of chatStream(messages, settings, {
      onToken: (tok) => tokens.push(tok),
      stream: true,
    }, sseFetcher(chunks))) {
      collected.push(t)
    }
    expect(collected).toEqual(['Hello', ' world'])
    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('propagates connection errors', async () => {
    const fetcher = async () => {
      throw new TypeError('network down')
    }
    const gen = chatStream(messages, settings, { stream: true }, fetcher)
    await expect(gen.next()).rejects.toBeInstanceOf(LlmError)
  })
})
