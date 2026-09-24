import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM encryption for secrets at rest (e.g. SMTP credentials).
//
// The key comes from SMTP_SECRET_KEY (hex, 64 chars = 32 bytes). When unset we
// fall back to a fixed development key so local setups keep working — this must
// NOT be relied on in production, where the env var is required.
const ALGO = "aes-256-gcm"
const PREFIX = "enc:v1:"
const DEV_KEY = Buffer.from("kikuya-chalan-dev-only-secret-key-0000", "utf8") // 32 bytes

function getKey(): Buffer {
  const hex = process.env.SMTP_SECRET_KEY
  if (hex && hex.length === 64) {
    return Buffer.from(hex, "hex")
  }
  if (hex) {
    console.warn("[crypto] SMTP_SECRET_KEY must be 64 hex chars; falling back to dev key")
  }
  return DEV_KEY
}

/** Encrypt a plaintext secret. Returns `enc:v1:<iv+tag+ciphertext>` base64. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

/**
 * Decrypt a `enc:v1:` value. Legacy rows stored before encryption are passed
 * through untouched so existing installs keep working until re-saved.
 */
export function decryptSecret(encoded: string): string {
  if (!encoded.startsWith(PREFIX)) return encoded
  const key = getKey()
  const buf = Buffer.from(encoded.slice(PREFIX.length), "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  try {
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    )
  } catch (err) {
    console.error("[crypto] Failed to decrypt secret:", err)
    throw new Error("Failed to decrypt stored secret")
  }
}