import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeFileOperations } from '../src/files.js'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('executeFileOperations', () => {
  it('writes a single-file torrent directly under the output directory', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'movie.mkv')
    const outputDir = path.join(tempDir, 'output')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'video')

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: 'movie.mkv', name: 'movie.mkv', size: 5 },
        local: { fullPath: sourcePath, name: 'movie.mkv', size: 5 },
        stage: 1,
        type: 'unique_exact',
      }],
      outputDir,
      'movie.mkv',
      'copy',
      false,
      false,
      true,
    )

    expect(result).toEqual({ successCount: 1, failCount: 0 })
    await expect(fs.readFile(path.join(outputDir, 'movie.mkv'), 'utf8')).resolves.toBe('video')
    await expect(fs.access(path.join(outputDir, 'movie.mkv', 'movie.mkv'))).rejects.toThrow()
  })

  it('keeps the torrent directory for multi-file torrents', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'episode.mkv')
    const outputDir = path.join(tempDir, 'output')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'episode')

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: 'Season 1/episode.mkv', name: 'episode.mkv', size: 7 },
        local: { fullPath: sourcePath, name: 'episode.mkv', size: 7 },
        stage: 1,
        type: 'unique_exact',
      }],
      outputDir,
      'Show',
      'copy',
      false,
    )

    expect(result).toEqual({ successCount: 1, failCount: 0 })
    await expect(fs.readFile(path.join(outputDir, 'Show', 'Season 1', 'episode.mkv'), 'utf8')).resolves.toBe('episode')
  })

  it.each(['copy', 'move'] as const)('does not overwrite an existing destination when using %s', async (operation) => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'file.txt')
    const outputPath = path.join(tempDir, 'output', 'Show', 'file.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(sourcePath, 'new content')
    await fs.writeFile(outputPath, 'existing content')

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: 'file.txt', name: 'file.txt', size: 11 },
        local: { fullPath: sourcePath, name: 'file.txt', size: 11 },
        stage: 1,
        type: 'unique_exact',
      }],
      path.join(tempDir, 'output'),
      'Show',
      operation,
      false,
    )

    expect(result).toEqual({ successCount: 0, failCount: 1 })
    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('existing content')
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('new content')
  })

  it.each(['parent traversal', 'absolute path'])('rejects a %s in the torrent file path', async (pathType) => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'file.txt')
    const outputDir = path.join(tempDir, 'output')
    const torrentPath = pathType === 'parent traversal'
      ? '../../outside.txt'
      : path.join(tempDir, 'outside.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'content')

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: torrentPath, name: 'file.txt', size: 7 },
        local: { fullPath: sourcePath, name: 'file.txt', size: 7 },
        stage: 1,
        type: 'unique_exact',
      }],
      outputDir,
      'Show',
      'copy',
      false,
    )

    expect(result).toEqual({ successCount: 0, failCount: 1 })
    await expect(fs.access(path.resolve(outputDir, 'Show', torrentPath))).rejects.toThrow()
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('content')
  })

  it('rejects a destination directory symlink that escapes the output root', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'file.txt')
    const outputDir = path.join(tempDir, 'output')
    const outsideDir = path.join(tempDir, 'outside')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.mkdir(path.join(outputDir, 'Show'), { recursive: true })
    await fs.mkdir(outsideDir)
    await fs.writeFile(sourcePath, 'content')
    await fs.symlink(outsideDir, path.join(outputDir, 'Show', 'linked'))

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: 'linked/file.txt', name: 'file.txt', size: 7 },
        local: { fullPath: sourcePath, name: 'file.txt', size: 7 },
        stage: 1,
        type: 'unique_exact',
      }],
      outputDir,
      'Show',
      'copy',
      false,
    )

    expect(result).toEqual({ successCount: 0, failCount: 1 })
    await expect(fs.access(path.join(outsideDir, 'file.txt'))).rejects.toThrow()
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('content')
  })

  it('rejects a torrent name that escapes the output directory', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'torrent-restore-files-'))
    const sourcePath = path.join(tempDir, 'source', 'file.txt')
    const outputDir = path.join(tempDir, 'output')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'content')

    const result = await executeFileOperations(
      [{
        torrent: { fullPath: 'file.txt', name: 'file.txt', size: 7 },
        local: { fullPath: sourcePath, name: 'file.txt', size: 7 },
        stage: 1,
        type: 'unique_exact',
      }],
      outputDir,
      '../outside',
      'copy',
      false,
    )

    expect(result).toEqual({ successCount: 0, failCount: 1 })
    await expect(fs.access(path.join(tempDir, 'outside', 'file.txt'))).rejects.toThrow()
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('content')
  })
})
