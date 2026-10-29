/**
 * 文件匹配逻辑
 */

import type { LocalFile, MatchResult, TorrentFile, UnmatchedFile } from './types.js'
import path from 'node:path'

/**
 * 第一阶段：匹配唯一文件名
 */
export function matchUniqueFiles(
  torrentFiles: TorrentFile[],
  localFiles: LocalFile[],
): {
  matched: MatchResult[]
  unmatched: UnmatchedFile[]
  conflictFiles: TorrentFile[]
  usedLocalNames: Set<string>
  usedLocalSizes: Set<number>
} {
  // 统计文件名出现次数
  const nameCount = new Map<string, number>()
  for (const file of torrentFiles) {
    nameCount.set(file.name, (nameCount.get(file.name) || 0) + 1)
  }

  // 分离唯一文件和冲突文件
  const uniqueFiles: TorrentFile[] = []
  const conflictFiles: TorrentFile[] = []
  for (const file of torrentFiles) {
    if ((nameCount.get(file.name) || 0) === 1) {
      uniqueFiles.push(file)
    }
    else {
      conflictFiles.push(file)
    }
  }

  // 建立本地文件名索引
  const localByName = new Map<string, LocalFile[]>()
  for (const file of localFiles) {
    if (!localByName.has(file.name)) {
      localByName.set(file.name, [])
    }
    localByName.get(file.name)!.push(file)
  }

  const matched: MatchResult[] = []
  const unmatched: UnmatchedFile[] = []
  const usedLocalNames = new Set<string>()
  const usedLocalSizes = new Set<number>()

  for (const torrentFile of uniqueFiles) {
    const candidates = localByName.get(torrentFile.name) || []
    const available = candidates.filter(f => !usedLocalNames.has(f.fullPath))

    if (available.length === 0) {
      unmatched.push({
        ...torrentFile,
        stage: 1,
        reason: '本地未找到',
      })
      continue
    }

    const match = available.find(file => file.size === torrentFile.size)
    if (!match) {
      unmatched.push({
        ...torrentFile,
        stage: 1,
        reason: `文件大小不匹配 (期望: ${torrentFile.size}，实际: ${available[0].size})`,
      })
      continue
    }

    matched.push({
      torrent: torrentFile,
      local: match,
      stage: 1,
      type: 'unique_exact',
    })
    usedLocalNames.add(match.fullPath)
    usedLocalSizes.add(match.size)
  }

  return {
    matched,
    unmatched,
    conflictFiles,
    usedLocalNames,
    usedLocalSizes,
  }
}

/**
 * 第二阶段：匹配冲突文件
 */
export function matchConflictFiles(
  conflictFiles: TorrentFile[],
  localFiles: LocalFile[],
  usedLocalNames: Set<string>,
): {
  matched: MatchResult[]
  unmatched: UnmatchedFile[]
} {
  if (conflictFiles.length === 0) {
    return { matched: [], unmatched: [] }
  }

  const matched: MatchResult[] = []
  const unmatched: UnmatchedFile[] = []

  // 按大小索引可用文件
  const sizeIndex = new Map<number, LocalFile[]>()
  for (const file of localFiles) {
    if (!usedLocalNames.has(file.fullPath)) {
      if (!sizeIndex.has(file.size)) {
        sizeIndex.set(file.size, [])
      }
      sizeIndex.get(file.size)!.push(file)
    }
  }

  for (const torrentFile of conflictFiles) {
    const candidates = sizeIndex.get(torrentFile.size) || []

    if (candidates.length === 0) {
      unmatched.push({
        ...torrentFile,
        stage: 2,
        reason: '无匹配大小的文件',
      })
      continue
    }

    const torrentBase = path.parse(torrentFile.name).name
    const torrentExt = path.parse(torrentFile.name).ext

    let bestMatch: LocalFile | null = null
    for (const file of candidates) {
      if (path.extname(file.name) !== torrentExt)
        continue
      if (file.name.startsWith(torrentBase)) {
        bestMatch = file
        break
      }
    }

    if (bestMatch) {
      matched.push({
        torrent: torrentFile,
        local: bestMatch,
        stage: 2,
        type: 'conflict_matched',
      })
      const idx = sizeIndex.get(torrentFile.size)!.indexOf(bestMatch)
      if (idx !== -1) {
        sizeIndex.get(torrentFile.size)!.splice(idx, 1)
      }
      usedLocalNames.add(bestMatch.fullPath)
    }
    else {
      unmatched.push({
        ...torrentFile,
        stage: 2,
        reason: `文件名不匹配 (${candidates.length}个同大小文件)`,
      })
    }
  }

  return { matched, unmatched }
}
