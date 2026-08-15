import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  resolveUrl,
  basicAuthHeader,
  webdavUpload,
  webdavDownload,
  type WebDavConfig,
} from './webdav'

const cfg: WebDavConfig = {
  url: 'https://dav.example.com/remote.php/dav/files/user/',
  username: 'alice',
  password: 's3cret',
  path: 'pdf-llm-backup.json',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveUrl', () => {
  it('joins base and path, collapsing slashes at the boundary', () => {
    expect(resolveUrl(cfg)).toBe(
      'https://dav.example.com/remote.php/dav/files/user/pdf-llm-backup.json',
    )
  })
  it('handles a base with no trailing slash and a path with a leading slash', () => {
    expect(resolveUrl({ ...cfg, url: 'https://x.com/dav', path: '/b.json' })).toBe(
      'https://x.com/dav/b.json',
    )
  })
})

describe('basicAuthHeader', () => {
  it('produces a Basic header value', () => {
    expect(basicAuthHeader(cfg)).toBe('Basic ' + btoa('alice:s3cret'))
  })
})

describe('webdavUpload', () => {
  it('PUTs the content with auth and Overwrite headers', async () => {
    let captured: { url: string; method?: string; headers?: Record<string, string>; body?: string } = {
      url: '',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        captured = {
          url,
          method: init?.method,
          headers: init?.headers as Record<string, string>,
          body: init?.body as string,
        }
        return new Response(null, { status: 201 }) as unknown as Response
      }),
    )

    await webdavUpload(cfg, '{"a":1}')

    expect(captured.url).toBe(resolveUrl(cfg))
    expect(captured.method).toBe('PUT')
    expect(captured.headers?.Authorization).toBe(basicAuthHeader(cfg))
    expect(captured.headers?.Overwrite).toBe('T')
    expect(captured.body).toBe('{"a":1}')
  })

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('fail', { status: 403 }) as unknown as Response),
    )
    await expect(webdavUpload(cfg, 'x')).rejects.toThrow(/备份失败/)
  })
})

describe('webdavDownload', () => {
  it('GETs and returns the text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"ok":true}', { status: 200 }) as unknown as Response,
      ),
    )
    const text = await webdavDownload(cfg)
    expect(text).toBe('{"ok":true}')
  })

  it('throws a friendly error on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }) as unknown as Response),
    )
    await expect(webdavDownload(cfg)).rejects.toThrow(/不存在/)
  })

  it('throws on other errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }) as unknown as Response),
    )
    await expect(webdavDownload(cfg)).rejects.toThrow(/下载失败/)
  })
})
