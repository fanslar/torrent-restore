import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TorrentCache } from '../src/cache.js'
import { getTorrentInfo } from '../src/torrent.js'

const originalCacheHome = process.env.XDG_CACHE_HOME
const qbittorrentEnv = [
  'QBITTORRENT_URL',
  'QBITTORRENT_USERNAME',
  'QBITTORRENT_PASSWORD',
  'QBITTORRENT_METADATA_SAVE_PATH',
] as const
const originalQbittorrentEnv = Object.fromEntries(qbittorrentEnv.map(key => [key, process.env[key]]))
let testCacheHome: string | undefined

afterEach(async () => {
  if (originalCacheHome === undefined)
    delete process.env.XDG_CACHE_HOME
  else
    process.env.XDG_CACHE_HOME = originalCacheHome
  for (const key of qbittorrentEnv) {
    const value = originalQbittorrentEnv[key]
    if (value === undefined)
      delete process.env[key]
    else
      process.env[key] = value
  }

  if (testCacheHome) {
    await fs.rm(testCacheHome, { recursive: true, force: true })
    testCacheHome = undefined
  }
})

describe('magnet metadata retrieval', () => {
  it('returns existing cached metadata', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-magnet-'))
    process.env.XDG_CACHE_HOME = testCacheHome

    const magnet = `magnet:?xt=urn:btih:${'d'.repeat(40)}`
    const cache = new TorrentCache()
    const key = cache.getCacheKey(magnet)!
    const data = {
      name: 'cached torrent',
      files: [{ fullPath: 'cached.mkv', name: 'cached.mkv', size: 12 }],
    }

    await cache.set(key, {
      data,
      _cachedAt: new Date().toISOString(),
      _source: magnet,
    })

    await expect(getTorrentInfo(magnet, 'magnet')).resolves.toEqual(data)
  })

  it('requires qBittorrent configuration when the cache misses', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-magnet-'))
    process.env.XDG_CACHE_HOME = testCacheHome
    for (const key of qbittorrentEnv)
      delete process.env[key]

    const torrentInfo = getTorrentInfo(`magnet:?xt=urn:btih:${'e'.repeat(40)}`, 'magnet')
    await expect(torrentInfo).rejects.toThrow('qBittorrent metadata retrieval requires')
  })
})
