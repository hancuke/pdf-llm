// Edge TTS ("read aloud") integration (CONTEXT.md: 朗读面板 / 单词发音).
//
// Uses a small HTTP endpoint that proxies Microsoft's Edge online TTS. No API
// key is required. The browser POSTs the text + voice/rate/volume/pitch and
// receives the synthesized audio bytes directly, so there is no WebSocket and
// no need to inject the headers Microsoft rejects from browsers.
//
// `cfg.proxy` is the endpoint URL (an HTTP(S) POST endpoint). It defaults to a
// public proxy; set your own (e.g. a self-hosted Cloudflare Pages Function) in
// settings. The request body is:
//   { text, voice, rate, pitch, volume }
//
// The module keeps a single shared transport for the main read-aloud session
// (pause / resume / seek / replay / download) plus a separate, fire-and-forget
// voice for single-word pronunciation (see `speakWord`).

import { ref } from 'vue'
import type { TtsConfig } from './types'
import { downloadBlob } from './download'

/** Common voices surfaced as suggestions in the settings UI. */
export const SUGGESTED_VOICES: { value: string; label: string }[] = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女，中文普通话）' },
  { value: 'zh-CN-YunxiNeural', label: '云希（男，中文普通话）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男，中文新闻）' },
  { value: 'zh-CN-YunjianNeural', label: '云健（男，中文）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊（女，四川话）' },
  { value: 'en-US-EmmaMultilingualNeural', label: 'Emma（女，英文）' },
  { value: 'en-US-AndrewNeural', label: 'Andrew（男，英文）' },
  { value: 'en-US-AriaNeural', label: 'Aria（女，英文）' },
  { value: 'ja-JP-NanamiNeural', label: 'Nanami（女，日文）' },
  { value: 'ko-KR-SunHiNeural', label: 'SunHi（女，韩文）' },
]

export const DEFAULT_TTS_ENDPOINT = 'https://tts.webextools.com/tts'

// --- Reactive state (singleton) --------------------------------------------

/** True while audio is actively playing. */
export const isSpeaking = ref(false)
/** True while the HTTP request is in flight / synthesizing. */
export const isSynthesizing = ref(false)
/** True while playback is paused mid-track (vs. stopped / ended). */
export const isPaused = ref(false)
/** True while a single-word pronunciation request is in flight. */
export const isWordSpeaking = ref(false)
/** The selection text of the active read-aloud session (drives the panel). */
export const currentText = ref('')
/** Whether the read-aloud panel is open (CONTEXT.md: 朗读面板). */
export const isOpen = ref(false)
/** Playback position in seconds (mirrors the <audio> element). */
export const currentTime = ref(0)
/** Total track duration in seconds (0 until metadata loads). */
export const duration = ref(0)
/** Last error message, or null. */
export const ttsError = ref<string | null>(null)

let audioEl: HTMLAudioElement | null = null
let objectUrl: string | null = null
let currentBlob: Blob | null = null
let activeController: AbortController | null = null

// Separate element for single-word pronunciation so it never disrupts the
// main read-aloud transport.
let wordAudio: HTMLAudioElement | null = null
let wordUrl: string | null = null

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.addEventListener('play', () => {
      isSpeaking.value = true
      isPaused.value = false
    })
    audioEl.addEventListener('pause', () => {
      // `pause` also fires right before `ended`; `ended` resets the flags.
      if (isSpeaking.value) isPaused.value = true
      isSpeaking.value = false
    })
    audioEl.addEventListener('ended', () => {
      isSpeaking.value = false
      isPaused.value = false
      currentTime.value = duration.value
    })
    audioEl.addEventListener('timeupdate', () => {
      if (audioEl) currentTime.value = audioEl.currentTime
    })
    audioEl.addEventListener('loadedmetadata', () => {
      if (audioEl) duration.value = audioEl.duration || 0
    })
    audioEl.addEventListener('error', () => {
      isSpeaking.value = false
      isPaused.value = false
      ttsError.value = '音频播放失败。'
      releaseUrl()
    })
  }
  return audioEl
}

function releaseUrl(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  currentBlob = null
}

/** POST text to the proxy and return the synthesized audio bytes. */
async function requestBlob(
  text: string,
  cfg: TtsConfig,
  signal?: AbortSignal,
): Promise<Blob> {
  const endpoint = cfg.proxy?.trim() || DEFAULT_TTS_ENDPOINT
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: cfg.voice || 'zh-CN-XiaoxiaoNeural',
      rate: cfg.rate || '+0%',
      pitch: cfg.pitch || '+0Hz',
      volume: cfg.volume || '+0%',
    }),
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `TTS 请求失败（${response.status}）`)
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error('未收到语音数据，请检查网络或端点。')
  return blob
}

// --- Public API -------------------------------------------------------------

/**
 * Read `text` aloud via Edge TTS, opening the read-aloud panel. Any currently
 * playing/synthesizing speech is stopped first. Rejects (and sets `ttsError`)
 * if the request or playback fails (e.g. network blocked, invalid endpoint).
 */
export async function speak(text: string, cfg: TtsConfig): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  stop()
  ttsError.value = null

  const controller = new AbortController()
  activeController = controller

  isSynthesizing.value = true
  isOpen.value = true
  currentText.value = trimmed
  currentTime.value = 0
  duration.value = 0

  try {
    const blob = await requestBlob(trimmed, cfg, controller.signal)

    objectUrl = URL.createObjectURL(blob)
    currentBlob = blob
    const audio = ensureAudio()
    audio.src = objectUrl

    isSynthesizing.value = false
    isSpeaking.value = true
    try {
      await audio.play()
    } catch {
      ttsError.value = '浏览器拒绝播放语音（可能需要一次用户交互）。'
      isSpeaking.value = false
      isPaused.value = false
      releaseUrl()
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    ttsError.value =
      err instanceof Error ? err.message : '朗读失败，请检查网络或端点。'
    isSynthesizing.value = false
    isSpeaking.value = false
    isPaused.value = false
  } finally {
    activeController = null
  }
}

/** Pause the main read-aloud transport (keeps the panel open). */
export function pause(): void {
  if (audioEl && isSpeaking.value) audioEl.pause()
}

/** Resume the paused main read-aloud transport. */
export function resume(): void {
  if (audioEl && isPaused.value) void audioEl.play()
}

/** Toggle between pause and resume. */
export function togglePause(): void {
  if (isPaused.value) resume()
  else pause()
}

/** Seek the main transport to `seconds`. */
export function seek(seconds: number): void {
  if (audioEl) {
    audioEl.currentTime = seconds
    currentTime.value = seconds
  }
}

/** Restart the current track from the beginning (reuses the synthesized blob). */
export function replay(): void {
  if (!audioEl || !currentBlob) return
  audioEl.currentTime = 0
  currentTime.value = 0
  isPaused.value = false
  void audioEl.play()
}

/**
 * Stop any in-progress synthesis or playback. Keeps the panel open (use
 * `close` to dismiss it) and keeps `currentText` so the word view remains.
 */
export function stop(): void {
  if (activeController) activeController.abort()
  activeController = null
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
  }
  releaseUrl()
  isSynthesizing.value = false
  isSpeaking.value = false
  isPaused.value = false
}

/**
 * Dismiss the read-aloud panel entirely: stop playback and drop the active
 * session (currentText / blob / position).
 */
export function close(): void {
  stop()
  isOpen.value = false
  currentText.value = ''
  currentTime.value = 0
  duration.value = 0
}

/**
 * Trigger a browser download of the synthesized audio (mp3). Reuses the blob
 * already in memory — no re-synthesis. No-op if nothing has been synthesized.
 */
export function download(filename = '朗读.mp3'): void {
  if (!currentBlob) return
  downloadBlob(currentBlob, filename)
}

/**
 * Read a single `word` aloud (e.g. when the user taps a word in the read-aloud
 * text view). Synthesized on its own audio element so it never interrupts the
 * main transport (CONTEXT.md: 单词发音). Reuses the same TTS proxy/voice.
 */
export async function speakWord(word: string, cfg: TtsConfig): Promise<void> {
  const trimmed = word.trim()
  if (!trimmed) return
  ttsError.value = null

  if (!wordAudio) {
    wordAudio = new Audio()
    wordAudio.addEventListener('ended', () => {
      isWordSpeaking.value = false
    })
    wordAudio.addEventListener('error', () => {
      isWordSpeaking.value = false
      ttsError.value = '单词发音失败。'
    })
  }
  // Interrupt any in-flight word pronunciation.
  wordAudio.pause()
  if (wordUrl) URL.revokeObjectURL(wordUrl)

  isWordSpeaking.value = true
  try {
    const blob = await requestBlob(trimmed, cfg)
    wordUrl = URL.createObjectURL(blob)
    wordAudio.src = wordUrl
    await wordAudio.play()
  } catch (err) {
    isWordSpeaking.value = false
    ttsError.value =
      err instanceof Error ? err.message : '单词发音失败，请检查网络或端点。'
  }
}

/**
 * Build a filesystem-safe download name for a read-aloud session:
 * `{干净题目}_{选区前若干字}.mp3`, falling back to `朗读` when there is no
 * title. Illegal filename characters are stripped; lengths are capped.
 */
export function buildReadAloudFileName(title: string, text: string): string {
  const safeTitle = (title || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 40)
  const base = safeTitle || '朗读'
  const snippet = text
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
  return snippet ? `${base}_${snippet}.mp3` : `${base}.mp3`
}
