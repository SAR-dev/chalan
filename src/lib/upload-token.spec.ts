import { beforeEach, describe, expect, it } from "vitest"
import { createUploadToken, verifyUploadToken } from "@/lib/upload-token"

const SECRET = "x".repeat(32)

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = SECRET
})

describe("upload tokens", () => {
  it("round-trips a freshly created token", () => {
    const { token, expiresAt } = createUploadToken("nids")
    expect(verifyUploadToken(token, "nids")).toBe(true)
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it("rejects a token for a different scope", () => {
    const { token } = createUploadToken("nids")
    // Same signature, different scope label → must not verify.
    expect(verifyUploadToken(token, "avatars" as never)).toBe(false)
  })

  it("rejects a tampered signature", () => {
    const { token } = createUploadToken("nids")
    const [scope, exp] = token.split(".")
    expect(verifyUploadToken(`${scope}.${exp}.${"0".repeat(64)}`, "nids")).toBe(
      false,
    )
  })

  it("rejects an expired token", () => {
    const { token } = createUploadToken("nids", -1)
    expect(verifyUploadToken(token, "nids")).toBe(false)
  })

  it("rejects malformed and missing tokens", () => {
    expect(verifyUploadToken("", "nids")).toBe(false)
    expect(verifyUploadToken(null, "nids")).toBe(false)
    expect(verifyUploadToken(undefined, "nids")).toBe(false)
    expect(verifyUploadToken("nids.notanumber.abc", "nids")).toBe(false)
    expect(verifyUploadToken("nids.9999999999", "nids")).toBe(false)
  })

  it("rejects a token signed with a different secret", () => {
    const { token } = createUploadToken("nids")
    process.env.BETTER_AUTH_SECRET = "y".repeat(32)
    expect(verifyUploadToken(token, "nids")).toBe(false)
  })
})
