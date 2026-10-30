/**
 * 缓存管理
 */

import type { CachedTorrent, CacheMeta } from './types.js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { ensureDir, formatSize, readJSONFile, writeJSONFile } from './utils.js'

const CACHE_VERSION = '1'

/**
 * 获取缓存目录
 */
function getCacheDir(): string {
  const home = os.homedir()
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, '.cache')
  return path.join(xdgCache, 'torrent-restore')
}

/**
 * 缓存管理类
 */
export class TorrentCache {
  private cacheDir: string
  private metaFile: string
  private meta: CacheMeta
  private initPromise: Promise<void> | null = null

  constructor() {
    this.cacheDir = getCacheDir()
    this.metaFile = path.join(this.cacheDir, 'meta.json')
    this.meta = { version: CACHE_VERSION, items: {} }
  }

  /**
   * 初始化缓存
   */
  async init(): Promise<void> {
    if (this.initPromise)
      return this.initPromise

    this.initPromise = (async () => {
      try {
        await ensureDir(this.cacheDir)
        const data = await readJSONFile<CacheMeta>(this.metaFile)
        if (data && data.version === CACHE_VERSION) {
          this.meta = data
        }
        else {
          await this.clearCacheFiles()
          this.meta = { version: CACHE_VERSION, items: {} }
          await this.saveMeta()
        }
      }
      catch (err) {
        console.error(chalk.red('❌ 缓存初始化失败:'), (err as Error).message)
        this.meta = { version: CACHE_VERSION, items: {} }
      }
    })()

    return this.initPromise
  }

  /**
   * 生成缓存键
   */
  getCacheKey(input: string): string | null {
    // 1. 磁力链接 → 提取 infohash
    if (/^magnet:/i.test(input)) {
      const match = input.match(/urn:btih:([a-f0-9]{40})/i)
      if (match) {
        return `magnet:${match[1].toLowerCase()}`
      }
      // 如果提取失败，不缓存
      return null
    }

    // 2. 纯 hash (40位) → 当作磁力链接
    if (/^[a-f0-9]{40}$/i.test(input)) {
      return `magnet:${input.toLowerCase()}`
    }

    // 3. 种子文件或其他 → 不需要缓存
    return null
  }

  /**
   * 获取缓存
   */
  async get(key: string): Promise<CachedTorrent | null> {
    await this.init()

    const item = this.meta.items[key]
    if (!item)
      return null

    const data = await readJSONFile<CachedTorrent>(this.getCacheFilePath(key))
      ?? await readJSONFile<CachedTorrent>(path.join(this.cacheDir, `${key}.json`))
    return data
  }

  /**
   * 设置缓存
   */
  async set(key: string, data: CachedTorrent): Promise<void> {
    await this.init()

    await writeJSONFile(this.getCacheFilePath(key), data)

    this.meta.items[key] = {
      timestamp: Date.now(),
      size: JSON.stringify(data).length,
    }

    await this.saveMeta()
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    await this.init()

    for (const cacheFile of [this.getCacheFilePath(key), path.join(this.cacheDir, `${key}.json`)]) {
      try {
        await fs.unlink(cacheFile)
      }
      catch {
        // ignore
      }
    }

    delete this.meta.items[key]
    await this.saveMeta()
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this.init()

    await this.clearCacheFiles()

    this.meta.items = {}
    await this.saveMeta()
  }

  private async clearCacheFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir)
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file))
      }
    }
    catch {
      // ignore
    }
  }

  /**
   * 获取缓存统计
   */
  async getStats(): Promise<{ count: number, totalSize: number, totalSizeFormatted: string }> {
    await this.init()

    const items = Object.values(this.meta.items)
    const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0)

    return {
      count: items.length,
      totalSize,
      totalSizeFormatted: formatSize(totalSize),
    }
  }

  /**
   * 保存元数据
   */
  private async saveMeta(): Promise<void> {
    await writeJSONFile(this.metaFile, this.meta)
  }

  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${encodeURIComponent(key)}.json`)
  }
}
