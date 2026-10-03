import "dotenv/config"

import { type APIRequestContext, expect, test } from "@playwright/test"
import { CREDS } from "../helpers"

// ─── S53. Typed counts ───────────────────────────────────────
//
// `count(*)` is a Postgres bigint, which node-postgres returns as a JS string
// even though `sql<number>` claims a number. Every list endpoint must cast
// `count(*)::int`, or `total` serializes as `"5"` instead of `5`.

async function signInAsAdmin(request: APIRequestContext) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: {
      email: CREDS.superAdmin.email,
      password: CREDS.superAdmin.password,
      callbackURL: "/dashboard",
    },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe("S53. Typed counts", () => {
  test("paginated list endpoints return a numeric total", async ({
    request,
  }) => {
    await signInAsAdmin(request)

    for (const path of [
      "/api/merchants?limit=1",
      "/api/audit-logs?limit=1",
      "/api/email-logs?limit=1",
      "/api/riders?limit=1",
    ]) {
      const res = await request.get(path)
      expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy()
      const json = (await res.json()) as { total: unknown }
      expect(typeof json.total, `${path} total`).toBe("number")
    }
  })

  test("order count aggregates are numbers", async ({ request }) => {
    await signInAsAdmin(request)
    const res = await request.get("/api/orders/counts?warehouseId=WH-100001E")
    expect(res.ok()).toBeTruthy()
    const json = (await res.json()) as Record<string, unknown>
    // Pin the exact shape: a silent rename or a dropped count would otherwise
    // pass the "all numbers" loop below.
    expect(Object.keys(json).sort()).toEqual(
      ["failedAttempt", "returned", "unsettled"].sort(),
    )
    for (const [key, value] of Object.entries(json)) {
      expect(typeof value, `orders/counts.${key}`).toBe("number")
    }
  })
})
