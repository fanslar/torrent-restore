#!/usr/bin/env node

/**
 * torrent-restore - 种子文件结构恢复工具
 * 将百度网盘下载的平铺文件，按种子原始目录结构重新组织
 */

import path from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { TorrentCache } from './cache.js'
import { getInputSource, parseArgs } from './cli.js'
import { executeFileOperations, scanLocalFiles } from './files.js'
import { matchConflictFiles, matchUniqueFiles } from './matcher.js'
import { getTorrentInfo } from './torrent.js'
import { buildFileTree, printTree } from './tree.js'
import { formatSize, log } from './utils.js'

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
${chalk.bold('📦 torrent-restore - 种子文件结构恢复工具')}

${chalk.yellow('描述:')}
  将百度网盘下载的平铺文件，按种子原始目录结构重新组织。
  磁力链接元数据获取暂未实现；已有缓存仍可读取。

${chalk.yellow('用法:')}
  torrent-restore -t <种子文件> [选项]
  torrent-restore -m <磁力链接> [选项]
  torrent-restore -i <输入> [选项]        # 自动识别类型

${chalk.yellow('输入参数:')}
  -t, --torrent <文件>    种子文件路径
  -m, --magnet <链接>     磁力链接 (支持完整/简写/hash)
  -i, --input <输入>      自动识别类型 (torrent/magnet)

${chalk.yellow('可选参数:')}
  -d, --dir <目录>        本地下载目录 (默认: ./)
  -o, --output <目录>     输出目录 (默认: ../<种子名>)
  -v, --verbose           显示详细输出
  --move                  移动文件 (默认: 复制)
  --dry-run               模拟运行 (默认: 实际执行)
  --no-cache              忽略已有缓存（磁力链接元数据获取暂未实现）
  --clear-cache           清空所有缓存
  -h, --help              显示帮助信息

${chalk.yellow('缓存说明:')}
  已有磁力链接元数据缓存在:
  ${chalk.gray('~/.cache/torrent-restore/')}

${chalk.yellow('示例:')}
  # 使用种子文件
  torrent-restore -t example.torrent

  # 使用磁力链接
  torrent-restore -m "magnet:?xt=urn:btih:abc123..."

  # 自动识别
  torrent-restore -i example.torrent
  torrent-restore -i "abc123def456..."

  # 指定目录
  torrent-restore -t example.torrent -d ./downloads -o ./organized

  # 模拟运行
  torrent-restore -t example.torrent --dry-run
`)
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  if (options.help || args.length === 0) {
    showHelp()
    return
  }

  const startTime = process.hrtime.bigint()

  // 处理清空缓存
  if (options.clearCache) {
    const cache = new TorrentCache()
    await cache.clear()
    console.log(chalk.green('✅ 缓存已清空'))
    return
  }

  // 获取输入源
  const source = getInputSource(options)
  if (!source) {
    console.error(chalk.red('❌ 需要指定 -t/--torrent、-m/--magnet 或 -i/--input (使用 -h 查看帮助)'))
    process.exit(1)
  }

  // 解析路径
  const localDir = path.resolve(options.dir)

  console.log(chalk.blue.bold('\n🚀 torrent-restore 开始...\n'))

  log(`输入: ${source.value}`, 'verbose', options.verbose)
  log(`类型: ${source.type}`, 'verbose', options.verbose)
  log(`目录: ${localDir}`, 'verbose', options.verbose)
  log(`模式: ${options.dryRun ? '模拟运行' : '实际执行'}, ${options.move ? '移动' : '复制'}`, 'verbose', options.verbose)

  // 1. 获取种子信息
  const torrent = await getTorrentInfo(
    source.value,
    source.type,
    !options.noCache,
    options.verbose,
  )

  console.log(`  种子: ${chalk.cyan(torrent.name)}`)
  console.log(`  文件: ${torrent.files.length} 个`)

  if (options.verbose)
    console.log('')

  // 2. 扫描本地文件
  console.log(chalk.blue('🔍 扫描本地文件...'))
  const localFiles = await scanLocalFiles(localDir)
  console.log(`  找到 ${localFiles.length} 个文件`)

  if (options.verbose)
    console.log('')

  // 3. 第一阶段：匹配唯一文件名
  console.log(chalk.blue('📌 第一阶段: 匹配唯一文件名...'))
  const stage1 = matchUniqueFiles(torrent.files, localFiles)
  console.log(`  ✅ ${stage1.matched.length} 匹配, ❌ ${stage1.unmatched.length} 未匹配, ⚠️ ${stage1.conflictFiles.length} 冲突`)

  if (options.verbose)
    console.log('')

  // 4. 第二阶段：匹配冲突文件
  console.log(chalk.blue('📌 第二阶段: 匹配冲突文件...'))
  const stage2 = matchConflictFiles(
    stage1.conflictFiles,
    localFiles,
    stage1.usedLocalNames,
  )
  console.log(`  ✅ ${stage2.matched.length} 匹配, ❌ ${stage2.unmatched.length} 未匹配`)

  if (options.verbose)
    console.log('')

  // 5. 汇总
  const allMatched = [...stage1.matched, ...stage2.matched]
  const allUnmatched = [...stage1.unmatched, ...stage2.unmatched]

  const totalTime = Number(process.hrtime.bigint() - startTime) / 1e6

  console.log(chalk.blue('📊 匹配结果:'))
  console.log(`  ${chalk.green('✓ 匹配')}: ${allMatched.length}`)
  console.log(`  ${chalk.red('✗ 未匹配')}: ${allUnmatched.length}`)
  console.log(`  📈 匹配率: ${(allMatched.length / torrent.files.length * 100).toFixed(1)}%`)
  console.log(`  ⏱️  耗时: ${totalTime.toFixed(1)}ms`)

  if (options.verbose)
    console.log('')

  // 6. 执行文件操作
  if (allMatched.length > 0) {
    const outputBase = options.output
      ? path.resolve(options.output)
      : path.resolve(path.dirname(localDir))

    console.log(chalk.blue('📦 文件操作:'))
    console.log(`  来源: ${localDir}`)
    console.log(`  目标: ${chalk.cyan(path.join(outputBase, torrent.name))}`)
    console.log(`  模式: ${options.dryRun ? chalk.yellow('模拟运行') : chalk.green('实际执行')}`)
    console.log(`  操作: ${options.move ? '移动' : '复制'}`)

    if (options.verbose)
      console.log('')

    await executeFileOperations(
      allMatched,
      outputBase,
      torrent.name,
      options.move ? 'move' : 'copy',
      options.dryRun,
      options.verbose,
      torrent.files.length === 1 && torrent.files[0].fullPath === torrent.name,
    )

    if (options.verbose)
      console.log('')
  }

  // 7. 显示文件树（verbose 或 有未匹配时显示）
  if (options.verbose || allUnmatched.length > 0) {
    const tree = buildFileTree(torrent.files, allMatched, allUnmatched)
    console.log(chalk.bold('📁 文件结构:'))
    printTree(tree, '', true, options.verbose)
    if (options.verbose)
      console.log('')
  }

  // 8. 未匹配列表
  if (allUnmatched.length > 0) {
    console.log(chalk.yellow.bold('\n❌ 未匹配的文件:'))
    const showCount = options.verbose ? allUnmatched.length : Math.min(5, allUnmatched.length)
    for (let i = 0; i < showCount; i++) {
      const file = allUnmatched[i]
      console.log(`  ${chalk.red('✗')} ${file.name} [${formatSize(file.size)}] ${chalk.gray(file.reason || '')}`)
    }
    if (allUnmatched.length > showCount) {
      console.log(`  ... 还有 ${allUnmatched.length - showCount} 个 (使用 -v 查看全部)`)
    }
  }

  // 9. 提示
  if (allUnmatched.length > 0) {
    console.log(chalk.yellow('\n💡 未匹配的文件需要手动处理'))
  }
  if (options.dryRun && allMatched.length > 0) {
    console.log(chalk.yellow(`💡 移除 --dry-run 参数实际执行${options.move ? '移动' : '复制'}操作`))
  }

  console.log(`\n${chalk.green('✅ 完成！\n')}`)
}

// 执行
main().catch((err) => {
  console.error(chalk.red('❌ 错误:'), err)
  process.exit(1)
})
