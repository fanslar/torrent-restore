import type { TorrentInfo } from './types.js'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

const API_TIMEOUT_MS = 10_000
const METADATA_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 1_000

interface QbittorrentConfig {
  url: URL
  username: string
  password: string
  savePath: string
}

interface QbittorrentTorrent {
  hash: string
  name: string
  state: string
  tags: string
}

interface QbittorrentFile {
  name: string
  size: number
}

function getConfig(): QbittorrentConfig {
  const urlValue = process.env.QBITTORRENT_URL
  const username = process.env.QBITTORRENT_USERNAME
  const password = process.env.QBITTORRENT_PASSWORD
  const savePath = process.env.QBITTORRENT_METADATA_SAVE_PATH

  if (!urlValue || !username || !password || !savePath?.trim()) {
    throw new Error(
      'qBittorrent metadata retrieval requires QBITTORRENT_URL, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD, and QBITTORRENT_METADATA_SAVE_PATH',
    )
  }

  let url: URL
  try {
    url = new URL(urlValue)
  }
  catch {
    throw new Error('QBITTORRENT_URL must be a valid HTTP(S) URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('QBITTORRENT_URL must use HTTP or HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('Do not include credentials in QBITTORRENT_URL; use the username and password environment variables')
  }
  if (url.search || url.hash)
    throw new Error('QBITTORRENT_URL must not include a query string or fragment')

  const isLoopback = url.hostname === 'localhost'
    || url.hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
  if (url.protocol !== 'https:' && !isLoopback) {
    throw new Error('QBITTORRENT_URL must use HTTPS when connecting to a non-local host')
  }

  return { url, username, password, savePath: savePath.trim() }
}

function endpoint(config: QbittorrentConfig, name: string): URL {
  const basePath = config.url.pathname.replace(/\/+$/, '')
  return new URL(`${basePath}/api/v2/${name}`, config.url.origin)
}

function getTimeoutSignal(deadline?: number): AbortSignal {
  const remaining = deadline === undefined ? API_TIMEOUT_MS : Math.min(API_TIMEOUT_MS, deadline - Date.now())
  if (remaining <= 0)
    throw new Error('Timed out while waiting for qBittorrent metadata')
  return AbortSignal.timeout(remaining)
}

async function request(
  config: QbittorrentConfig,
  name: string,
  options: {
    method?: 'GET' | 'POST'
    query?: URLSearchParams
    body?: RequestInit['body']
    cookie?: string
    deadline?: number
  } = {},
): Promise<Response> {
  const url = endpoint(config, name)
  if (options.query)
    url.search = options.query.toString()
  const signal = getTimeoutSignal(options.deadline)

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: options.cookie ? { Cookie: options.cookie } : undefined,
      signal,
    })
  }
  catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error(`qBittorrent API request timed out: ${name}`)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not connect to qBittorrent API (${name}): ${message}`)
  }

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`qBittorrent API ${name} failed (${response.status}): ${details || response.statusText}`)
  }
  return response
}

async function login(config: QbittorrentConfig): Promise<string> {
  const body = new URLSearchParams({
    username: config.username,
    password: config.password,
  })
  const response = await request(config, 'auth/login', {
    method: 'POST',
    body,
  })
  const result = await response.text()
  if (result !== 'Ok.')
    throw new Error('qBittorrent authentication failed; check the configured username and password')

  const setCookie = response.headers.get('set-cookie') ?? ''
  const sid = setCookie.match(/(?:^|,\s*)SID=([^;,\s]+)/i)?.[1]
  if (!sid)
    throw new Error('qBittorrent login succeeded but did not return a session cookie')
  return `SID=${sid}`
}

async function getTorrent(
  config: QbittorrentConfig,
  cookie: string,
  hash: string,
  deadline?: number,
): Promise<QbittorrentTorrent[]> {
  const response = await request(config, 'torrents/info', {
    query: new URLSearchParams({ hashes: hash }),
    cookie,
    deadline,
  })
  const torrents: unknown = await response.json()
  if (!Array.isArray(torrents))
    throw new Error('qBittorrent returned an invalid torrent list')
  return torrents.map((torrent) => {
    if (
      typeof torrent !== 'object'
      || torrent === null
      || !('hash' in torrent)
      || typeof torrent.hash !== 'string'
      || !('name' in torrent)
      || typeof torrent.name !== 'string'
      || !('state' in torrent)
      || typeof torrent.state !== 'string'
      || !('tags' in torrent)
      || typeof torrent.tags !== 'string'
    ) {
      throw new Error('qBittorrent returned an invalid torrent entry')
    }
    return { hash: torrent.hash, name: torrent.name, state: torrent.state, tags: torrent.tags }
  })
}

function hasTag(torrent: QbittorrentTorrent, tag: string): boolean {
  return torrent.tags.split(',').map(value => value.trim()).includes(tag)
}

async function getFiles(
  config: QbittorrentConfig,
  cookie: string,
  hash: string,
  deadline?: number,
): Promise<QbittorrentFile[]> {
  const response = await request(config, 'torrents/files', {
    query: new URLSearchParams({ hash }),
    cookie,
    deadline,
  })
  const files: unknown = await response.json()
  if (!Array.isArray(files))
    throw new Error('qBittorrent returned an invalid torrent file list')

  return files.map((file) => {
    if (
      typeof file !== 'object'
      || file === null
      || !('name' in file)
      || typeof file.name !== 'string'
      || !('size' in file)
      || typeof file.size !== 'number'
      || !Number.isFinite(file.size)
      || file.size < 0
    ) {
      throw new Error('qBittorrent returned an invalid torrent file entry')
    }
    return { name: file.name, size: file.size }
  })
}

function toTorrentInfo(name: string, remoteFiles: QbittorrentFile[]): TorrentInfo {
  if (!name || remoteFiles.length === 0)
    throw new Error('qBittorrent returned incomplete torrent metadata')

  const files = remoteFiles.map((file) => {
    let fullPath = file.name.replaceAll('\\', '/')
    const rootPrefix = `${name}/`
    if (fullPath.startsWith(rootPrefix))
      fullPath = fullPath.slice(rootPrefix.length)
    if (!fullPath)
      throw new Error('qBittorrent returned an empty torrent file path')
    return {
      fullPath,
      name: fullPath.split('/').at(-1)!,
      size: file.size,
    }
  })

  return { name, files }
}

async function addTorrent(
  config: QbittorrentConfig,
  cookie: string,
  magnetLink: string,
  hash: string,
  tag: string,
): Promise<void> {
  const body = new FormData()
  body.set('urls', magnetLink)
  body.set('savepath', config.savePath)
  body.set('stopCondition', 'MetadataReceived')
  body.set('stopped', 'false')
  body.set('autoTMM', 'false')
  body.set('tags', tag)

  const response = await request(config, 'torrents/add', {
    method: 'POST',
    body,
    cookie,
  })
  const result = (await response.text()).trim()
  if (result === 'Ok.')
    return
  if (result === 'Fails.')
    throw new Error('qBittorrent did not add the magnet task; it may already exist')

  let parsed: { added_torrent_ids?: unknown } | null = null
  try {
    parsed = JSON.parse(result) as { added_torrent_ids?: unknown }
  }
  catch {
    throw new Error(`qBittorrent returned an unexpected response when adding the magnet: ${result}`)
  }
  if (Array.isArray(parsed?.added_torrent_ids)
    && parsed.added_torrent_ids.some(id => typeof id === 'string' && id.toLowerCase() === hash)) {
    return
  }
  throw new Error('qBittorrent did not confirm that it created the metadata task')
}

async function stopTorrent(config: QbittorrentConfig, cookie: string, hash: string): Promise<void> {
  const body = new FormData()
  body.set('hashes', hash)
  await request(config, 'torrents/stop', { method: 'POST', body, cookie })
}

async function deleteTorrent(
  config: QbittorrentConfig,
  cookie: string,
  hash: string,
  tag: string,
): Promise<void> {
  const torrents = await getTorrent(config, cookie, hash)
  const torrent = torrents.find(item => hasTag(item, tag))
  if (!torrent) {
    if (torrents.length === 0)
      return
    throw new Error('Temporary qBittorrent task ownership could not be verified; it was not removed')
  }

  const body = new FormData()
  body.set('hashes', hash)
  body.set('deleteFiles', 'false')
  const response = await request(config, 'torrents/delete', { method: 'POST', body, cookie })
  const result = (await response.text()).trim()
  if (result && result !== 'Ok.')
    throw new Error(`qBittorrent could not remove its temporary metadata task: ${result}`)
}

async function waitForMetadata(
  config: QbittorrentConfig,
  cookie: string,
  hash: string,
  tag: string,
): Promise<TorrentInfo> {
  const deadline = Date.now() + METADATA_TIMEOUT_MS
  while (Date.now() < deadline) {
    const torrents = await getTorrent(config, cookie, hash, deadline)
    const torrent = torrents[0]
    if (!torrent)
      throw new Error('qBittorrent removed the metadata task before metadata was available')
    if (!hasTag(torrent, tag))
      throw new Error('Temporary qBittorrent task ownership could not be verified')

    const files = await getFiles(config, cookie, hash, deadline)
    if (files.length > 0) {
      if (torrent.state !== 'pausedDL' && torrent.state !== 'stoppedDL') {
        await stopTorrent(config, cookie, hash)
        throw new Error(
          `qBittorrent did not stop the task after receiving metadata (state: ${torrent.state}); the task was stopped and will be removed`,
        )
      }
      await stopTorrent(config, cookie, hash)
      const pausedFiles = await getFiles(config, cookie, hash, deadline)
      return toTorrentInfo(torrent.name, pausedFiles)
    }
    if (torrent.state === 'error' || torrent.state === 'missingFiles') {
      throw new Error(`qBittorrent could not retrieve magnet metadata (state: ${torrent.state})`)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`Timed out after ${METADATA_TIMEOUT_MS / 1000} seconds waiting for magnet metadata`)
}

export async function getMagnetInfoFromQbittorrent(magnetLink: string, hash: string): Promise<TorrentInfo> {
  const config = getConfig()
  const cookie = await login(config)

  const existing = await getTorrent(config, cookie, hash)
  if (existing.length > 0) {
    const files = await getFiles(config, cookie, hash)
    if (files.length > 0)
      return toTorrentInfo(existing[0].name, files)
    throw new Error('This magnet already exists in qBittorrent but has no metadata; it was left unchanged')
  }

  let created = false
  let info: TorrentInfo | undefined
  let operationError: unknown
  const taskTag = `torrent-restore-${randomUUID()}`
  try {
    await addTorrent(config, cookie, magnetLink, hash, taskTag)
    created = true
    info = await waitForMetadata(config, cookie, hash, taskTag)
  }
  catch (error) {
    operationError = error
    if (!created) {
      try {
        const torrents = await getTorrent(config, cookie, hash)
        created = torrents.some(torrent => hasTag(torrent, taskTag))
      }
      catch (ownershipError) {
        operationError = new AggregateError(
          [error, ownershipError],
          'Metadata retrieval failed and ownership of the possible temporary task could not be checked',
        )
      }
    }
  }
  finally {
    if (created) {
      try {
        await deleteTorrent(config, cookie, hash, taskTag)
      }
      catch (cleanupError) {
        operationError = operationError
          ? new AggregateError([operationError, cleanupError], 'Metadata retrieval failed and the temporary qBittorrent task could not be removed')
          : cleanupError
      }
    }
  }

  if (operationError)
    throw operationError
  if (!info)
    throw new Error('qBittorrent metadata retrieval ended without metadata')
  return info
}
