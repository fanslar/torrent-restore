import { describe, expect, it } from 'vitest'
import { matchUniqueFiles } from '../src/matcher.js'

describe('matchUniqueFiles', () => {
  it('does not match a same-name file with a different size', () => {
    const result = matchUniqueFiles(
      [{ fullPath: 'movie.mkv', name: 'movie.mkv', size: 100 }],
      [{ fullPath: '/downloads/movie.mkv', name: 'movie.mkv', size: 50 }],
    )

    expect(result.matched).toEqual([])
    expect(result.unmatched).toEqual([{
      fullPath: 'movie.mkv',
      name: 'movie.mkv',
      size: 100,
      stage: 1,
      reason: '文件大小不匹配 (期望: 100，实际: 50)',
    }])
    expect(result.usedLocalNames.size).toBe(0)
  })

  it('prefers an exact-size file when same-name candidates differ in size', () => {
    const result = matchUniqueFiles(
      [{ fullPath: 'movie.mkv', name: 'movie.mkv', size: 100 }],
      [
        { fullPath: '/downloads/wrong/movie.mkv', name: 'movie.mkv', size: 50 },
        { fullPath: '/downloads/right/movie.mkv', name: 'movie.mkv', size: 100 },
      ],
    )

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].local.fullPath).toBe('/downloads/right/movie.mkv')
    expect(result.unmatched).toEqual([])
  })
})
