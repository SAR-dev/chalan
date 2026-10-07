import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { GET as getConfig, PATCH as updateConfig } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
  logAuditMany: vi.fn(() => Promise.resolve()),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = (projection?: Record<string, unknown>) => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) => {
        const rows = selectQueue.shift() ?? []
        // Honour the projection. A real SELECT only returns the columns the
        // route asked for, so without this the fixture would leak columns the
        // route never selected and the assertion would test the mock rather
        // than the route.
        const projected = projection
          ? rows.map((row) => {
              const out: Record<string, unknown> = {}
              if (row && typeof row === "object") {
                for (const key of Object.keys(projection)) {
                  if (key in (row as object))
                    out[key] = (row as Record<string, unknown>)[key]
                }
              }
              return out
            })
          : rows
        return Promise.resolve(projected).then(onFulfilled)
      },
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
    select: (projection?: Record<string, unknown>) =>
      makeSelectChain(projection),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db }, pool: {} }
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
    selectQueue.push([{ id: "default", refundOnCancel: false }])
    const res = await getConfig()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default", refundOnCancel: false })
  })

  it("never exposes a platform-wide rate", async () => {
    // Delivery/COD/cancellation rates are per-lane `zone_pricing` rows. If a
    // stale column ever reappears in the response, a client would start quoting
    // from a fallback the server no longer honours.
    sessionState.value = superAdmin
    selectQueue.push([
      { id: "default", defaultBaseRate: 40, refundOnCancel: true },
    ])
    const res = await getConfig()
    const json = await res.json()
    expect(json).not.toHaveProperty("defaultBaseRate")
    expect(json).not.toHaveProperty("defaultExtraRatePerKg")
    expect(json).not.toHaveProperty("defaultFreeWeightKg")
    expect(json).not.toHaveProperty("defaultMaxWeightKg")
    expect(json).not.toHaveProperty("defaultCodFeePercentage")
    expect(json).not.toHaveProperty("defaultCancellationFee")
  })

  it("creates the default config row when missing", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    insertResult.push({ id: "default", refundOnCancel: true })
    const res = await getConfig()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default" })
  })

  // The projection is explicit, so a column left out of the select is silently
  // dropped from the response — the reader would fall back to its `?? true`
  // default and an admin's "off" would never reach the rider.
  it("returns the R9 scan toggles", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      {
        id: "default",
        refundOnCancel: true,
        pickupScanRequired: false,
        deliveryScanRequired: true,
        warehouseScanRequired: false,
        warehouseReceiveScanRequired: true,
      },
    ])
    const res = await getConfig()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      pickupScanRequired: false,
      deliveryScanRequired: true,
      warehouseScanRequired: false,
      warehouseReceiveScanRequired: true,
    })
  })
})

describe("PATCH /api/platform-config", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateConfig(req("PATCH", { refundOnCancel: false }))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await updateConfig(req("PATCH", { refundOnCancel: false }))
    expect(res.status).toBe(403)
  })

  it("400 when no fields to update", async () => {
    sessionState.value = superAdmin
    const res = await updateConfig(req("PATCH", {}))
    expect(res.status).toBe(400)
  })

  it("updates config and logs the change", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "default", refundOnCancel: true }])
    updateResult.push({ id: "default", refundOnCancel: false })
    const res = await updateConfig(req("PATCH", { refundOnCancel: false }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ refundOnCancel: false })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PLATFORM_CONFIG_UPDATED" }),
    )
  })

  // Validation strips unknown keys, so a schema that never gained the fields
  // would 400 ("No fields to update") here instead of persisting them.
  it("accepts the R9 scan toggles and audits them", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "default", refundOnCancel: true }])
    updateResult.push({
      id: "default",
      pickupScanRequired: false,
      deliveryScanRequired: false,
      warehouseScanRequired: false,
      warehouseReceiveScanRequired: false,
    })
    const res = await updateConfig(
      req("PATCH", {
        pickupScanRequired: false,
        deliveryScanRequired: false,
        warehouseScanRequired: false,
        warehouseReceiveScanRequired: false,
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      pickupScanRequired: false,
      deliveryScanRequired: false,
      warehouseScanRequired: false,
      warehouseReceiveScanRequired: false,
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PLATFORM_CONFIG_UPDATED",
        metadata: {
          pickupScanRequired: false,
          deliveryScanRequired: false,
          warehouseScanRequired: false,
          warehouseReceiveScanRequired: false,
        },
      }),
    )
  })

  it("rejects a non-boolean scan toggle", async () => {
    sessionState.value = superAdmin
    const res = await updateConfig(req("PATCH", { pickupScanRequired: "yes" }))
    expect(res.status).toBe(400)
    const res2 = await updateConfig(
      req("PATCH", { warehouseReceiveScanRequired: "yes" }),
    )
    expect(res2.status).toBe(400)
  })

  it("creates the config row when missing", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    insertResult.push({ id: "default", refundOnCancel: false })
    const res = await updateConfig(req("PATCH", { refundOnCancel: false }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "default" })
  })
})
