import { describe, expect, it } from "vitest"
import { REDACTED, redactAndTruncate, redactSecrets } from "@/lib/redact"

describe("redactSecrets", () => {
  it("redacts an activation link token", () => {
    const out = redactSecrets(
      "Activate: http://localhost:3000/activate?token=abc123def456",
    )
    expect(out).toBe(
      `Activate: http://localhost:3000/activate?token=${REDACTED}`,
    )
    expect(out).not.toContain("abc123def456")
  })

  it("redacts a password-reset link", () => {
    const out = redactSecrets(
      "Reset here: https://app.example.com/reset-password?token=tok_live_99&next=/dashboard",
    )
    expect(out).toContain(`token=${REDACTED}`)
    expect(out).toContain("next=/dashboard")
    expect(out).not.toContain("tok_live_99")
  })

  it("redacts codes, keys and other credential params", () => {
    for (const key of [
      "code",
      "key",
      "secret",
      "otp",
      "signature",
      "password",
    ]) {
      const out = redactSecrets(`http://x.test/a?${key}=sensitive-value`)
      expect(out, key).toBe(`http://x.test/a?${key}=${REDACTED}`)
    }
  })

  it("is case-insensitive on the parameter name", () => {
    expect(redactSecrets("http://x.test/a?Token=SECRET")).toBe(
      `http://x.test/a?Token=${REDACTED}`,
    )
  })

  it("redacts URL userinfo credentials", () => {
    const out = redactSecrets("postgres://admin:hunter2@db.internal:5432/app")
    expect(out).toBe(`postgres://${REDACTED}@db.internal:5432/app`)
    expect(out).not.toContain("hunter2")
  })

  it("redacts bearer tokens and JWTs", () => {
    expect(redactSecrets("Authorization: Bearer sk-abcdefgh12345")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    )
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"
    expect(redactSecrets(`link?j=${jwt}`)).toBe(`link?j=${REDACTED}`)
  })

  it("leaves ordinary text untouched", () => {
    const text = "Hello Amy, your parcel is on the way. Track: /track/ORD-123"
    expect(redactSecrets(text)).toBe(text)
  })
})

describe("redactAndTruncate", () => {
  it("marks the cut and reports the dropped length", () => {
    const out = redactAndTruncate("x".repeat(50), 10)
    expect(out).toBe(`${"x".repeat(10)}\n… [truncated 40 chars]`)
  })

  it("redacts before truncating", () => {
    const out = redactAndTruncate("http://x.test/?token=abcdefghij", 12)
    expect(out).not.toContain("abcdefghij")
  })

  it("leaves short text intact", () => {
    expect(redactAndTruncate("short", 100)).toBe("short")
  })
})
