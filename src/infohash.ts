const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(value: string): string | null {
  if (!/^[A-Z2-7]{32}$/i.test(value))
    return null

  let accumulator = 0
  let bits = 0
  let hex = ''

  for (const character of value.toUpperCase()) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      hex += ((accumulator >> bits) & 0xFF).toString(16).padStart(2, '0')
      accumulator &= (1 << bits) - 1
    }
  }

  return hex.length === 40 ? hex : null
}

/**
 * Normalizes a 40-character hex or 32-character Base32 BTIH to lowercase hex.
 */
export function extractInfoHash(input: string): string | null {
  const value = input.trim()
  const match = value.match(/urn:btih:([a-z0-9]{32,40})/i)
  const hash = match?.[1] ?? value

  if (/^[a-f0-9]{40}$/i.test(hash))
    return hash.toLowerCase()

  return decodeBase32(hash)
}

export function isInfoHash(input: string): boolean {
  return extractInfoHash(input) !== null
}
