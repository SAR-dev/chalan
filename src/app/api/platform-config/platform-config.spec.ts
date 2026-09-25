import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { GET as getConfig, PATCH as updateConfig } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: () => chain,
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u3",
  warehouseId: "wh_1",
}
const merchantSession = { role: "MERCHANT", name: "Merchant", userId: "u2" }

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  insertResult.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/platform-config", () => {
  it("401 when unauthenticated", async () => {
    const res = await getConfig()
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await getConfig()
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await getConfig()
    expect(res.status).toBe(403)
  })

  it("returns config for super admin", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "default", defaultBaseRate: 40 }])
    const res = await getConfig()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default", defaultBaseRate: 40 })
  })

  it("creates the default config row when missing", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    insertResult.push({ id: "default", defaultBaseRate: 0 })
    const res = await getConfig()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default" })
  })
})

describe("PATCH /api/platform-config", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateConfig(req("PATCH", { defaultBaseRate: 40 }))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await updateConfig(req("PATCH", { defaultBaseRate: 40 }))
    expect(res.status).toBe(403)
  })

  it("400 when no fields to update", async () => {
    sessionState.value = superAdmin
    const res = await updateConfig(req("PATCH", {}))
    expect(res.status).toBe(400)
  })

  it("updates config and logs the change", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "default", defaultBaseRate: 35 }])
    updateResult.push({ id: "default", defaultBaseRate: 40 })
    const res = await updateConfig(req("PATCH", { defaultBaseRate: 40 }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ defaultBaseRate: 40 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PLATFORM_CONFIG_UPDATED" }),
    )
  })

  it("creates the config row when missing", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    insertResult.push({ id: "default", defaultBaseRate: 40 })
    const res = await updateConfig(req("PATCH", { defaultBaseRate: 40 }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default" })
  })
})
