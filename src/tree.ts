/**
 * 文件树生成
 */

import type { FileTreeNode, MatchResult, TorrentFile, UnmatchedFile } from './types.js'
import chalk from 'chalk'
import { formatSize } from './utils.js'

/**
 * 构建文件树
 */
export function buildFileTree(
  torrentFiles: TorrentFile[],
  matched: MatchResult[],
  unmatched: UnmatchedFile[],
): FileTreeNode {
  const matchMap = new Map<string, MatchResult>()
  const unmatchedSet = new Set<string>()

  for (const m of matched) {
    matchMap.set(m.torrent.fullPath, m)
  }
  for (const u of unmatched) {
    unmatchedSet.add(u.fullPath)
  }

  const tree: FileTreeNode = {
    name: 'root',
    type: 'directory',
    children: [],
    stats: {
      total: torrentFiles.length,
      matched: matched.length,
      unmatched: unmatched.length,
    },
  }

  const nodeCache = new Map<string, FileTreeNode>()
  nodeCache.set('', tree)

  for (const file of torrentFiles) {
    const parts = file.fullPath.split('/')
    let current = tree
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const cacheKey = `${currentPath}/${part}`

      let child = nodeCache.get(cacheKey)
      if (!child) {
        child = {
          name: part,
          type: isFile ? 'file' : 'directory',
          children: [],
        }
        if (isFile) {
          child.matched = matchMap.has(file.fullPath)
          child.unmatched = unmatchedSet.has(file.fullPath)
          child.size = file.size
          const match = matchMap.get(file.fullPath)
          if (match) {
            child.stage = match.stage
            child.type_detail = match.type
            child.localName = match.local.name
            if (match.expectedSize !== undefined) {
              child.expectedSize = match.expectedSize
              child.actualSize = match.actualSize
            }
          }
        }
        current.children.push(child)
        nodeCache.set(cacheKey, child)
      }
      current = child
      currentPath = cacheKey
    }
  }

  return tree
}

/**
 * 打印文件树
 */
export function printTree(
  tree: FileTreeNode,
  prefix: string = '',
  isLast: boolean = true,
  verbose: boolean = false,
): void {
  if (!tree)
    return

  const connector = prefix ? (isLast ? '└── ' : '├── ') : ''
  const indent = prefix ? (isLast ? '    ' : '│   ') : ''

  if (tree.type === 'file') {
    const color = tree.matched ? chalk.green : chalk.red
    const marker = tree.matched ? '✓' : '✗'
    let detail = ` [${formatSize(tree.size || 0)}]`
    if (tree.matched && tree.localName) {
      detail += chalk.gray(` -> ${tree.localName}`)
      if (tree.stage === 1 && tree.type_detail === 'unique_size_mismatch') {
        detail += chalk.yellow(` ⚠ 大小不匹配 (期望: ${formatSize(tree.expectedSize || 0)})`)
      }
      if (tree.stage === 2) {
        detail += chalk.blue(' [冲突]')
      }
    }
    if (tree.unmatched) {
      detail += chalk.gray(' ❌')
    }
    console.log(`${prefix}${connector}${color(tree.name)} ${marker}${detail}`)
  }
  else if (tree.type === 'directory') {
    console.log(`${prefix}${connector}${chalk.cyan(tree.name)}`)
    const children = tree.children || []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const isLastChild = i === children.length - 1
      const childPrefix = prefix + indent
      printTree(child, childPrefix, isLastChild, verbose)
    }
  }
  else {
    // root
    if (tree.stats) {
      console.log(chalk.bold(`📁 ${tree.name}`))
      console.log(chalk.gray(`  匹配: ${tree.stats.matched}/${tree.stats.total} (${(tree.stats.matched / tree.stats.total * 100).toFixed(1)}%)`))
    }
    const children = tree.children || []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const isLastChild = i === children.length - 1
      printTree(child, '', isLastChild, verbose)
    }
  }
}
