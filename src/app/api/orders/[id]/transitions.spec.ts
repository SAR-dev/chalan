/**
 * Spec-capture tests for the 10 order-transition routes.
 *
 * These tests document the CURRENT, observed behavior of each transition
 * endpoint (auth gate, status guard, ownership/business rules, and the exact
 * fields written on success) so that the upcoming refactor — extracting a
 * shared state machine in lib/orders/transitions.ts — can be verified as
 * behavior-preserving. They intentionally assert on real responses produced
 * by the real validation/business logic; only the Drizzle `db` layer and the
 * session lookup are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
// Imports must come after the vi.mock calls (which are hoisted regardless).
import { logAudit } from "@/lib/audit"
import { PATCH as approve } from "./approve/route"
import { PATCH as assignPickupRider } from "./assign-pickup-rider/route"
import { PATCH as cancel } from "./cancel/route"
import { PATCH as delivered } from "./delivered/route"
import { PATCH as dispatch } from "./dispatch/route"
import { PATCH as failed } from "./failed/route"
import { PATCH as outForDelivery } from "./out-for-delivery/route"
import { PATCH as pickedUp } from "./picked-up/route"
import { PATCH as reattempt } from "./reattempt/route"
import { PATCH as receive } from "./receive/route"
import { PATCH as returnRoute } from "./return/route"
import { PATCH as settleCod } from "./settle-cod/route"

// --- Controllable mock of the Drizzle data layer ----------------------------
// Routes do: `db.select().from(x).where(eq(...)).limit(1)` (awaited, FIFO) and
// `db.update(x).set(vals).where(eq(...)).returning()` (awaited).
const dbState = {
  selectQueue: [] as unknown[][],
  updateResult: [] as unknown[],
  updatePayloads: [] as Record<string, unknown>[],
  insertResult: [] as unknown[],
  insertPayloads: [] as Record<string, unknown>[],
}

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      limit: () => chain,
      // `.for("update")` (row locking inside a transaction) is a passthrough
      // here — the mock has no real lock semantics, it just needs to not
      // break the chain so `applyOrderTransition`'s `SELECT ... FOR UPDATE`
      // call shape resolves from the same `selectQueue` as a plain select.
      for: () => chain,
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(dbState.selectQueue.shift() ?? []).then(
          onFulfilled,
          onRejected,
        ),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (vals: Record<string, unknown>) => {
        dbState.updatePayloads.push(vals)
        return chain
      },
      where: () => chain,
      returning: () => Promise.resolve(dbState.updateResult),
    }
    return chain
  }
  interface MockDb {
    select: () => ReturnType<typeof makeSelectChain>
    update: () => ReturnType<typeof makeUpdateChain>
    insert: () => ReturnType<typeof makeInsertChain>
    transaction: <T>(fn: (tx: MockDb) => Promise<T>) => Promise<T>
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: (
        payload: Record<string, unknown> | Record<string, unknown>[],
      ) => {
        dbState.insertPayloads.push(payload as Record<string, unknown>)
        return chain
      },
      onConflictDoUpdate: () => chain,
      returning: () => Promise.resolve(dbState.insertResult),
    }
    return chain
  }
  const db: MockDb = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
    // Ledger + balance writes (balance_transaction / merchant_balance).
    insert: () => makeInsertChain(),
    // `applyOrderTransition` runs its fetch+guard+update inside
    // `db.transaction(async (tx) => ...)`. The mock `tx` is just another
    // handle onto the same `select`/`update` chains and the same shared
    // `dbState`, so every existing assertion on `selectQueue`/
    // `updatePayloads` still applies — the transaction wrapper doesn't
    // change which calls happen, only that they're grouped.
    transaction: <T>(fn: (tx: MockDb) => Promise<T>) => fn(db),
  }
  return { db, dbRead: db, pool: {} }
})

const sessionState: { value: Record<string, unknown> | null } = { value: null }
vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

// logAudit calls db.insert() which the db mock above does not stub — silence
// it so a successful transition does not throw after the write commits.
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>

const ORDER_ID = "order_1"

function makeReq(body?: unknown): Request {
  return new Request("http://test.local/api", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function call(handler: Handler, body?: unknown) {
  const res = await handler(makeReq(body), {
    params: Promise.resolve({ id: ORDER_ID }),
  })
  let json: unknown
  try {
    json = await res.clone().json()
  } catch {
    json = null
  }
  return { status: res.status, json, payload: dbState.updatePayloads.at(-1) }
}

// Convenience session factories
const superAdmin = { role: "SUPER_ADMIN", name: "Super" }
const admin = { role: "SUPER_ADMIN", name: "Admin Amy" }
const warehouseAdmin = (warehouseId = "wh_1") => ({
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  warehouseId,
})
const riderSession = (riderId = "rider_1") => ({
  role: "RIDER",
  name: "Rider Rick",
  riderId,
})
const merchantSession = (merchantId = "merch_1") => ({
  role: "MERCHANT",
  name: "Merchant Mo",
  merchantId,
})

// A representative order row with every column the routes may read.
function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "PENDING",
    merchantId: "merch_1",
    pickupLocationId: "pl_1",
    warehouseId: null,
    pickupRiderId: null,
    deliveryRiderId: null,
    parcelWeightKg: 2,
    deliveryAttempts: 0,
    productCost: 500,
    codSettledAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  dbState.selectQueue = []
  dbState.updateResult = []
  dbState.updatePayloads = []
  dbState.insertResult = []
  dbState.insertPayloads = []
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function makeRider(overrides: Record<string, unknown> = {}) {
  return {
    id: "rider_1",
    isActive: true,
    taskType: "PICKUP",
    warehouseId: "wh_1",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/approve", () => {
  it("401 when unauthenticated", async () => {
    const { status } = await call(approve, { riderId: "r1" })
    expect(status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    sessionState.value = riderSession()
    const { status, json } = await call(approve, { riderId: "r1" })
    expect(status).toBe(403)
    expect(json).toEqual({ error: "Forbidden" })
  })

  it("400 when order not found", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[]] // order lookup -> empty
    const { status, json } = await call(approve)
    expect(status).toBe(404)
    expect(json).toEqual({ error: "Order not found" })
  })

  it("400 when order not PENDING", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "APPROVED" })]]
    const { status, json } = await call(approve)
    expect(status).toBe(400)
    expect(json).toEqual({ error: "Only PENDING orders can be approved" })
  })

  it("400 when parcel weight exceeds merchant max", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 10 })],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    ]
    const { status, json } = await call(approve)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Parcel weight exceeds the 5 KG limit and cannot be approved.",
    })
  })

  it("400 when the merchant is suspended (ROADMAP B8)", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 2 })],
      [{ maxWeightKg: 5, status: "SUSPENDED" }],
    ]
    const { status, json } = await call(approve)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This merchant is not active; the order cannot be approved.",
    })
  })

  it("approves: sets APPROVED + approver + timestamps", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 2 })],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    const { status, payload } = await call(approve)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "APPROVED",
      approvedBy: "Admin Amy",
    })
    expect(typeof payload?.approvedAt).toBe("string")
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORDER_APPROVE",
        entityType: "order",
        entityId: ORDER_ID,
        metadata: {
          diff: { status: { from: "PENDING", to: "APPROVED" } },
        },
      }),
      // Audit now commits inside the transition's transaction (ROADMAP P1.4).
      expect.anything(),
    )
    // Append-only status history row, written in the same transaction.
    expect(dbState.insertPayloads).toContainEqual(
      expect.objectContaining({
        orderId: ORDER_ID,
        fromStatus: "PENDING",
        toStatus: "APPROVED",
        transition: "approve",
      }),
    )
  })

  it("500 when the audit write fails (change is not committed)", async () => {
    // logAudit propagates inside the transaction, so a failed audit rolls the
    // transition back instead of committing state without a trail (P1.4a).
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 2 })],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"))
    const { status } = await call(approve)
    expect(status).toBe(500)
  })

  it("allows SUPER_ADMIN too", async () => {
    sessionState.value = superAdmin
    dbState.selectQueue = [
      [makeOrder()],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    const { status } = await call(approve, { riderId: "r1" })
    expect(status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/assign-pickup-rider", () => {
  it("401 when unauthenticated", async () => {
    const { status } = await call(assignPickupRider, { riderId: "rider_1" })
    expect(status).toBe(401)
  })

  it("403 unless WAREHOUSE_ADMIN with warehouseId", async () => {
    sessionState.value = merchantSession()
    const { status, json } = await call(assignPickupRider, {
      riderId: "rider_1",
    })
    expect(status).toBe(403)
    expect(json).toEqual({ error: "Forbidden" })
  })

  it("403 for warehouse admin without a warehouse", async () => {
    sessionState.value = { role: "WAREHOUSE_ADMIN", name: "WH Walt" }
    const { status } = await call(assignPickupRider, { riderId: "rider_1" })
    expect(status).toBe(403)
  })

  it("400 when order not APPROVED", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ status: "PENDING" })]]
    const { status, json } = await call(assignPickupRider, {
      riderId: "rider_1",
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only APPROVED orders can be assigned a pickup rider.",
    })
  })

  it("400 when the rider is based at another warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "APPROVED" })],
      [makeRider({ warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(assignPickupRider, {
      riderId: "rider_1",
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Select a pickup rider based at this warehouse.",
    })
  })

  it("assigns an active pickup rider from the admin's warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ status: "APPROVED" })], [makeRider()]]
    dbState.updateResult = [
      makeOrder({ status: "APPROVED", pickupRiderId: "rider_1" }),
    ]
    const { status, payload } = await call(assignPickupRider, {
      riderId: "rider_1",
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({ pickupRiderId: "rider_1" })
    expect(typeof payload?.assignedAt).toBe("string")
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/dispatch", () => {
  it("403 unless WAREHOUSE_ADMIN with warehouseId", async () => {
    sessionState.value = admin
    const { status } = await call(dispatch, { riderId: "r1" })
    expect(status).toBe(403)
  })

  it("400 when order not IN_WAREHOUSE", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PICKED_UP", warehouseId: "wh_1" })],
    ]
    const { status, json } = await call(dispatch, { riderId: "r1" })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only IN_WAREHOUSE parcels can be dispatched.",
    })
  })

  it("400 when parcel held at a different warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(dispatch, { riderId: "r1" })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel is held at a different warehouse.",
    })
  })

  it("400 when delivery rider not based at this warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_1" })],
      [{ id: "r1", isActive: true, warehouseId: "wh_2" }],
    ]
    const { status, json } = await call(dispatch, { riderId: "r1" })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Select a delivery rider based at this warehouse.",
    })
  })

  it("dispatches: sets IN_TRANSIT + delivery rider + dispatch meta", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_1" })],
      [{ id: "r1", isActive: true, warehouseId: "wh_1" }],
    ]
    dbState.updateResult = [makeOrder({ status: "IN_TRANSIT" })]
    const { status, payload } = await call(dispatch, { riderId: "r1" })
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "IN_TRANSIT",
      deliveryRiderId: "r1",
      dispatchedBy: "WH Walt",
    })
    expect(typeof payload?.dispatchedAt).toBe("string")
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/picked-up", () => {
  it("403 unless RIDER with riderId", async () => {
    sessionState.value = admin
    const { status } = await call(pickedUp, { proofRefs: ["/uploads/a.png"] })
    expect(status).toBe(403)
  })

  it("403 when pickup not assigned to this rider", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_2", status: "APPROVED" })],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(403)
    expect(json).toEqual({ error: "This pickup is not assigned to you." })
  })

  it("400 when order not APPROVED", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "PENDING" })],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(400)
    expect(json).toEqual({ error: "Only APPROVED orders can be picked up." })
  })

  it("routes to the pickup location's warehouse", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
      [{ id: "pl_1", warehouseId: "wh_9" }], // pickup location with warehouse
    ]
    dbState.updateResult = [makeOrder({ status: "PICKED_UP" })]
    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "PICKED_UP",
      warehouseId: "wh_9",
      pickupProofRefs: ["/uploads/a.png"],
    })
    expect(typeof payload?.pickedUpAt).toBe("string")
  })

  it("leaves warehouseId null when pickup location has no warehouse", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
      [{ id: "pl_1", warehouseId: null }], // pickup location without warehouse
    ]
    dbState.updateResult = [makeOrder({ status: "PICKED_UP" })]
    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(200)
    expect(payload?.warehouseId).toBeNull()
  })

  it("400 when proof photos missing", async () => {
    sessionState.value = riderSession("rider_1")
    const { status } = await call(pickedUp, { proofRefs: [] })
    expect(status).toBe(400)
  })

  it("re-prices the delivery when the rider corrects the weight", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
          parcelWeightKg: 1,
          deliveryFee: 60,
          codFee: 0,
          productCost: 500,
        }),
      ], // order
      [{ id: "pl_1", warehouseId: "wh_9" }], // pickup location
      [{ maxWeightKg: 10 }], // merchant cap
      [
        {
          baseRate: 100,
          extraRatePerKg: 20,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 1,
          cancellationFee: 0,
        },
      ], // platform defaults
      [{ city: "Dhaka" }], // origin warehouse city
      [{ zoneId: "ZN-1" }], // origin city zone (no deliveryCityId → fallback)
    ]
    dbState.updateResult = [
      makeOrder({
        status: "PICKED_UP",
        parcelWeightKg: 3,
        deliveryFee: 140,
        codFee: 0,
        productCost: 500,
      }),
    ]
    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
      parcelWeightKg: 3,
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({ parcelWeightKg: 3, deliveryFee: 140 })
    // 140 − 60 = +80 charge adjustment.
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE"),
    ).toMatchObject({ amount: 80, status: "SETTLED" })
  })

  it("keeps a FLAT bundle price through a weight correction", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "APPROVED",
          deliveryFee: 50,
          packageRuleType: "FLAT",
          packageRuleValue: 50,
        }),
      ],
      [{ id: "pl_1", warehouseId: "wh_1" }],
      [{ maxWeightKg: 10 }], // merchant cap
      [
        {
          baseRate: 100,
          extraRatePerKg: 20,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 1,
          cancellationFee: 0,
        },
      ], // platform defaults
      [{ city: "Dhaka" }], // origin warehouse city
      [{ zoneId: "ZN-1" }], // origin city zone
    ]
    dbState.updateResult = [
      makeOrder({
        status: "PICKED_UP",
        parcelWeightKg: 3,
        deliveryFee: 50,
        codFee: 0,
        productCost: 500,
        packageRuleType: "FLAT",
        packageRuleValue: 50,
      }),
    ]
    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
      parcelWeightKg: 3,
    })
    expect(status).toBe(200)
    // The zone fee would be 140; the snapshotted FLAT rule caps it at 50, so
    // the weight correction produces no delivery-fee delta.
    expect(payload).toMatchObject({ parcelWeightKg: 3, deliveryFee: 50 })
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE"),
    ).toBeUndefined()
  })

  it("400 when the corrected weight exceeds the limit", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
      [{ id: "pl_1", warehouseId: "wh_9" }],
      [{ maxWeightKg: 5 }], // merchant cap 5
      [
        {
          baseRate: 100,
          extraRatePerKg: 20,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 1,
          cancellationFee: 0,
        },
      ],
      [{ city: "Dhaka" }],
      [{ zoneId: "ZN-1" }],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
      parcelWeightKg: 6,
    })
    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: expect.stringMatching(/exceeds the 5 KG limit/i),
    })
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/receive", () => {
  it("403 unless WAREHOUSE_ADMIN", async () => {
    sessionState.value = riderSession()
    const { status } = await call(receive)
    expect(status).toBe(403)
  })

  it("400 when order not PICKED_UP", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ status: "IN_WAREHOUSE" })]]
    const { status, json } = await call(receive)
    expect(status).toBe(400)
    expect(json).toEqual({ error: "Only PICKED_UP parcels can be received." })
  })

  it("receives into the admin's warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ status: "PICKED_UP" })]]
    dbState.updateResult = [makeOrder({ status: "IN_WAREHOUSE" })]
    const { status, payload } = await call(receive)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "IN_WAREHOUSE",
      warehouseId: "wh_1",
      receivedByWarehouse: "WH Walt",
    })
    expect(typeof payload?.receivedAtWarehouseAt).toBe("string")
  })

  it("400 when the parcel is held at a different warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PICKED_UP", warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(receive)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel is held at a different warehouse.",
    })
  })

  it("receives an unassigned pickup with no warehouse yet", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PICKED_UP", warehouseId: null })],
    ]
    dbState.updateResult = [makeOrder({ status: "IN_WAREHOUSE" })]
    const { status } = await call(receive)
    expect(status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/out-for-delivery", () => {
  it("403 unless RIDER", async () => {
    sessionState.value = warehouseAdmin()
    const { status } = await call(outForDelivery)
    expect(status).toBe(403)
  })

  it("403 when not assigned to this rider", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_2", status: "IN_TRANSIT" })],
    ]
    const { status, json } = await call(outForDelivery)
    expect(status).toBe(403)
    expect(json).toEqual({ error: "This delivery is not assigned to you." })
  })

  it("400 when not IN_TRANSIT", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_1", status: "IN_WAREHOUSE" })],
    ]
    const { status, json } = await call(outForDelivery)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only IN_TRANSIT parcels can go out for delivery.",
    })
  })

  it("goes out for delivery and increments attempts", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "IN_TRANSIT",
          deliveryAttempts: 1,
        }),
      ],
    ]
    dbState.updateResult = [makeOrder({ status: "OUT_FOR_DELIVERY" })]
    const { status, payload } = await call(outForDelivery)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "OUT_FOR_DELIVERY",
      deliveryAttempts: 2,
    })
    expect(typeof payload?.outForDeliveryAt).toBe("string")
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/delivered", () => {
  it("403 when not assigned to this rider", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_2", status: "OUT_FOR_DELIVERY" })],
    ]
    const { status, json } = await call(delivered, {})
    expect(status).toBe(403)
    expect(json).toEqual({ error: "This delivery is not assigned to you." })
  })

  it("400 when not OUT_FOR_DELIVERY", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    ]
    const { status, json } = await call(delivered, {})
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only OUT_FOR_DELIVERY parcels can be marked delivered.",
    })
  })

  it("defaults proof ref from order code and collects total", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "OUT_FOR_DELIVERY",
          productCost: 750,
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({ status: "DELIVERED", productCost: 750 }),
    ]
    const { status, payload } = await call(delivered, {})
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "DELIVERED",
      amountCollected: 750,
    })
    expect(typeof payload?.deliveredAt).toBe("string")
    // P0.4: delivery credits the GROSS collected COD; the ORDER_CHARGE row
    // written at creation nets it down to the merchant's earnings.
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_EARNINGS"),
    ).toMatchObject({ amount: -750, status: "SETTLED" })
  })

  it("credits only the amount actually collected (partial COD, ROADMAP B2)", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "OUT_FOR_DELIVERY",
          productCost: 750,
          deliveryFee: 60,
          codFee: 0,
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({
        status: "DELIVERED",
        productCost: 750,
        amountCollected: 500,
        deliveryFee: 60,
        codFee: 0,
      }),
    ]
    const { status } = await call(delivered, {
      amountCollected: 500,
      shortfallReason: "customer paid partial",
    })
    expect(status).toBe(200)
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_EARNINGS"),
    ).toMatchObject({ amount: -500 })
  })

  it("400 when a shortfall has no reason (ROADMAP B2)", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "OUT_FOR_DELIVERY",
          productCost: 750,
        }),
      ],
    ]
    const { status, json } = await call(delivered, { amountCollected: 500 })
    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: expect.stringMatching(/reason is required/i),
    })
  })

  it("400 when collecting more than the COD (ROADMAP B2)", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          deliveryRiderId: "rider_1",
          status: "OUT_FOR_DELIVERY",
          productCost: 750,
        }),
      ],
    ]
    const { status, json } = await call(delivered, { amountCollected: 800 })
    expect(status).toBe(400)
    expect(json).toMatchObject({
      error: expect.stringMatching(/cannot exceed/i),
    })
  })

  it("uses provided proof ref when present", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_1", status: "OUT_FOR_DELIVERY" })],
    ]
    dbState.updateResult = [makeOrder({ status: "DELIVERED" })]
    const { payload } = await call(delivered, {
      proofRef: "/uploads/proof.png",
    })
    expect(payload?.deliveryProofRef).toBe("/uploads/proof.png")
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/failed", () => {
  it("400 when reason note missing", async () => {
    sessionState.value = riderSession("rider_1")
    const { status } = await call(failed, {})
    expect(status).toBe(400)
  })

  it("400 when not OUT_FOR_DELIVERY", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_1", status: "IN_TRANSIT" })],
    ]
    const { status, json } = await call(failed, { note: "No answer" })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only OUT_FOR_DELIVERY parcels can be marked failed.",
    })
  })

  it("records FAILED_ATTEMPT with trimmed note", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ deliveryRiderId: "rider_1", status: "OUT_FOR_DELIVERY" })],
    ]
    dbState.updateResult = [makeOrder({ status: "FAILED_ATTEMPT" })]
    const { status, payload } = await call(failed, {
      note: "  customer absent  ",
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "FAILED_ATTEMPT",
      failureNote: "customer absent",
    })
    expect(typeof payload?.failedAttemptAt).toBe("string")
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/reattempt", () => {
  it("403 unless WAREHOUSE_ADMIN", async () => {
    sessionState.value = riderSession()
    const { status } = await call(reattempt)
    expect(status).toBe(403)
  })

  it("400 when not FAILED_ATTEMPT", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "OUT_FOR_DELIVERY", warehouseId: "wh_1" })],
    ]
    const { status, json } = await call(reattempt)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only FAILED_ATTEMPT parcels can be reattempted.",
    })
  })

  it("400 when held at a different warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(reattempt)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel is held at a different warehouse.",
    })
  })

  it("resets failure fields and returns to OUT_FOR_DELIVERY, incrementing attempts", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
          deliveryAttempts: 1,
        }),
      ],
    ]
    dbState.updateResult = [makeOrder({ status: "OUT_FOR_DELIVERY" })]
    const { status, payload } = await call(reattempt)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "OUT_FOR_DELIVERY",
      failureNote: null,
      failedAttemptAt: null,
      failedResolvedBy: "WH Walt",
      deliveryAttempts: 2,
    })
    expect(payload?.failedResolvedAt).toBe(payload?.outForDeliveryAt)
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/return", () => {
  it("400 when reason missing", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    const { status } = await call(returnRoute, {})
    expect(status).toBe(400)
  })

  it("400 when not FAILED_ATTEMPT", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "DELIVERED", warehouseId: "wh_1" })],
    ]
    const { status, json } = await call(returnRoute, { reason: "damaged" })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only FAILED_ATTEMPT parcels can be returned.",
    })
  })

  it("marks RETURNED with trimmed reason and resolver meta", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "RETURNED" })]
    const { status, payload } = await call(returnRoute, {
      reason: "  unreachable  ",
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "RETURNED",
      returnReason: "unreachable",
      failedResolvedBy: "WH Walt",
    })
    expect(payload?.failedResolvedAt).toBe(payload?.returnedAt)
  })

  it("refunds the creation fees and charges the cancellation fee", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    ]
    dbState.updateResult = [
      makeOrder({
        status: "RETURNED",
        deliveryFee: 60,
        codFee: 5,
        cancellationFee: 20,
      }),
    ]
    const { status } = await call(returnRoute, { reason: "unreachable" })
    expect(status).toBe(200)

    // Creation charge reversed (negative ORDER_CHARGE): -(60 + 5).
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE_REVERSAL"),
    ).toMatchObject({ amount: -65, status: "SETTLED" })

    // Cancellation fee charged instead.
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CANCELLATION"),
    ).toMatchObject({ amount: 20, status: "SETTLED" })

    // Merchant balance moves by the net: -65 + 20 = -45.
    expect(dbState.insertPayloads.find((p) => "balance" in p)).toMatchObject({
      balance: -45,
    })
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/settle-cod", () => {
  it("403 unless WAREHOUSE_ADMIN", async () => {
    sessionState.value = admin
    const { status } = await call(settleCod)
    expect(status).toBe(403)
  })

  it("400 when not DELIVERED", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_TRANSIT", warehouseId: "wh_1" })],
    ]
    const { status, json } = await call(settleCod)
    expect(status).toBe(400)
    expect(json).toEqual({ error: "Only DELIVERED parcels can be settled." })
  })

  it("400 when parcel belongs to a different warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "DELIVERED", warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(settleCod)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel belongs to a different warehouse.",
    })
  })

  it("400 when already settled", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: "2024-01-01T00:00:00.000Z",
        }),
      ],
    ]
    const { status, json } = await call(settleCod)
    expect(status).toBe(400)
    expect(json).toEqual({ error: "This parcel's COD is already settled." })
  })

  it("settles COD with timestamp and settler name", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "DELIVERED",
          warehouseId: "wh_1",
          codSettledAt: null,
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({
        status: "DELIVERED",
        warehouseId: "wh_1",
        codSettledAt: "2025-01-02T00:00:00Z",
      }),
    ]
    const { status, payload } = await call(settleCod)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ codSettledBy: "WH Walt" })
    expect(typeof payload?.codSettledAt).toBe("string")
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORDER_SETTLE_COD",
        metadata: {
          diff: {
            codSettledAt: { from: null, to: "2025-01-02T00:00:00Z" },
          },
        },
      }),
      expect.anything(),
    )
  })
})

// ---------------------------------------------------------------------------
describe("PATCH /orders/:id/cancel", () => {
  it("401 when unauthenticated", async () => {
    const { status } = await call(cancel)
    expect(status).toBe(401)
  })

  it("403 for RIDER role", async () => {
    sessionState.value = riderSession()
    const { status, json } = await call(cancel)
    expect(status).toBe(403)
    expect(json).toEqual({ error: "Forbidden" })
  })

  it("404 when order not found", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[]]
    const { status, json } = await call(cancel)
    expect(status).toBe(404)
    expect(json).toEqual({ error: "Order not found" })
  })

  // --- Merchant window ---

  it("merchant can cancel a PENDING order they own", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PENDING", merchantId: "merch_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "Merchant Mo",
    })
    expect(typeof payload?.cancelledAt).toBe("string")
  })

  it("merchant can cancel an APPROVED order they own", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [makeOrder({ status: "APPROVED", merchantId: "merch_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED" })
  })

  it("merchant cannot cancel a PICKED_UP order", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PICKED_UP", merchantId: "merch_1" })],
    ]
    const { status, json } = await call(cancel)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Orders can only be cancelled before they are picked up.",
    })
  })

  it("refunds the full creation charge when cancelled before pickup (ROADMAP B4)", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "PENDING",
          merchantId: "merch_1",
          deliveryFee: 60,
          codFee: 5,
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({ status: "CANCELLED", deliveryFee: 60, codFee: 5 }),
    ]
    const { status } = await call(cancel)
    expect(status).toBe(200)
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE_REVERSAL"),
    ).toMatchObject({ amount: -65 })
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CANCELLATION"),
    ).toBeUndefined()
  })

  it("charges the cancellation fee when cancelled after pickup (ROADMAP B4)", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [
        makeOrder({
          status: "IN_WAREHOUSE",
          deliveryFee: 60,
          codFee: 5,
          cancellationFee: 20,
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({
        status: "CANCELLED",
        deliveryFee: 60,
        codFee: 5,
        cancellationFee: 20,
      }),
    ]
    const { status } = await call(cancel)
    expect(status).toBe(200)
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE_REVERSAL"),
    ).toMatchObject({ amount: -65 })
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CANCELLATION"),
    ).toMatchObject({ amount: 20 })
  })

  it("keeps the charge when refundOnCancel is off (ROADMAP B15)", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "PENDING",
          merchantId: "merch_1",
          deliveryFee: 60,
          codFee: 5,
        }),
      ],
      [{ refundOnCancel: false }],
    ]
    dbState.updateResult = [
      makeOrder({ status: "CANCELLED", deliveryFee: 60, codFee: 5 }),
    ]
    const { status } = await call(cancel)
    expect(status).toBe(200)
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CHARGE_REVERSAL"),
    ).toBeUndefined()
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_CANCELLATION"),
    ).toBeUndefined()
  })

  it("merchant cannot cancel another merchant's PENDING order (403)", async () => {
    sessionState.value = merchantSession("merch_2")
    dbState.selectQueue = [
      [makeOrder({ status: "PENDING", merchantId: "merch_1" })],
    ]
    const { status, json } = await call(cancel)
    expect(status).toBe(403)
    expect(json).toEqual({ error: "Forbidden" })
  })

  // --- Admin / Super Admin window ---

  it("admin can cancel up to IN_TRANSIT", async () => {
    for (const status of [
      "PENDING",
      "APPROVED",
      "PICKED_UP",
      "IN_WAREHOUSE",
      "IN_TRANSIT",
    ] as const) {
      dbState.selectQueue = [[makeOrder({ status })]]
      dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
      sessionState.value = admin
      const result = await call(cancel)
      expect(result.status).toBe(200)
      expect(result.payload).toMatchObject({ status: "CANCELLED" })
    }
  })

  it("admin cannot cancel OUT_FOR_DELIVERY order", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "OUT_FOR_DELIVERY" })]]
    const { status, json } = await call(cancel)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Orders cannot be cancelled once they are out for delivery.",
    })
  })

  it("super admin can cancel up to IN_TRANSIT", async () => {
    sessionState.value = superAdmin
    dbState.selectQueue = [[makeOrder({ status: "IN_TRANSIT" })]]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED", cancelledBy: "Super" })
  })

  // --- Warehouse Admin window ---

  it("warehouse admin can cancel IN_WAREHOUSE order", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED" })
  })

  it("warehouse admin cannot cancel OUT_FOR_DELIVERY order", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ status: "OUT_FOR_DELIVERY" })]]
    const { status, json } = await call(cancel)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Orders cannot be cancelled once they are out for delivery.",
    })
  })

  it("warehouse admin cannot cancel a parcel held at another warehouse", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_2" })],
    ]
    const { status, json } = await call(cancel)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel belongs to a different warehouse.",
    })
  })

  it("warehouse admin can cancel an unassigned APPROVED order anywhere", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "APPROVED",
          warehouseId: "wh_2",
          pickupRiderId: null,
        }),
      ],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED" })
  })

  // --- Terminal / idempotency ---

  it("CANCELLED order cannot be cancelled again", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "CANCELLED" })]]
    const { status, json } = await call(cancel)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Orders cannot be cancelled once they are out for delivery.",
    })
  })

  // --- Optional reason field ---

  it("stores trimmed reason when provided", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "PENDING" })]]
    dbState.updateResult = [
      makeOrder({ status: "CANCELLED", cancelReason: "duplicate order" }),
    ]
    const { status, payload } = await call(cancel, {
      reason: "  duplicate order  ",
    })
    expect(status).toBe(200)
    expect(payload).toMatchObject({ cancelReason: "duplicate order" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORDER_CANCEL",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "CANCELLED" },
            cancelReason: { from: null, to: "duplicate order" },
          },
        },
      }),
      expect.anything(),
    )
  })

  it("stores null cancelReason when reason is omitted", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "PENDING" })]]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload?.cancelReason).toBeNull()
  })

  it("400 when reason exceeds 100 characters", async () => {
    sessionState.value = admin
    const { status } = await call(cancel, { reason: "x".repeat(101) })
    expect(status).toBe(400)
  })
})
