import { createHmac } from "node:crypto"

/**
 * Minimal RFC-6238 TOTP implementation for tests (HMAC-SHA1, 6 digits,
 * 30-second step — the defaults Better Auth's twoFactor plugin uses).
 * Hand-rolled on purpose: no test-only dependencies.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Decode(value: string): Buffer {
  const clean = value.replace(/=+$/, "").toUpperCase()
  let buffer = 0
  let bits = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

export function totp(
  secret: string,
  at: number = Date.now(),
  period = 30,
  digits = 6,
): string {
  const counter = Math.floor(at / 1000 / period)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", base32Decode(secret))
    .update(message)
    .digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, "0")
}
