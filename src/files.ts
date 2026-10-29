/**
 * 文件操作
 */

import type { MatchResult } from './types.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { ensureDir, log } from './utils.js'

/**
 * 扫描本地文件
 */
export async function scanLocalFiles(dir: string): Promise<import('./types.js').LocalFile[]> {
  const files: import('./types.js').LocalFile[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(dir, entry.name)
        try {
          const stat = await fs.stat(fullPath)
          files.push({
            fullPath,
            name: entry.name,
            size: stat.size,
          })
        }
        catch {
          // 忽略无法读取的文件
        }
      }
    }
  }
  catch (err) {
    console.error(chalk.red('❌ 无法扫描目录:'), (err as Error).message)
    process.exit(1)
  }

  return files
}

/**
 * 执行文件操作（复制或移动）
 */
export async function executeFileOperations(
  matched: MatchResult[],
  targetRoot: string,
  torrentName: string,
  operation: 'copy' | 'move',
  dryRun: boolean,
  verbose: boolean = false,
  singleFileTorrent: boolean = false,
): Promise<{ successCount: number, failCount: number }> {
  log(`📦 ${operation === 'move' ? '移动' : '复制'}文件...`, 'info')

  let successCount = 0
  let failCount = 0

  const baseDir = singleFileTorrent ? targetRoot : path.join(targetRoot, torrentName)

  if (dryRun) {
    log(`  模拟: 将处理 ${matched.length} 个文件`, 'verbose', verbose)
    return { successCount: matched.length, failCount: 0 }
  }

  // 确保输出目录存在
  await ensureDir(baseDir)

  for (const match of matched) {
    const source = match.local.fullPath
    const targetPath = path.join(baseDir, match.torrent.fullPath)
    const targetDir = path.dirname(targetPath)

    try {
      await ensureDir(targetDir)
      if (operation === 'move') {
        await fs.rename(source, targetPath)
      }
      else {
        await fs.copyFile(source, targetPath)
      }
      successCount++
      if (verbose) {
        log(`  ✅ ${path.basename(source)} -> ${targetPath}`, 'verbose', verbose)
      }
    }
    catch (err) {
      log(`  ❌ 失败: ${source} -> ${targetPath}: ${(err as Error).message}`, 'error', verbose)
      failCount++
    }
  }

  log(`  成功: ${successCount}, 失败: ${failCount}`, 'info')
  return { successCount, failCount }
}
