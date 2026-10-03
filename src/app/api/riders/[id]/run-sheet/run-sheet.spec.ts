import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as runSheet } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = { select: () => makeSelectChain() }
  return { db, dbRead: { ...db }, pool: {} }
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request("http://test.local/api/riders/RID-1/run-sheet")

const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u4",
  warehouseId: "WH-000001",
}
const superAdmin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u2" }
const rider = {
  role: "RIDER",
  name: "Rider Rick",
  userId: "u3",
  riderId: "RID-1",
}
const otherRider = {
  role: "RIDER",
  name: "Rider Rita",
  userId: "u6",
  riderId: "RID-2",
}
const merchant = { role: "MERCHANT", name: "Merchant Moe", userId: "u1" }

function riderRow(id = "RID-1", warehouseId = "WH-000001") {
  return { id, name: "Rider Rick", warehouseId }
}

function openParcel(
  id: string,
  zoneId: string,
  zoneName: string,
  city: string,
) {
  return { id, zoneId, zoneName, cityName: city }
}

/** The route reads the rider row first, then that rider's open parcels. */
function queueReads(rows: unknown[], riderOverrides = {}) {
  selectQueue.push([{ ...riderRow(), ...riderOverrides }], rows)
}

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
})

describe("GET /api/riders/[id]/run-sheet", () => {
  it("401 when unauthenticated", async () => {
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(401)
  })

  it("404 for an unknown rider", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(404)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    queueReads([])
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(403)
  })

  it("403 for a rider asking for a colleague's run", async () => {
    // The sheet exposes recipient cities and addresses, so it is not
    // cross-rider readable even though both riders are on the same platform.
    sessionState.value = otherRider
    queueReads([])
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(403)
  })

  it("403 for a warehouse admin looking outside their own hub", async () => {
    sessionState.value = whAdmin
    queueReads([], { warehouseId: "WH-000002" })
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(403)
  })

  it("403 for a warehouse admin with no hub", async () => {
    sessionState.value = { ...whAdmin, warehouseId: null }
    queueReads([])
    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(403)
  })

  it("lets a rider read their own run", async () => {
    sessionState.value = rider
    queueReads([])

    const res = await runSheet(req(), params("RID-1"))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      riderId: "RID-1",
      riderName: "Rider Rick",
      stops: [],
      zoneHops: 0,
      zoneCount: 0,
    })
  })

  it("groups a rider's parcels into one run per zone", async () => {
    sessionState.value = rider
    queueReads([
      openParcel("ORD-000001", "ZN-DHAKA", "Dhaka Metro", "Dhaka"),
      openParcel("ORD-000002", "ZN-SYLHET", "Divisional Cities", "Sylhet"),
      openParcel("ORD-000003", "ZN-DHAKA", "Dhaka Metro", "Gazipur"),
    ])

    const json = await (await runSheet(req(), params("RID-1"))).json()

    expect(json.stops.map((s: { orderId: string }) => s.orderId)).toEqual([
      "ORD-000001",
      "ORD-000003",
      "ORD-000002",
    ])
    expect(json.zoneHops).toBe(1)
    expect(json.stops[0]).toMatchObject({
      sequence: 1,
      zoneName: "Dhaka Metro",
      cityName: "Dhaka",
    })
  })

  it("lets a warehouse admin read a rider at their own hub", async () => {
    sessionState.value = whAdmin
    queueReads([openParcel("ORD-000001", "ZN-DHAKA", "Dhaka Metro", "Dhaka")])

    const json = await (await runSheet(req(), params("RID-1"))).json()

    expect(json.stops).toHaveLength(1)
  })

  it("lets a super admin read anyone's run", async () => {
    sessionState.value = superAdmin
    queueReads([], { warehouseId: "WH-000002" })

    const res = await runSheet(req(), params("RID-1"))
    expect(res.status).toBe(200)
  })

  it("keeps a parcel with an unresolved zone rather than dropping it", async () => {
    sessionState.value = rider
    queueReads([
      { id: "ORD-000001", zoneId: null, zoneName: null, cityName: null },
    ])

    const json = await (await runSheet(req(), params("RID-1"))).json()

    expect(json.stops).toEqual([
      {
        orderId: "ORD-000001",
        sequence: 1,
        zoneId: null,
        zoneName: null,
        cityName: null,
      },
    ])
    expect(json.zoneCount).toBe(1)
  })
})
