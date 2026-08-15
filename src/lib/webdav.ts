// Minimal WebDAV client for settings backup/sync (CONTEXT.md: 同步与备份).
//
// Pure client-side: only the browser's native `fetch` is used — no dependency,
// no backend. Authentication is HTTP Basic (ADR-0019). Two operations are
// supported: `webdavUpload` (PUT a file) and `webdavDownload` (GET a file).
//
// NOTE: because requests originate from the browser, the WebDAV server must
// allow CORS (including the `Authorization` preflight). This is a deployment
// concern for the user's own server, not something this client can work around.

/** Connection + target for a WebDAV backup. */
export interface WebDavConfig {
  /** Server base URL, e.g. https://dav.example.com/remote.php/dav/files/user/ */
  url: string
  username: string
  password: string
  /** Remote file name (or path under the base URL), e.g. pdf-llm-backup.json */
  path: string
}

/**
 * Join the server URL and the remote path, collapsing duplicate slashes at the
 * boundary while preserving any trailing slash semantics of the base URL.
 */
export function resolveUrl(cfg: WebDavConfig): string {
  const base = cfg.url.replace(/\/+$/, '')
  const path = cfg.path.replace(/^\/+/, '')
  return `${base}/${path}`
}

/**
 * Build a UTF-8-safe Basic auth header value (`Basic base64(user:pass)`).
 * `btoa` only handles Latin-1, so the credential is first encoded as bytes.
 */
export function basicAuthHeader(cfg: WebDavConfig): string {
  const credential = `${cfg.username}:${cfg.password}`
  const bytes = new TextEncoder().encode(credential)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `Basic ${btoa(binary)}`
}

function authHeaders(cfg: WebDavConfig): Record<string, string> {
  return { Authorization: basicAuthHeader(cfg) }
}

/**
 * Upload `content` to the configured WebDAV location (HTTP PUT). Overwrites an
 * existing file (`Overwrite: T`). Throws a Chinese error on any non-2xx
 * response or network failure.
 */
export async function webdavUpload(
  cfg: WebDavConfig,
  content: string,
): Promise<void> {
  const url = resolveUrl(cfg)
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(cfg),
      'Content-Type': 'application/json',
      Overwrite: 'T',
    },
    body: content,
  })
  if (!res.ok) {
    throw new Error(`备份失败：服务器返回 ${res.status} ${res.statusText}`)
  }
}

/**
 * Download the configured WebDAV file (HTTP GET) and return its text. Throws a
 * Chinese error when the file is missing (404) or the server refuses.
 */
export async function webdavDownload(cfg: WebDavConfig): Promise<string> {
  const url = resolveUrl(cfg)
  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(cfg),
  })
  if (res.status === 404) {
    throw new Error('远端文件不存在，请先执行一次备份。')
  }
  if (!res.ok) {
    throw new Error(`下载失败：服务器返回 ${res.status} ${res.statusText}`)
  }
  return res.text()
}
