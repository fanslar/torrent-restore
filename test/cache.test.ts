import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TorrentCache } from '../src/cache.js'

const originalCacheHome = process.env.XDG_CACHE_HOME
let testCacheHome: string | undefined

afterEach(async () => {
  if (originalCacheHome === undefined)
    delete process.env.XDG_CACHE_HOME
  else
    process.env.XDG_CACHE_HOME = originalCacheHome

  if (testCacheHome) {
    await fs.rm(testCacheHome, { recursive: true, force: true })
    testCacheHome = undefined
  }
})

describe('torrent cache', () => {
  it('initializes an empty cache and can store data without deadlocking', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-cache-'))
    process.env.XDG_CACHE_HOME = testCacheHome

    const cache = new TorrentCache()
    const key = `magnet:${'c'.repeat(40)}`
    const data = {
      data: { name: 'first-use', files: [] },
      _cachedAt: new Date().toISOString(),
      _source: key,
    }

    await expect(cache.set(key, data)).resolves.toBeUndefined()
    await expect(cache.get(key)).resolves.toEqual(data)
  })

  it('clears a newly initialized empty cache without deadlocking', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-cache-'))
    process.env.XDG_CACHE_HOME = testCacheHome

    const cache = new TorrentCache()
    await expect(cache.clear()).resolves.toBeUndefined()
    await expect(cache.getStats()).resolves.toMatchObject({ count: 0 })
  })

  it('stores magnet cache files with platform-safe names', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-cache-'))
    process.env.XDG_CACHE_HOME = testCacheHome

    const cacheDir = path.join(testCacheHome, 'torrent-restore')
    await fs.mkdir(cacheDir)
    await fs.writeFile(path.join(cacheDir, 'meta.json'), JSON.stringify({ version: '1', items: {} }))

    const cache = new TorrentCache()
    const key = `magnet:${'a'.repeat(40)}`
    const data = {
      data: { name: 'example', files: [] },
      _cachedAt: new Date().toISOString(),
      _source: key,
    }

    await cache.set(key, data)

    const files = await fs.readdir(cacheDir)
    expect(files).toContain(`${encodeURIComponent(key)}.json`)
    expect(files.some(file => file.includes(':'))).toBe(false)
    await expect(cache.get(key)).resolves.toEqual(data)
  })

  it('can read cache files created with the previous filename format', async () => {
    testCacheHome = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-cache-'))
    process.env.XDG_CACHE_HOME = testCacheHome

    const cacheDir = path.join(testCacheHome, 'torrent-restore')
    await fs.mkdir(cacheDir)
    const key = `magnet:${'b'.repeat(40)}`
    const data = {
      data: { name: 'legacy', files: [] },
      _cachedAt: new Date().toISOString(),
      _source: key,
    }
    await fs.writeFile(path.join(cacheDir, 'meta.json'), JSON.stringify({
      version: '1',
      items: { [key]: { timestamp: Date.now(), size: JSON.stringify(data).length } },
    }))
    await fs.writeFile(path.join(cacheDir, `${key}.json`), JSON.stringify(data))

    const cache = new TorrentCache()
    await expect(cache.get(key)).resolves.toEqual(data)
  })
})
