import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isAuthorizedCron } from "./cron-auth"

const SECRET = "cron-secret-value"

function req(authorization?: string) {
  return new Request("http://localhost:3000/api/cron/cleanup-sessions", {
    headers: authorization ? { authorization } : {},
  })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.CRON_SECRET
  errorSpy.mockRestore()
})

describe("isAuthorizedCron", () => {
  it("accepts the correct bearer token", () => {
    expect(isAuthorizedCron(req(`Bearer ${SECRET}`))).toBe(true)
  })

  it("rejects a missing Authorization header", () => {
    expect(isAuthorizedCron(req())).toBe(false)
  })

  it("rejects a wrong secret", () => {
    expect(isAuthorizedCron(req("Bearer not-the-secret"))).toBe(false)
  })

  it("rejects a secret of a different length without throwing", () => {
    // Both sides are hashed before timingSafeEqual, so a length mismatch must
    // return false rather than throw.
    expect(isAuthorizedCron(req(`Bearer ${SECRET}extra`))).toBe(false)
    expect(isAuthorizedCron(req("Bearer a"))).toBe(false)
  })

  it("rejects a header without the Bearer scheme", () => {
    expect(isAuthorizedCron(req(SECRET))).toBe(false)
    expect(isAuthorizedCron(req(`Basic ${SECRET}`))).toBe(false)
  })

  it("rejects and logs when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET
    expect(isAuthorizedCron(req(`Bearer ${SECRET}`))).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })
})
