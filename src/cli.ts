/**
 * CLI 参数解析
 */

import type { CliOptions, InputSource } from './types.js'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * 解析命令行参数
 */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dir: './',
    verbose: false,
    move: false,
    dryRun: false,
    noCache: false,
    clearCache: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '-t':
      case '--torrent':
        options.torrent = args[++i]
        break
      case '-m':
      case '--magnet':
        options.magnet = args[++i]
        break
      case '-i':
      case '--input':
        options.input = args[++i]
        break
      case '-d':
      case '--dir':
        options.dir = args[++i]
        break
      case '-o':
      case '--output':
        options.output = args[++i]
        break
      case '-v':
      case '--verbose':
        options.verbose = true
        break
      case '--move':
        options.move = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--no-cache':
        options.noCache = true
        break
      case '--clear-cache':
        options.clearCache = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        // 未知参数忽略
        break
    }
  }

  return options
}

/**
 * 获取输入源
 * 优先级: -t > -m > -i
 */
export function getInputSource(options: CliOptions): InputSource | null {
  if (options.torrent) {
    return { type: 'torrent', value: options.torrent }
  }
  if (options.magnet) {
    return { type: 'magnet', value: options.magnet }
  }
  if (options.input) {
    return { type: 'auto', value: options.input }
  }
  return null
}

/**
 * 检测输入类型
 */
export function detectInputType(input: string): 'torrent' | 'magnet' {
  // 磁力链接
  if (input.startsWith('magnet:') || input.includes('urn:btih:')) {
    return 'magnet'
  }

  // 纯 hash (40位十六进制)
  if (/^[a-f0-9]{40}$/i.test(input)) {
    return 'magnet'
  }

  // 纯 hash (32位十六进制)
  if (/^[a-f0-9]{32}$/i.test(input)) {
    return 'magnet'
  }

  // 检查是否是文件
  if (existsSync(input)) {
    const stat = statSync(input)
    if (stat.isFile()) {
      // 检查扩展名
      if (path.extname(input).toLowerCase() === '.torrent') {
        return 'torrent'
      }
    }
  }

  // 默认当作磁力链接
  return 'magnet'
}
