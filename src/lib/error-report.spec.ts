import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isErrorReportingEnabled, reportError } from "./error-report"

const fetchSpy = vi.fn(
  async (_url: string | URL | Request, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({}) as Promise<unknown>,
  }),
)

function withWebhook(url?: string): void {
  if (url === undefined) delete process.env.ERROR_WEBHOOK_URL
  else process.env.ERROR_WEBHOOK_URL = url
}

const original = process.env.ERROR_WEBHOOK_URL

beforeEach(() => {
  fetchSpy.mockClear()
  vi.stubGlobal("fetch", fetchSpy)
  withWebhook(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  withWebhook(original)
})

function sentBody(): Record<string, unknown> {
  expect(fetchSpy.mock.calls[0], "no report was sent").toBeTruthy()
  const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1]
  return JSON.parse(String(init.body))
}

describe("error reporting (ROADMAP R3.1)", () => {
  it("is off by default and sends nothing without a sink", () => {
    expect(isErrorReportingEnabled()).toBe(false)
    reportError(new Error("boom"), { requestId: "abc" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Otherwise a typo in the config would silently disable error reporting,
  // which is indistinguishable from having no errors.
  it("ignores a non-http endpoint rather than posting to it", () => {
    withWebhook("ftp://collector.internal/hook")
    expect(isErrorReportingEnabled()).toBe(false)
    reportError(new Error("boom"), {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("posts a redacted JSON payload when a sink is configured", async () => {
    withWebhook("https://hooks.example.test/collector")
    expect(isErrorReportingEnabled()).toBe(true)

    reportError(
      new Error("failed for https://app.test/reset?token=SECRETTOKEN123"),
      { requestId: "abc", method: "POST", path: "/api/auth/reset" },
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://hooks.example.test/collector")
    const headers = init.headers as Record<string, string>
    expect(headers["content-type"]).toContain("application/json")

    const body = sentBody()
    expect(body.level).toBe("error")
    expect(body.context).toMatchObject({
      requestId: "abc",
      method: "POST",
      path: "/api/auth/reset",
    })
    // The token must not travel to a third party (ROADMAP P0.7).
    expect(String(body.message)).not.toContain("SECRETTOKEN123")
    expect(String(body.message)).toContain("[redacted]")
  })

  // A reporting failure must never turn one error into two.
  it("never throws when the sink is unreachable", async () => {
    withWebhook("https://hooks.example.test/collector")
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    expect(() => reportError(new Error("boom"), {})).not.toThrow()
    // Let the rejection settle so it cannot leak into another test.
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
  })

  it("reports an unknown thrown value without an Error instance", () => {
    withWebhook("https://hooks.example.test/collector")
    reportError("a bare string", {})
    expect(sentBody().message).toBe("a bare string")
  })
})
