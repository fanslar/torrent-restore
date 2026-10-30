/**
 * 文件操作
 */

import type { MatchResult } from './types.js'
import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { ensureDir, log } from './utils.js'

function isWithinDirectory(directory: string, candidate: string): boolean {
  const relativePath = path.relative(directory, candidate)
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
}

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

  const outputRoot = path.resolve(targetRoot)
  const baseDir = singleFileTorrent
    ? outputRoot
    : path.resolve(outputRoot, torrentName)
  const baseDirIsSafe = singleFileTorrent || isWithinDirectory(outputRoot, baseDir)

  for (const match of matched) {
    const source = match.local.fullPath
    const targetPath = path.resolve(baseDir, match.torrent.fullPath)
    const targetDir = path.dirname(targetPath)

    if (!baseDirIsSafe || !isWithinDirectory(outputRoot, targetPath)) {
      log(`  ❌ 拒绝写入输出目录之外的路径: ${targetPath}`, 'error', verbose)
      failCount++
      continue
    }

    if (dryRun) {
      successCount++
      log(`  模拟: ${source} -> ${targetPath}`, 'verbose', verbose)
      continue
    }

    try {
      await ensureDir(targetDir)
      if (operation === 'move') {
        try {
          await fs.link(source, targetPath)
          await fs.unlink(source)
        }
        catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EXDEV')
            throw err
          await fs.copyFile(source, targetPath, constants.COPYFILE_EXCL)
          await fs.unlink(source)
        }
      }
      else {
        await fs.copyFile(source, targetPath, constants.COPYFILE_EXCL)
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

  if (dryRun)
    log(`  模拟完成: ${successCount} 个文件可处理, ${failCount} 个路径被拒绝`, 'info')
  else
    log(`  成功: ${successCount}, 失败: ${failCount}`, 'info')

  return { successCount, failCount }
}
