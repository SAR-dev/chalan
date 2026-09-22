import { describe, expect, it } from "vitest"
import { GET } from "./route"

describe("GET /api/health", () => {
  it("returns 200 with ok: true", async () => {
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
  })
})
