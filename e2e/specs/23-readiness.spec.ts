import "dotenv/config"

import { expect, test } from "@playwright/test"

// ─── 2301. Readiness probe ────────────────────────────────────
//
// `/api/ready` must run a real dependency check (DB `SELECT 1`); `/api/health`
// stays a liveness probe with no DB dependency.

test.describe("2301. Readiness probe", () => {
  test("reports healthy when the database is reachable", async ({
    request,
  }) => {
    const ready = await request.get("/api/ready")
    expect(ready.status()).toBe(200)
    expect(await ready.json()).toMatchObject({
      ok: true,
      checks: { db: true, redis: true },
    })

    const live = await request.get("/api/health")
    expect(live.status()).toBe(200)
    expect(await live.json()).toMatchObject({ ok: true })
  })
})
