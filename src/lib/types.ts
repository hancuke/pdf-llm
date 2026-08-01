// Shared domain types for PDF-LLM.
// These types describe the core concepts from CONTEXT.md and are intentionally
// free of any Vue / pdf.js / DOM dependency so the domain logic stays
// framework-independent (clean architecture: business logic has no
// knowledge of the presentation layer).

/** A character range within a raw text string, [start, end). */
export interface SelectionRange {
  start: number
  end: number
}

/**
 * Controls how plainly the LLM should express itself (CONTEXT.md:
 * "讲解风格"). Applied globally to every Quick Action via the system prompt.
 */
export type ExplanationStyle = 'default' | 'plain' | 'eli5'

/** Result of resolving a Selection into its surrounding Context. */
export interface ExtractedContext {
  /** The exact highlighted text the user selected. */
  selectedText: string
  /**
   * The paragraph (or, on fallback, the N sentences) surrounding the
   * Selection that the LLM should see as Context. Already contains the
   * selected text.
   */
  contextText: string
}

/** A single message in the OpenAI-compatible chat protocol. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** User-configured LLM endpoint settings (ADR-0003). */
export interface EndpointSettings {
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or an Ollama URL. */
  baseUrl: string
  /** User's own API key; stored only on the device (story 15). */
  apiKey: string
  /** Model name. */
  model: string
}

/**
 * Edge TTS (Microsoft "read aloud") configuration. No API key — the public
 * Edge online TTS endpoint is used directly. `rate`/`volume`/`pitch` follow the
 * SSML prosody attribute syntax (e.g. "+0%", "-50%", "+0Hz").
 */
export interface TtsConfig {
  /** Voice short name, e.g. "zh-CN-XiaoxiaoNeural". */
  voice: string
  /** Speaking rate, SSML syntax: "+0%", "+50%", "-25%". */
  rate: string
  /** Volume, SSML syntax: "+0%", "-50%", "+100%". */
  volume: string
  /** Pitch, SSML syntax: "+0Hz", "-50Hz", "+50Hz". */
  pitch: string
  /**
   * Optional WebSocket proxy base URL. The browser cannot set the
   * `Origin`/`User-Agent` headers Microsoft requires, so a direct connection
   * is rejected; a proxy (e.g. a Vite dev-server proxy or a Cloudflare Worker
   * like MsEdge-TTS-Extension) must inject them. In dev, leave empty to use
   * the built-in `/edge-tts-ws` Vite proxy. Example:
   * `wss://my-worker.workers.dev/edge-tts`.
   */
  proxy: string
}
