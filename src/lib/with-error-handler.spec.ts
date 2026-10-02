import { NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { withErrorHandler } from "./with-error-handler"

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errSpy.mockRestore()
})

function req(id?: string): Request {
  return new Request("http://test.local/api/orders/123", {
    method: "POST",
    headers: id ? { "x-request-id": id } : {},
  })
}

describe("withErrorHandler", () => {
  it("logs request context and returns the requestId on a thrown error", async () => {
    const handler = withErrorHandler(async (_req: Request) => {
      throw new Error("kaboom")
    })
    const res = await handler(req("abcd1234"))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: "Internal server error",
      requestId: "abcd1234",
    })
    expect(res.headers.get("x-request-id")).toBe("abcd1234")

    const record = JSON.parse(errSpy.mock.calls.at(-1)?.[0] as string)
    expect(record).toMatchObject({
      level: "error",
      requestId: "abcd1234",
      method: "POST",
      path: "/api/orders/123",
    })
    expect(record.err.message).toBe("kaboom")
  })

  it("echoes the request id on success responses", async () => {
    const handler = withErrorHandler(async (_req: Request) =>
      NextResponse.json({ ok: true }),
    )
    const res = await handler(req("abcd1234"))
    expect(res.status).toBe(200)
    expect(res.headers.get("x-request-id")).toBe("abcd1234")
  })

  it("mints an id when the request carries none", async () => {
    const handler = withErrorHandler(async (_req: Request) => {
      throw new Error("x")
    })
    const res = await handler(req())
    const body = (await res.json()) as { requestId: string }
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers.get("x-request-id")).toBe(body.requestId)
  })
})

// There was no access log at all before this (ROADMAP R3.1): only unhandled
// 500s produced a line, so there was no 4xx record, no route latency and no
// slow-request signal. These assert the shape of that log.
describe("access log (ROADMAP R3.1)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  const originalLevel = process.env.LOG_LEVEL

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    // Successes log at `debug`, which the default `info` level suppresses.
    process.env.LOG_LEVEL = "debug"
  })

  afterEach(() => {
    logSpy.mockRestore()
    if (originalLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = originalLevel
  })

  function recordOf(spy: typeof errSpy): Record<string, unknown> | null {
    const line = spy.mock.calls.at(-1)?.[0]
    return typeof line === "string" ? JSON.parse(line) : null
  }

  it("records a successful request with its status and latency", async () => {
    const handler = withErrorHandler(async (_req: Request) =>
      NextResponse.json({ ok: true }),
    )
    const res = await handler(req())
    expect(res.status).toBe(200)

    const record = recordOf(logSpy)
    expect(record).toMatchObject({
      level: "debug",
      msg: "request",
      status: 200,
      method: "POST",
      path: "/api/orders/123",
    })
    expect(typeof record?.durationMs).toBe("number")
  })

  it("records a 4xx as a warning, not a debug line", async () => {
    const handler = withErrorHandler(async (_req: Request) =>
      NextResponse.json({ error: "nope" }, { status: 404 }),
    )
    const res = await handler(req())
    expect(res.status).toBe(404)

    const record = recordOf(errSpy)
    expect(record).toMatchObject({
      level: "warn",
      msg: "request rejected",
      status: 404,
    })
  })

  it("records a 5xx that is returned rather than thrown", async () => {
    const handler = withErrorHandler(async (_req: Request) =>
      NextResponse.json({ error: "down" }, { status: 503 }),
    )
    const res = await handler(req())
    expect(res.status).toBe(503)
    expect(recordOf(errSpy)).toMatchObject({
      level: "error",
      msg: "request failed",
      status: 503,
    })
  })

  it("flags a slow request even when it succeeds", async () => {
    const handler = withErrorHandler(async (_req: Request) => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
      return NextResponse.json({ ok: true })
    })
    const res = await handler(req())
    expect(res.status).toBe(200)

    const record = recordOf(errSpy)
    expect(record).toMatchObject({
      level: "warn",
      msg: "slow request",
      status: 200,
    })
    expect(record?.durationMs as number).toBeGreaterThanOrEqual(1_000)
  })
})
