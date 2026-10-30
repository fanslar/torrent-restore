import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMagnetInfoFromQbittorrent } from '../src/qbittorrent.js'

const hash = 'a'.repeat(40)
const magnetLink = `magnet:?xt=urn:btih:${hash}`

function response(body = '', status = 200, headers?: ResponseInit['headers']): Response {
  return new Response(body, { status, headers })
}

function installFetch(
  handler: (url: URL, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(input.toString())
    return Promise.resolve(handler(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function taggedTorrent(tag: string, state = 'pausedDL') {
  return [{ hash, name: 'Example', state, tags: tag }]
}

describe('qBittorrent metadata retrieval', () => {
  beforeEach(() => {
    vi.stubEnv('QBITTORRENT_URL', 'http://127.0.0.1:8080')
    vi.stubEnv('QBITTORRENT_USERNAME', 'test-user')
    vi.stubEnv('QBITTORRENT_PASSWORD', 'test-password')
    vi.stubEnv('QBITTORRENT_METADATA_SAVE_PATH', '/tmp/torrent-restore-metadata')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('retrieves metadata and removes only its tagged temporary task', async () => {
    let taskTag = ''
    let infoRequests = 0
    const fetchMock = installFetch((url, init) => {
      if (url.pathname.endsWith('/auth/login'))
        return response('Ok.', 200, { 'set-cookie': 'SID=session; HttpOnly' })
      if (url.pathname.endsWith('/torrents/info')) {
        infoRequests++
        return response(JSON.stringify(infoRequests <= 2 ? [] : taggedTorrent(taskTag)))
      }
      if (url.pathname.endsWith('/torrents/add')) {
        const body = init?.body as FormData
        taskTag = String(body.get('tags'))
        expect(body.get('stopCondition')).toBe('MetadataReceived')
        expect(body.get('savepath')).toBe('/tmp/torrent-restore-metadata')
        return response('Ok.')
      }
      if (url.pathname.endsWith('/torrents/files'))
        return response(JSON.stringify([{ name: 'Example/video.mkv', size: 42 }]))
      if (url.pathname.endsWith('/torrents/stop'))
        return response()
      if (url.pathname.endsWith('/torrents/delete')) {
        expect((init?.body as FormData).get('deleteFiles')).toBe('false')
        return response()
      }
      return response('Not found', 404)
    })

    await expect(getMagnetInfoFromQbittorrent(magnetLink, hash)).resolves.toEqual({
      name: 'Example',
      files: [{ fullPath: 'video.mkv', name: 'video.mkv', size: 42 }],
    })

    expect(taskTag).toMatch(/^torrent-restore-/)
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/torrents/delete'))).toBe(true)
  })

  it('reads metadata from an existing task without changing or removing it', async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname.endsWith('/auth/login'))
        return response('Ok.', 200, { 'set-cookie': 'SID=session; HttpOnly' })
      if (url.pathname.endsWith('/torrents/info')) {
        return response(JSON.stringify([{ hash, name: 'Existing', state: 'downloading', tags: '' }]))
      }
      if (url.pathname.endsWith('/torrents/files'))
        return response(JSON.stringify([{ name: 'Existing/file.bin', size: 7 }]))
      return response('Unexpected request', 500)
    })

    await expect(getMagnetInfoFromQbittorrent(magnetLink, hash)).resolves.toEqual({
      name: 'Existing',
      files: [{ fullPath: 'file.bin', name: 'file.bin', size: 7 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('leaves an existing task without metadata unchanged', async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname.endsWith('/auth/login'))
        return response('Ok.', 200, { 'set-cookie': 'SID=session; HttpOnly' })
      if (url.pathname.endsWith('/torrents/info'))
        return response(JSON.stringify([{ hash, name: 'Existing', state: 'downloading', tags: '' }]))
      if (url.pathname.endsWith('/torrents/files'))
        return response('[]')
      return response('Unexpected request', 500)
    })

    await expect(getMagnetInfoFromQbittorrent(magnetLink, hash)).rejects.toThrow('already exists in qBittorrent but has no metadata')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cleans up its task after metadata retrieval fails', async () => {
    let taskTag = ''
    const fetchMock = installFetch((url, init) => {
      if (url.pathname.endsWith('/auth/login'))
        return response('Ok.', 200, { 'set-cookie': 'SID=session; HttpOnly' })
      if (url.pathname.endsWith('/torrents/info')) {
        const callCount = fetchMock.mock.calls.filter(([input]) => (
          new URL(String(input)).pathname.endsWith('/torrents/info')
        )).length
        return response(JSON.stringify(callCount === 1 ? [] : taggedTorrent(taskTag, 'error')))
      }
      if (url.pathname.endsWith('/torrents/add')) {
        taskTag = String((init?.body as FormData).get('tags'))
        return response('Ok.')
      }
      if (url.pathname.endsWith('/torrents/files'))
        return response('[]')
      if (url.pathname.endsWith('/torrents/delete'))
        return response()
      return response('Unexpected request', 500)
    })

    await expect(getMagnetInfoFromQbittorrent(magnetLink, hash)).rejects.toThrow('could not retrieve magnet metadata')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/torrents/delete'))).toBe(true)
  })

  it('does not delete a task when qBittorrent reports that add failed', async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname.endsWith('/auth/login'))
        return response('Ok.', 200, { 'set-cookie': 'SID=session; HttpOnly' })
      if (url.pathname.endsWith('/torrents/info'))
        return response('[]')
      if (url.pathname.endsWith('/torrents/add'))
        return response('Fails.')
      return response('Unexpected request', 500)
    })

    await expect(getMagnetInfoFromQbittorrent(magnetLink, hash)).rejects.toThrow('did not add the magnet task')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/torrents/delete'))).toBe(false)
  })
})
