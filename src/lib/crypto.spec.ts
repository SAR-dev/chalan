import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decryptSecret, encryptSecret } from "@/lib/crypto"

// The dev fallback key must stay exactly 32 bytes or encryptSecret throws
// "Invalid key length" (AES-256 requires a 32-byte key). These tests lock that
// in so saving a mail config keeps working on setups without SMTP_SECRET_KEY.

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    delete process.env.SMTP_SECRET_KEY
  })

  afterEach(() => {
    delete process.env.SMTP_SECRET_KEY
  })

  it("round-trips with the dev fallback key", () => {
    const encoded = encryptSecret("my-smtp-password")
    expect(encoded.startsWith("enc:v1:")).toBe(true)
    expect(decryptSecret(encoded)).toBe("my-smtp-password")
  })

  it("round-trips with a valid SMTP_SECRET_KEY", () => {
    vi.stubEnv("SMTP_SECRET_KEY", "ab".repeat(32))
    const encoded = encryptSecret("my-smtp-password")
    expect(decryptSecret(encoded)).toBe("my-smtp-password")
  })

  it("uses a fresh IV on every encryption", () => {
    delete process.env.SMTP_SECRET_KEY
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"))
    expect(decryptSecret(encryptSecret("same"))).toBe(
      decryptSecret(encryptSecret("same")),
    )
  })

  it("passes through empty and legacy plaintext values", () => {
    expect(encryptSecret("")).toBe("")
    expect(decryptSecret("plain-password")).toBe("plain-password")
  })

  it("falls back to the dev key when SMTP_SECRET_KEY is malformed", () => {
    vi.stubEnv("SMTP_SECRET_KEY", "too-short")
    const encoded = encryptSecret("secret")
    expect(decryptSecret(encoded)).toBe("secret")
  })
})
