import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/cli.js'

describe('parseArgs', () => {
  it.each(['-t', '--torrent', '-m', '--magnet', '-i', '--input', '-d', '--dir', '-o', '--output'])(
    'reports a missing value for %s',
    (option) => {
      expect(() => parseArgs([option])).toThrow(`选项 ${option} 缺少参数值。`)
    },
  )

  it('does not consume another option as a value', () => {
    expect(() => parseArgs(['--dir', '--verbose'])).toThrow('选项 --dir 缺少参数值。')
  })

  it('accepts values for options that require them', () => {
    expect(parseArgs(['--torrent', 'file.torrent', '--dir', 'downloads', '--output', 'organized'])).toMatchObject({
      torrent: 'file.torrent',
      dir: 'downloads',
      output: 'organized',
    })
  })
})
