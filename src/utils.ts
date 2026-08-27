/**
 * 工具函数
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`
}

/**
 * 带颜色的日志输出
 */
export function log(
  msg: string,
  level: 'info' | 'verbose' | 'success' | 'error' | 'warn' = 'info',
  verbose: boolean = false,
): void {
  if (level === 'verbose' && !verbose)
    return

  switch (level) {
    case 'verbose':
      console.log(chalk.gray(msg))
      break
    case 'success':
      console.log(chalk.green(msg))
      break
    case 'error':
      console.log(chalk.red(msg))
      break
    case 'warn':
      console.log(chalk.yellow(msg))
      break
    default:
      console.log(msg)
  }
}

/**
 * 安全地获取文件大小
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath)
    return stat.size
  }
  catch {
    return null
  }
}

/**
 * 检查文件是否存在
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath)
}

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

/**
 * 获取文件扩展名（小写）
 */
export function getExt(filename: string): string {
  return path.extname(filename).toLowerCase()
}

/**
 * 获取文件名（不含扩展名）
 */
export function getBaseName(filename: string): string {
  return path.parse(filename).name
}

/**
 * 获取文件的目录路径
 */
export function getDirName(filepath: string): string {
  return path.dirname(filepath)
}

/**
 * 获取文件名（含扩展名）
 */
export function getFileName(filepath: string): string {
  return path.basename(filepath)
}

/**
 * 安全地读取 JSON 文件
 */
export async function readJSONFile<T>(filePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  }
  catch {
    return null
  }
}

/**
 * 安全地写入 JSON 文件
 */
export async function writeJSONFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}
