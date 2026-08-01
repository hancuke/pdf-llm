// Edge TTS ("read aloud") integration (CONTEXT.md: nothing yet — new feature).
//
// Uses Microsoft's public Edge online TTS WebSocket endpoint. No API key is
// required. The protocol mirrors the `edge-tts` Python package: open a
// WebSocket with a short-lived `Sec-MS-GEC` DRM token, send a `speech.config`
// message followed by an SSML `ssml` message, then collect the binary audio
// frames and play them back.
//
// The binary frames are wrapped as: `[2-byte big-endian header length][text
// headers ending in "Path:audio\r\n"][audio bytes]`. We extract the audio by
// locating the `Path:audio\r\n` marker (with a 2-byte-length-prefix fallback).

import { ref } from 'vue'
import type { TtsConfig } from './types'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

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

// --- Reactive state (singleton) --------------------------------------------

/** True while audio is actively playing. */
export const isSpeaking = ref(false)
/** True while connecting to the service / synthesizing audio. */
export const isSynthesizing = ref(false)
/** The text currently being read (for the on-screen indicator). */
export const speakingText = ref('')
/** Last error message, or null. */
export const ttsError = ref<string | null>(null)

let audioEl: HTMLAudioElement | null = null
let activeWs: WebSocket | null = null
let objectUrl: string | null = null

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

// --- Edge TTS protocol helpers ----------------------------------------------

/** Short-lived DRM token required by the endpoint (rounded to 5-min windows). */
async function generateSecMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600
  ticks -= ticks % 300
  ticks *= 10_000_000
  const data = new TextEncoder().encode(`${ticks}${TRUSTED_CLIENT_TOKEN}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSSML(text: string, cfg: Required<TtsConfig>): string {
  const safe = escapeXml(text)
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
    `<voice name="${cfg.voice}">` +
    `<prosody pitch="${cfg.pitch}" rate="${cfg.rate}" volume="${cfg.volume}">` +
    `${safe}` +
    `</prosody></voice></speak>`
  )
}

function indexOfAscii(buffer: Uint8Array, pattern: string): number {
  const pat = new TextEncoder().encode(pattern)
  outer: for (let i = 0; i + pat.length <= buffer.length; i++) {
    for (let j = 0; j < pat.length; j++) {
      if (buffer[i + j] !== pat[j]) continue outer
    }
    return i
  }
  return -1
}

/** Pull the raw audio bytes out of a single binary WebSocket frame. */
function extractAudio(buffer: Uint8Array): Uint8Array {
  const marker = 'Path:audio\r\n'
  const idx = indexOfAscii(buffer, marker)
  if (idx >= 0) {
    let audio = buffer.subarray(idx + marker.length)
    // Tolerate an optional blank line between the marker and the audio data.
    if (audio.length >= 2 && audio[0] === 0x0d && audio[1] === 0x0a) {
      audio = audio.subarray(2)
    }
    return audio
  }
  // Fallback: [2-byte big-endian header length][headers][audio].
  if (buffer.length >= 2) {
    const headerLen = (buffer[0] << 8) | buffer[1]
    if (headerLen + 2 <= buffer.length) return buffer.subarray(headerLen + 2)
  }
  return new Uint8Array(0)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// --- Public API -------------------------------------------------------------

/**
 * Read `text` aloud using Edge TTS. Any currently playing/synthesizing speech
 * is stopped first. Rejects if the connection or synthesis fails (network/
 * region blocked), in which case `ttsError` is also set.
 */
export async function speak(text: string, cfg: TtsConfig): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  stop()
  ttsError.value = null

  const options: Required<TtsConfig> = {
    voice: cfg.voice || 'zh-CN-XiaoxiaoNeural',
    rate: cfg.rate || '+0%',
    volume: cfg.volume || '+0%',
    pitch: cfg.pitch || '+0Hz',
    proxy: cfg.proxy || '',
  }

  const secMsGec = await generateSecMsGec()
  const connectionId = crypto.randomUUID()
  // In dev, route through the Vite proxy at /edge-tts-ws (which injects the
  // Origin/User-Agent headers the endpoint requires). A custom proxy can be
  // configured in settings for production builds.
  const base = cfg.proxy.trim() || `//${location.host}/edge-tts-ws`
  const url =
    `${base}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connectionId}`

  isSynthesizing.value = true
  speakingText.value = trimmed

  const audio = ensureAudio()
  const chunks: Uint8Array[] = []

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, ['synthesize'])
      ws.binaryType = 'arraybuffer'
      activeWs = ws
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        activeWs = null
        if (err) reject(err)
        else resolve()
      }

      ws.onopen = () => {
        const timestamp = new Date().toUTCString()
        const config =
          `X-Timestamp:${timestamp}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
        ws.send(config)
        const ssml = buildSSML(trimmed, options)
        const speech =
          `X-RequestId:${connectionId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}\r\n` +
          `Path:ssml\r\n\r\n${ssml}`
        ws.send(speech)
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          if (
            event.data.includes('turn.end') &&
            ws.readyState === WebSocket.OPEN
          ) {
            ws.close()
          }
          return
        }
        const bytes = new Uint8Array(event.data as ArrayBuffer)
        const slice = extractAudio(bytes)
        if (slice.length) chunks.push(slice)
      }

      ws.onerror = () => finish(new Error('TTS 连接失败'))
      ws.onclose = () => finish()
    })

    if (chunks.length === 0) {
      ttsError.value = '未收到语音数据，请检查网络或稍后重试。'
      isSynthesizing.value = false
      speakingText.value = ''
      return
    }

    const audioBytes = concatBytes(chunks)
    const blob = new Blob([audioBytes.buffer as ArrayBuffer], {
      type: 'audio/mpeg',
    })
    objectUrl = URL.createObjectURL(blob)
    audio.src = objectUrl
    isSynthesizing.value = false
    isSpeaking.value = true
    try {
      await audio.play()
    } catch {
      ttsError.value = '浏览器拒绝播放语音（可能需要用户交互）。'
      isSpeaking.value = false
      speakingText.value = ''
      releaseUrl()
    }
  } catch (err) {
    ttsError.value =
      err instanceof Error ? err.message : '朗读失败，请检查网络。'
    isSynthesizing.value = false
    isSpeaking.value = false
    speakingText.value = ''
  }
}

/** Stop any in-progress synthesis or playback. */
export function stop(): void {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    activeWs.close()
  }
  activeWs = null
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
  }
  releaseUrl()
  isSynthesizing.value = false
  isSpeaking.value = false
  speakingText.value = ''
}

/** Convenience: whether the TTS subsystem is busy (for UI gating). */
export function getTtsBusy(): boolean {
  return isSpeaking.value || isSynthesizing.value
}
