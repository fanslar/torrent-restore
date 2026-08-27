/**
 * 种子文件信息
 */
export interface TorrentFile {
  /** 完整路径（相对于种子根目录） */
  fullPath: string
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
}

/**
 * 种子信息
 */
export interface TorrentInfo {
  /** 种子名称 */
  name: string
  /** 文件列表 */
  files: TorrentFile[]
}

/**
 * 本地文件信息
 */
export interface LocalFile {
  /** 完整路径 */
  fullPath: string
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
}

/**
 * 匹配结果
 */
export interface MatchResult {
  /** 种子中的文件 */
  torrent: TorrentFile
  /** 匹配到的本地文件 */
  local: LocalFile
  /** 匹配阶段：1=唯一文件匹配，2=冲突文件匹配 */
  stage: 1 | 2
  /** 匹配类型 */
  type: 'unique_exact' | 'unique_size_mismatch' | 'conflict_matched'
  /** 期望大小（仅当大小不匹配时） */
  expectedSize?: number
  /** 实际大小（仅当大小不匹配时） */
  actualSize?: number
}

/**
 * 未匹配文件
 */
export interface UnmatchedFile extends TorrentFile {
  /** 匹配阶段 */
  stage: 1 | 2
  /** 未匹配原因 */
  reason: string
}

/**
 * 文件树节点
 */
export interface FileTreeNode {
  /** 节点名称 */
  name: string
  /** 节点类型 */
  type: 'directory' | 'file'
  /** 子节点 */
  children: FileTreeNode[]
  /** 是否已匹配（仅文件） */
  matched?: boolean
  /** 是否未匹配（仅文件） */
  unmatched?: boolean
  /** 文件大小（仅文件） */
  size?: number
  /** 匹配阶段（仅文件） */
  stage?: number
  /** 匹配类型详情（仅文件） */
  type_detail?: string
  /** 本地文件名（仅文件） */
  localName?: string
  /** 期望大小（仅文件） */
  expectedSize?: number
  /** 实际大小（仅文件） */
  actualSize?: number
  /** 统计信息（仅根节点） */
  stats?: {
    total: number
    matched: number
    unmatched: number
  }
}

/**
 * 缓存元数据
 */
export interface CacheMeta {
  /** 缓存版本 */
  version: string
  /** 缓存项 */
  items: Record<string, {
    /** 缓存时间戳 */
    timestamp: number
    /** 缓存大小（字节） */
    size: number
  }>
}

/**
 * 缓存的种子数据
 */
export interface CachedTorrent {
  /** 种子数据 */
  data: TorrentInfo
  /** 缓存时间 */
  _cachedAt: string
  /** 数据来源 */
  _source: string
}

/**
 * CLI 选项
 */
export interface CliOptions {
  /** 输入（自动识别） */
  input?: string
  /** 种子文件路径 */
  torrent?: string
  /** 磁力链接 */
  magnet?: string
  /** 本地目录 */
  dir: string
  /** 输出目录 */
  output?: string
  /** 详细输出 */
  verbose: boolean
  /** 移动文件（而非复制） */
  move: boolean
  /** 模拟运行 */
  dryRun: boolean
  /** 禁用缓存 */
  noCache: boolean
  /** 清空缓存 */
  clearCache: boolean
  /** 显示帮助 */
  help: boolean
}

/**
 * 输入源
 */
export interface InputSource {
  /** 输入类型 */
  type: 'torrent' | 'magnet' | 'auto'
  /** 输入值 */
  value: string
}
