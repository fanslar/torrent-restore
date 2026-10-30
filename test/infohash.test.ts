import { describe, expect, it } from 'vitest'
import { TorrentCache } from '../src/cache.js'
import { detectInputType } from '../src/cli.js'
import { extractInfoHash, isMagnetLink } from '../src/torrent.js'

const hexHash = '0123456789abcdef0123456789abcdef01234567'
const base32Hash = 'AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH'

describe('btih info hash formats', () => {
  it('normalizes Base32 magnet hashes to canonical lowercase hex', () => {
    expect(extractInfoHash(`magnet:?xt=urn:btih:${base32Hash}`)).toBe(hexHash)
    expect(extractInfoHash(base32Hash.toLowerCase())).toBe(hexHash)
  })

  it('detects Base32 hash input as a magnet', () => {
    expect(detectInputType(base32Hash)).toBe('magnet')
    expect(isMagnetLink(base32Hash)).toBe(true)
  })

  it('uses the same cache entry for Base32 and hex representations', () => {
    const cache = new TorrentCache()
    expect(cache.getCacheKey(base32Hash)).toBe(`magnet:${hexHash}`)
    expect(cache.getCacheKey(`magnet:?xt=urn:btih:${base32Hash}`)).toBe(`magnet:${hexHash}`)
    expect(cache.getCacheKey(hexHash)).toBe(`magnet:${hexHash}`)
  })

  it('rejects invalid Base32 hashes', () => {
    expect(extractInfoHash('AERUKZ4JVPG66AJDIVTYTK6N54ASGRL0')).toBeNull()
    expect(extractInfoHash(base32Hash.slice(1))).toBeNull()
  })
})
