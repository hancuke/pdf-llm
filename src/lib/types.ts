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
