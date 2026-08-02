// Thin, explicit wrapper around localStorage (ADR-0003 story 15 / ADR-0004).
// Only the Endpoint settings and Custom Actions persist on the user's own
// device. Conversation History is intentionally never written here.

const PREFIX = 'pdfllm.'

export const STORAGE_KEYS = {
  endpoint: `${PREFIX}endpoint`,
  apiKey: `${PREFIX}apiKey`,
  model: `${PREFIX}model`,
  customActions: `${PREFIX}customActions`,
  explanationStyle: `${PREFIX}explanationStyle`,
  ttsVoice: `${PREFIX}ttsVoice`,
  ttsRate: `${PREFIX}ttsRate`,
  ttsVolume: `${PREFIX}ttsVolume`,
  ttsPitch: `${PREFIX}ttsPitch`,
  ttsProxy: `${PREFIX}ttsProxy`,
  outlineOpen: `${PREFIX}outlineOpen`,
  conversationOpen: `${PREFIX}conversationOpen`,
  theme: `${PREFIX}theme`,
  bookmarks: `${PREFIX}bookmarks`,
  lastPositions: `${PREFIX}lastPositions`,
  externalRequests: `${PREFIX}externalRequests`,
  vocabBook: `${PREFIX}vocabBook`,
} as const

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

export function loadString(key: string): string {
  if (!hasLocalStorage()) return ''
  return localStorage.getItem(key) ?? ''
}

export function saveString(key: string, value: string): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage full or blocked (private mode) — degrade silently.
  }
}

export function loadBoolean(key: string, fallback: boolean): boolean {
  if (!hasLocalStorage()) return fallback
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export function saveBoolean(key: string, value: boolean): void {
  saveString(key, value ? 'true' : 'false')
}

export function loadJson<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore write failures.
  }
}

/** Stable-ish unique id for Custom Actions. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
