/**
 * CLI 参数解析
 */

import type { CliOptions, InputSource } from './types.js'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

function getOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(`选项 ${option} 缺少参数值。`)
  }
  return value
}

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
        options.torrent = getOptionValue(args, i++, arg)
        break
      case '-m':
      case '--magnet':
        options.magnet = getOptionValue(args, i++, arg)
        break
      case '-i':
      case '--input':
        options.input = getOptionValue(args, i++, arg)
        break
      case '-d':
      case '--dir':
        options.dir = getOptionValue(args, i++, arg)
        break
      case '-o':
      case '--output':
        options.output = getOptionValue(args, i++, arg)
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
