// Cloudflare Pages Function — Edge TTS WebSocket relay.
//
// The browser cannot set the `Origin` / `User-Agent` headers Microsoft's TTS
// endpoint requires, so a direct WebSocket from the page is rejected. This
// function (part of the Pages deployment — no separate Worker) accepts the
// browser's WebSocket at /edge-tts-ws and opens an upstream WebSocket to
// Microsoft, injecting the required headers. It mirrors the proven logic from
// the MsEdge-TTS-Extension Cloudflare Worker.
//
// The app (src/lib/tts.ts) connects to `/edge-tts-ws`; in development that
// path is served by the Vite dev-server proxy (see vite.config.ts), and in
// production by this function. No extra configuration is needed.

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const UPSTREAM =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'

function generateSecMsGec() {
  const ticks = BigInt(Math.floor(Date.now() / 1000 + 11644473600) * 10000000)
  const rounded = ticks - (ticks % BigInt(3000000000))
  const str = rounded.toString() + TRUSTED_CLIENT_TOKEN
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(str))
    .then((hash) =>
      Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
    )
}

export async function onRequest() {
  const secMsGec = await generateSecMsGec()
  const connectionId = crypto.randomUUID()
  const upstreamUrl =
    `${UPSTREAM}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connectionId}`

  const upstreamResp = await fetch(upstreamUrl, {
    headers: {
      Upgrade: 'websocket',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      'Sec-WebSocket-Protocol': 'synthesize',
    },
  })

  const upstreamWs = upstreamResp.webSocket
  if (!upstreamWs) {
    return new Response('Upstream WebSocket upgrade failed', { status: 502 })
  }
  upstreamWs.accept()

  const [client, server] = Object.values(new WebSocketPair())
  server.accept()

  // Pump messages in both directions; close the peer on either side closing.
  const pipe = (from, to) => {
    from.addEventListener('message', (event) => {
      try {
        to.send(event.data)
      } catch {
        /* peer already closed */
      }
    })
    from.addEventListener('close', () => {
      try {
        to.close()
      } catch {
        /* noop */
      }
    })
    from.addEventListener('error', () => {
      try {
        to.close()
      } catch {
        /* noop */
      }
    })
  }
  pipe(server, upstreamWs)
  pipe(upstreamWs, server)

  return new Response(null, { status: 101, webSocket: client })
}
