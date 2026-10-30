/**
 * 种子解析模块
 *
 * 支持两种输入类型：
 * 1. 种子文件 (.torrent) - 直接读取，无需网络，无需缓存
 * 2. 磁力链接 - 支持读取已有缓存，元数据获取功能待实现
 */

import type { Buffer } from 'node:buffer'
import type { TorrentInfo } from './types.js'
import { existsSync, promises as fs, statSync } from 'node:fs'
import path from 'node:path'
import bencode from 'bencode'
import { TorrentCache } from './cache.js'
import { detectInputType } from './cli.js'
import { log } from './utils.js'

/**
 * 获取种子信息
 *
 * @param input - 输入字符串（文件路径或磁力链接）
 * @param type - 输入类型 ('torrent' | 'magnet' | 'auto')
 * @param useCache - 是否使用缓存（仅对磁力链接有效）
 * @param verbose - 是否显示详细输出
 * @returns 种子信息
 */
export async function getTorrentInfo(
  input: string,
  type: 'torrent' | 'magnet' | 'auto',
  useCache: boolean = true,
  verbose: boolean = false,
): Promise<TorrentInfo> {
  let actualType: 'torrent' | 'magnet'

  if (type === 'auto') {
    actualType = detectInputType(input)
    log(`  自动识别为: ${actualType}`, 'verbose', verbose)
  }
  else {
    actualType = type
  }

  if (actualType === 'torrent') {
    // 种子文件：直接读取，不需要缓存
    return await getTorrentFromFile(input, verbose)
  }
  else {
    // 磁力链接：读取已有缓存；未命中时元数据获取暂不可用
    return await getTorrentFromMagnet(input, useCache, verbose)
  }
}

/**
 * 从种子文件读取元数据
 *
 * 种子文件本身包含完整的元数据（文件名、大小、目录结构等），
 * 直接读取解析即可，无需网络请求，无需缓存。
 *
 * @param filePath - 种子文件路径
 * @param verbose - 是否显示详细输出
 * @returns 种子信息
 */
async function getTorrentFromFile(filePath: string, verbose: boolean): Promise<TorrentInfo> {
  log('📖 解析种子文件...', 'info')

  try {
    // 读取文件
    const data = await fs.readFile(filePath)

    // Bencode 解码
    const decoded = bencode.decode(data)
    const info = decoded.info

    if (!info) {
      throw new Error('无效的种子文件：缺少 info 字段')
    }

    const files: { fullPath: string, name: string, size: number }[] = []

    if (info.files) {
      // 多文件种子
      for (const file of info.files) {
        const filePath = file.path.map((p: Buffer) => p.toString('utf8'))
        const fileName = filePath[filePath.length - 1]
        files.push({
          fullPath: filePath.join('/'),
          name: fileName,
          size: file.length,
        })
      }
    }
    else {
      // 单文件种子
      const name = info.name.toString('utf8')
      files.push({
        fullPath: name,
        name,
        size: info.length,
      })
    }

    const result: TorrentInfo = {
      name: info.name.toString('utf8'),
      files,
    }

    log(`  找到 ${files.length} 个文件`, 'verbose', verbose)
    return result
  }
  catch (err) {
    const error = err as Error
    log(`  ❌ 解析失败: ${error.message}`, 'error', verbose)
    throw new Error(`无法解析种子文件: ${error.message}`)
  }
}

/**
 * 从缓存读取磁力链接元数据
 *
 * 磁力链接元数据的网络获取功能暂未实现。
 *
 * @param magnetLink - 磁力链接（支持完整格式、简写格式、纯hash）
 * @param useCache - 是否使用缓存
 * @param verbose - 是否显示详细输出
 * @returns 种子信息
 */
async function getTorrentFromMagnet(
  magnetLink: string,
  useCache: boolean,
  verbose: boolean,
): Promise<TorrentInfo> {
  log('🧲 解析磁力链接...', 'info')

  // 自动补全磁力链接格式
  let link = magnetLink
  if (!link.startsWith('magnet:')) {
    if (link.includes('urn:btih:')) {
      link = `magnet:?${link}`
    }
    else {
      link = `magnet:?xt=urn:btih:${link}`
    }
    log(`  自动补全: ${link}`, 'verbose', verbose)
  }

  // 获取缓存实例
  const cache = new TorrentCache()
  const cacheKey = cache.getCacheKey(link)

  // 尝试从缓存读取（只对磁力链接有效）
  if (useCache && cacheKey) {
    const cached = await cache.get(cacheKey)
    if (cached) {
      log('  ✅ 使用缓存 (永久有效)', 'success', verbose)
      return cached.data
    }
    log('  缓存未命中，磁力链接元数据获取暂未实现', 'verbose', verbose)
  }
  else if (!useCache) {
    log('  缓存已禁用，磁力链接元数据获取暂未实现', 'verbose', verbose)
  }
  else if (!cacheKey) {
    log('  无法生成缓存键，磁力链接元数据获取暂未实现', 'verbose', verbose)
  }

  // TODO: Select and implement a reliable magnet metadata retrieval strategy.
  throw new Error('磁力链接元数据获取暂未实现；目前只能读取已有缓存或使用 .torrent 文件')
}

/**
 * 从缓存获取磁力链接元数据（快捷方法）
 *
 * 用于需要快速检查缓存是否存在的场景
 *
 * @param magnetLink - 磁力链接
 * @returns 缓存的种子信息，如果不存在则返回 null
 */
export async function getCachedMagnetInfo(magnetLink: string): Promise<TorrentInfo | null> {
  const cache = new TorrentCache()
  const cacheKey = cache.getCacheKey(magnetLink)

  if (!cacheKey)
    return null

  const cached = await cache.get(cacheKey)
  return cached ? cached.data : null
}

/**
 * 预获取磁力链接元数据（待实现）
 *
 * 用于提前预热缓存，不阻塞主流程
 *
 * @param magnetLink - 磁力链接
 * @param verbose - 是否显示详细输出
 */
export async function prefetchMagnetInfo(
  magnetLink: string,
  verbose: boolean = false,
): Promise<void> {
  log(`  磁力链接元数据预获取暂未实现: ${magnetLink}`, 'warn', verbose)
}

/**
 * 检查输入是否是磁力链接（快捷方法）
 */
export function isMagnetLink(input: string): boolean {
  return input.startsWith('magnet:') || /^[a-f0-9]{40}$/i.test(input)
}

/**
 * 检查输入是否是种子文件（快捷方法）
 */
export function isTorrentFile(input: string): boolean {
  if (!existsSync(input))
    return false

  try {
    const stat = statSync(input)
    if (!stat.isFile())
      return false
  }
  catch {
    return false
  }

  const ext = path.extname(input).toLowerCase()
  if (ext === '.torrent')
    return true

  return false
}

/**
 * 从磁力链接提取 infohash
 */
export function extractInfoHash(magnetLink: string): string | null {
  const match = magnetLink.match(/urn:btih:([a-f0-9]{40})/i)
  if (match) {
    return match[1].toLowerCase()
  }
  if (/^[a-f0-9]{40}$/i.test(magnetLink)) {
    return magnetLink.toLowerCase()
  }
  return null
}
