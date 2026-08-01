// Edge TTS ("read aloud") integration (CONTEXT.md: new feature).
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

import { ref } from 'vue'
import type { TtsConfig } from './types'

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
/** The text currently being read (for the on-screen indicator). */
export const speakingText = ref('')
/** Last error message, or null. */
export const ttsError = ref<string | null>(null)

let audioEl: HTMLAudioElement | null = null
let objectUrl: string | null = null
let activeController: AbortController | null = null

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.addEventListener('ended', () => {
      isSpeaking.value = false
      speakingText.value = ''
      releaseUrl()
    })
    audioEl.addEventListener('error', () => {
      isSpeaking.value = false
      speakingText.value = ''
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
}

// --- Public API -------------------------------------------------------------

/**
 * Read `text` aloud via Edge TTS. Any currently playing/synthesizing speech is
 * stopped first. Rejects (and sets `ttsError`) if the request or playback
 * fails (e.g. network blocked, invalid endpoint).
 */
export async function speak(text: string, cfg: TtsConfig): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  stop()
  ttsError.value = null

  const endpoint = cfg.proxy?.trim() || DEFAULT_TTS_ENDPOINT
  const controller = new AbortController()
  activeController = controller

  isSynthesizing.value = true
  speakingText.value = trimmed

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        voice: cfg.voice || 'zh-CN-XiaoxiaoNeural',
        rate: cfg.rate || '+0%',
        pitch: cfg.pitch || '+0Hz',
        volume: cfg.volume || '+0%',
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || `TTS 请求失败（${response.status}）`)
    }

    const blob = await response.blob()
    if (!blob.size) throw new Error('未收到语音数据，请检查网络或端点。')

    objectUrl = URL.createObjectURL(blob)
    const audio = ensureAudio()
    audio.src = objectUrl

    isSynthesizing.value = false
    isSpeaking.value = true
    try {
      await audio.play()
    } catch {
      ttsError.value = '浏览器拒绝播放语音（可能需要一次用户交互）。'
      isSpeaking.value = false
      speakingText.value = ''
      releaseUrl()
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    ttsError.value =
      err instanceof Error ? err.message : '朗读失败，请检查网络或端点。'
    isSynthesizing.value = false
    isSpeaking.value = false
    speakingText.value = ''
  } finally {
    activeController = null
  }
}

/** Stop any in-progress synthesis or playback. */
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
  speakingText.value = ''
}
