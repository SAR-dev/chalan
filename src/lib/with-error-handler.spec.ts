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
