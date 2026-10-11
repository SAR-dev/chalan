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
import { applyBulkOrderTransition } from "@/features/orders/transitions"
import { logAudit } from "@/lib/audit"
import {
  businessDateString,
  businessDayEnd,
  businessDaysBetween,
} from "@/lib/timezone"
import { flushWebhookDeliveries } from "@/lib/webhooks"
import { PATCH as approve } from "./approve/route"
import { PATCH as assignPickupRider } from "./assign-pickup-rider/route"
import { PATCH as cancel } from "./cancel/route"
import { PATCH as delivered } from "./delivered/route"
import { PATCH as dispatch } from "./dispatch/route"
import { PATCH as failed } from "./failed/route"
import { PATCH as outForDelivery } from "./out-for-delivery/route"
import { PATCH as outForPickup } from "./out-for-pickup/route"
import { PATCH as pickedUp } from "./picked-up/route"
import { PATCH as reattempt } from "./reattempt/route"
import { PATCH as receive } from "./receive/route"
import { PATCH as returnRoute } from "./return/route"
import { PATCH as setExpectedDelivery } from "./set-expected-delivery/route"
import { PATCH as settleCod } from "./settle-cod/route"

// --- Controllable mock of the Drizzle data layer ----------------------------
// Routes do: `db.select().from(x).where(eq(...)).limit(1)` (awaited, FIFO) and
// `db.update(x).set(vals).where(eq(...)).returning()` (awaited).
const dbState = {
  selectQueue: [] as unknown[][],
  /**
   * Every `SELECT` the code under test actually issued, for the batch
   * statement-count assertions. The queue alone can only answer "how many were
   * left over", not "what did this batch cost".
   */
  selectCount: 0,
  updateResult: [] as unknown[],
  updatePayloads: [] as Record<string, unknown>[],
  insertResult: [] as unknown[],
  insertPayloads: [] as Record<string, unknown>[],
}

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => {
        // Counted here, not in `then`: a statement is a *constructed* query.
        // A thenable can be awaited more than once, which would inflate the
        // count and make "does batch size change the cost?" unanswerable.
        dbState.selectCount += 1
        return chain
      },
      where: () => chain,
      innerJoin: () => chain,
      // `resolveRoutePricing` joins delivery_city → delivery_zone to read the
      // zone name for the "cannot be priced" message.
      leftJoin: () => chain,
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
  // The bulk path batches the audit trail into one call.
  logAuditMany: vi.fn(() => Promise.resolve()),
}))

// Enqueueing the webhook event is one more read against `webhook_endpoint`, which
// would make the batch-cost assertions below count it as part of the transition's
// own work. The enqueue behaviour has its own spec in `webhooks.spec.ts`.
vi.mock("@/lib/webhooks", () => ({
  emitWebhookEvent: vi.fn(() => Promise.resolve()),
  // Delivery used to be the cron's job alone. Now every committed transition
  // nudges it, so the recorded calls are asserted below.
  flushWebhookDeliveries: vi.fn(),
}))

// Every transition ends by expiring the dashboard stat tiles.
// Mocked rather than left real for two reasons: the real `revalidateTag` throws
// "static generation store missing" outside a request, and the resulting
// `logger.warn` reads the clock — which would show up in the batch-stamping
// test below as extra `toISOString` reads and make it measure the logger rather// than the transition.
const revalidatedTags: string[] = []
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => {
    revalidatedTags.push(tag)
  },
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
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
    // NOT NULL in the schema and written at creation from the pickup hub
    // (`orders/route.ts` → `warehouseId: hub.id`), so a row without one cannot
    // exist. Defaulting this fixture to null used to model a state the data
    // Model forbids.
    warehouseId: "wh_1",
    pickupRiderId: null,
    deliveryRiderId: null,
    parcelWeightKg: 2,
    deliveryAttempts: 0,
    productCost: 500,
    codSettledAt: null,
    // NOT NULL in the schema, and the delivery-date transition reads it to work
    // out the promised day. A *fixed* instant rather than `new Date()`: this
    // spec spies on `Date.prototype.toISOString` to prove a batch shares one
    // clock, and a fixture that stamped its own value on every render would
    // consume ticks the assertion is counting. It also keeps every derived
    // promise deterministic across runs.
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  dbState.selectQueue = []
  dbState.selectCount = 0
  dbState.updateResult = []
  dbState.updatePayloads = []
  dbState.insertResult = []
  dbState.insertPayloads = []
  sessionState.value = null
  revalidatedTags.length = 0
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

/** Overridable lane rate. Defaults are a 10 KG lane starting at 100 TK. */
interface LaneOpts {
  baseRate?: number
  cancellationFee?: number
  extraRatePerKg?: number
  maxWeightKg?: number
}

/**
 * The four reads `resolveRoutePricing` issues for a lane that HAS a rate.
 *
 * Used by re-pricing (a rider corrected the weight) and by the approve guard,
 * which re-reads the lane to check its own weight limit — with no platform
 * fallback, a missing row means "keep the snapshot" instead.
 */
function pricedLane({
  baseRate = 100,
  cancellationFee = 0,
  extraRatePerKg = 0,
  maxWeightKg = 10,
}: LaneOpts = {}) {
  return [
    [{ city: "Dhaka" }], // warehouse
    [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city → zone
    [{ zone: { id: "ZN-2", name: "Gazipur" } }], // delivery city → zone
    [
      {
        fromZoneId: "ZN-1",
        toZoneId: "ZN-2",
        baseRate,
        extraRatePerKg,
        freeWeightKg: 1,
        maxWeightKg,
        codFeePercentage: 1,
        cancellationFee,
      },
    ],
  ]
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

  it("400 when the parcel exceeds the route's weight limit", async () => {
    // The limit belongs to the route, and the guard re-reads it because an
    // admin may have lowered the rate since creation.
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 10, deliveryCityId: "city_1" })],
      [{ status: "ACTIVE" }],
      ...pricedLane({ maxWeightKg: 5 }),
    ]
    const { status, json } = await call(approve)
    expect(status).toBe(400)
    expect(json).toEqual({
      error:
        "Parcel weight exceeds the 5 KG limit for this route and cannot be approved.",
    })
  })

  it("approves a parcel within the route's limit", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 4, deliveryCityId: "city_1" })],
      [{ status: "ACTIVE" }],
      ...pricedLane({ maxWeightKg: 5 }),
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    const { status } = await call(approve)
    expect(status).toBe(200)
  })

  it("403 when the warehouse admin's hub does not own the order", async () => {
    // The widened authorize must not widen scope: without this guard any
    // warehouse could clear another hub's PENDING queue. It runs before the
    // merchant/pricing lookups, so the order row is all the fixture needs.
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [[makeOrder({ warehouseId: "wh_2" })]]
    const { status, json } = await call(approve)
    expect(status).toBe(403)
    expect(json).toEqual({
      error: "This order belongs to a different warehouse.",
    })
  })

  it("approves a PENDING order in the warehouse admin's own hub", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ warehouseId: "wh_1" })],
      [{ status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    const { status } = await call(approve)
    expect(status).toBe(200)
  })

  it("400 when the merchant is suspended", async () => {
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 2 })],
      [{ status: "SUSPENDED" }],
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
      [{ status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    const { status, payload } = await call(approve)
    expect(status).toBe(200)
    expect(payload).toMatchObject({
      status: "APPROVED",
      approvedBy: "Admin Amy",
    })
    expect(typeof payload?.approvedAt).toBe("string")
    // Webhook delivery used to wait for the once-a-minute cron. Every committed
    // transition now nudges it, so a merchant sees the event in seconds.
    expect(flushWebhookDeliveries).toHaveBeenCalledTimes(1)
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
      // Audit now commits inside the transition's transaction.
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
    // Transition back instead of committing state without a trail.
    sessionState.value = admin
    dbState.selectQueue = [
      [makeOrder({ parcelWeightKg: 2 })],
      [{ status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ status: "APPROVED" })]
    vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"))
    const { status } = await call(approve)
    expect(status).toBe(500)
  })

  it("allows SUPER_ADMIN too", async () => {
    sessionState.value = superAdmin
    dbState.selectQueue = [[makeOrder()], [{ status: "ACTIVE" }]]
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
describe("PATCH /orders/:id/out-for-pickup", () => {
  it("403 unless RIDER", async () => {
    sessionState.value = warehouseAdmin()
    const { status } = await call(outForPickup)
    expect(status).toBe(403)
  })

  it("403 when not assigned to this rider", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_2", status: "APPROVED" })],
    ]
    const { status, json } = await call(outForPickup)
    expect(status).toBe(403)
    expect(json).toEqual({ error: "This pickup is not assigned to you." })
  })

  it("400 when not APPROVED", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "PENDING" })],
    ]
    const { status, json } = await call(outForPickup)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only APPROVED orders can go out for pickup.",
    })
  })

  it("400 when already out for pickup — it is not idempotent", async () => {
    // Re-running the transition would rewrite the timestamp a rider's manager
    // might be reading as "when they left", so it is refused rather than
    // silently updated.
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "OUT_FOR_PICKUP" })],
    ]
    const { status, json } = await call(outForPickup)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only APPROVED orders can go out for pickup.",
    })
  })

  it("goes out for pickup and stamps outForPickupAt", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    ]
    dbState.updateResult = [makeOrder({ status: "OUT_FOR_PICKUP" })]
    const { status, payload } = await call(outForPickup)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "OUT_FOR_PICKUP" })
    expect(typeof payload?.outForPickupAt).toBe("string")
    // Pickup is still locked at this point — this is what rule 2 hangs on.
    expect(payload?.pickedUpAt).toBeFalsy()
  })
})

describe("PATCH /orders/:id/picked-up", () => {
  it("403 unless RIDER with riderId", async () => {
    sessionState.value = admin
    const { status } = await call(pickedUp, { proofRefs: ["/uploads/a.png"] })
    expect(status).toBe(403)
  })

  it("403 when pickup not assigned to this rider", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_2", status: "OUT_FOR_PICKUP" })],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(403)
    expect(json).toEqual({ error: "This pickup is not assigned to you." })
  })

  it("400 while the order is still APPROVED, before going out for pickup", async () => {
    // The gate this whole feature exists for: a rider may not collect until
    // they have declared they are on the way. Asserted at the API because the
    // UI merely hides the button, and a hidden button proves nothing.
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "APPROVED" })],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only OUT_FOR_PICKUP orders can be picked up.",
    })
  })

  it("400 when the order never left PENDING either", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "PENDING" })],
    ]
    const { status, json } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Only OUT_FOR_PICKUP orders can be picked up.",
    })
  })

  it("routes to the pickup location's warehouse", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [makeOrder({ pickupRiderId: "rider_1", status: "OUT_FOR_PICKUP" })],
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
      [makeOrder({ pickupRiderId: "rider_1", status: "OUT_FOR_PICKUP" })],
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
          status: "OUT_FOR_PICKUP",
          parcelWeightKg: 1,
          deliveryFee: 60,
          codFee: 0,
          productCost: 500,
          deliveryCityId: "city_1",
        }),
      ], // order
      [{ id: "pl_1", warehouseId: "wh_9" }], // pickup location
      // resolveRoutePricing: a configured lane is required to re-price.
      ...pricedLane({ baseRate: 100, extraRatePerKg: 20 }),
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

  it("keeps the snapshotted fee when the lane's pricing row is gone", async () => {
    // A pickup must not be blocked because an admin deleted the rate after the
    // order shipped: the order already has its fee, and this branch only runs
    // for a weight correction. Still caps against the merchant's own limit.
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "OUT_FOR_PICKUP",
          parcelWeightKg: 1,
          deliveryFee: 60,
          codFee: 0,
          productCost: 500,
          deliveryCityId: "city_1",
        }),
      ], // order
      [{ id: "pl_1", warehouseId: "wh_9" }], // pickup location
      [{ city: "Dhaka" }], // warehouse
      [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city → zone
      [{ zone: { id: "ZN-2", name: "Gazipur" } }], // delivery city → zone
      [], // no zone_pricing row for this pair
    ]
    dbState.updateResult = [
      makeOrder({
        status: "PICKED_UP",
        parcelWeightKg: 3,
        deliveryFee: 60,
        codFee: 0,
        productCost: 500,
      }),
    ]

    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
      parcelWeightKg: 3,
    })

    expect(status).toBe(200)
    // `payload` is the last update payload: the weight was corrected, the fee
    // was deliberately left on the creation-time snapshot.
    expect(payload).toMatchObject({ parcelWeightKg: 3 })
    expect(payload).not.toHaveProperty("deliveryFee")
    expect(payload).not.toHaveProperty("merchantEarnings")
    // No re-priced fee means no charge adjustment to the merchant.
    expect(
      dbState.insertPayloads.filter((p) => p.type === "ORDER_CHARGE"),
    ).toEqual([])
  })

  it("accepts a corrected weight on an unpriced lane, keeping the snapshot fee", async () => {
    // There is no merchant cap left, so an unpriced lane has nothing to
    // validate against — and rejecting would strand an in-flight parcel. The
    // weight is corrected; the fee stays on the creation-time snapshot.
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "OUT_FOR_PICKUP",
          deliveryFee: 60,
          deliveryCityId: "city_1",
        }),
      ],
      [{ id: "pl_1", warehouseId: "wh_9" }],
      [{ city: "Dhaka" }],
      [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }],
      [{ zone: { id: "ZN-2", name: "Gazipur" } }],
      [], // lane unpriced
    ]
    dbState.updateResult = [
      makeOrder({
        status: "PICKED_UP",
        parcelWeightKg: 6,
        deliveryFee: 60,
        codFee: 0,
        productCost: 500,
      }),
    ]

    const { status, payload } = await call(pickedUp, {
      proofRefs: ["/uploads/a.png"],
      parcelWeightKg: 6,
    })

    expect(status).toBe(200)
    expect(payload).toMatchObject({ parcelWeightKg: 6 })
    expect(payload).not.toHaveProperty("deliveryFee")
    expect(
      dbState.insertPayloads.filter((p) => p.type === "ORDER_CHARGE"),
    ).toEqual([])
  })

  it("keeps a FLAT bundle price through a weight correction", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "OUT_FOR_PICKUP",
          deliveryFee: 50,
          deliveryCityId: "city_1",
          packageRuleType: "FLAT",
          packageRuleValue: 50,
        }),
      ],
      [{ id: "pl_1", warehouseId: "wh_1" }],
      ...pricedLane({ baseRate: 100, extraRatePerKg: 20 }),
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

  it("400 when the corrected weight exceeds the route's limit", async () => {
    sessionState.value = riderSession("rider_1")
    dbState.selectQueue = [
      [
        makeOrder({
          pickupRiderId: "rider_1",
          status: "OUT_FOR_PICKUP",
          deliveryCityId: "city_1",
        }),
      ],
      [{ id: "pl_1", warehouseId: "wh_9" }],
      // The route's own limit is the only one now — 5 KG here, so 6 is over.
      ...pricedLane({ baseRate: 100, extraRatePerKg: 20, maxWeightKg: 5 }),
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

  // There is no "no warehouse yet" row to receive: `order.warehouseId` is
  // NOT NULL and is written at creation from the pickup hub. The scope
  // predicate and its in-memory twin dropped their `warehouseId is null`
  // clause for the same reason — a clause that can never match only forced a
  // Bitmap-OR over an index-friendly predicate.
  //
  // Pinned here so that if the column is ever made nullable (an intake-
  // candidate flow), the change has to be made consciously in both places.
  it("has no null-warehouse receive path", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PICKED_UP", warehouseId: null })],
    ]
    dbState.updateResult = [makeOrder({ status: "IN_WAREHOUSE" })]
    const { status, json } = await call(receive)
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel is held at a different warehouse.",
    })
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
    // Delivery credits the GROSS collected COD; the ORDER_CHARGE row
    // written at creation nets it down to the merchant's earnings.
    expect(
      dbState.insertPayloads.find((p) => p.type === "ORDER_EARNINGS"),
    ).toMatchObject({ amount: -750, status: "SETTLED" })
  })

  it("credits only the amount actually collected (partial COD)", async () => {
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

  it("400 when a shortfall has no reason", async () => {
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

  it("400 when collecting more than the COD", async () => {
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

  it("returns the bundle quota when the returned order had one", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "FAILED_ATTEMPT",
          warehouseId: "wh_1",
          merchantPackageId: "mp_1",
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({ status: "RETURNED", merchantPackageId: "mp_1" }),
    ]
    const { status } = await call(returnRoute, { reason: "unreachable" })
    expect(status).toBe(200)

    // A parcel that never really shipped gives its quota back — the same
    // GREATEST(ordersUsed - 1, 0) update the cancel path performs.
    expect(dbState.updatePayloads.some((p) => "ordersUsed" in p)).toBe(true)
  })

  it("leaves bundle quota alone when the returned order had no package", async () => {
    sessionState.value = warehouseAdmin("wh_1")
    dbState.selectQueue = [
      [makeOrder({ status: "FAILED_ATTEMPT", warehouseId: "wh_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "RETURNED" })]
    const { status } = await call(returnRoute, { reason: "unreachable" })
    expect(status).toBe(200)
    expect(dbState.updatePayloads.some((p) => "ordersUsed" in p)).toBe(false)
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
describe("PATCH /orders/:id/set-expected-delivery", () => {
  it("403 for a rider", async () => {
    sessionState.value = riderSession("rider_1")
    const { status } = await call(setExpectedDelivery, { date: "2030-01-01" })
    expect(status).toBe(403)
  })

  it("403 for a warehouse admin whose warehouse does not hold it", async () => {
    sessionState.value = warehouseAdmin()
    dbState.selectQueue = [
      [makeOrder({ status: "PENDING", warehouseId: "wh_other" })],
    ]
    const { status, json } = await call(setExpectedDelivery, {
      date: "2030-01-01",
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "This parcel is held at a different warehouse.",
    })
  })

  it("refuses to move the date once delivered", async () => {
    // The date is finalized on delivery — rewriting it afterwards would let the
    // record claim a promise the parcel never met.
    sessionState.value = admin
    dbState.selectQueue = [
      [
        makeOrder({
          status: "DELIVERED",
          deliveredAt: new Date().toISOString(),
        }),
      ],
    ]
    const { status, json } = await call(setExpectedDelivery, {
      date: "2030-01-01",
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "The delivery date is final once the parcel is delivered.",
    })
  })

  it("refuses a date that predates the order", async () => {
    sessionState.value = admin
    dbState.selectQueue = [[makeOrder({ status: "PENDING" })]]
    const { status, json } = await call(setExpectedDelivery, {
      date: "2000-01-01",
    })
    expect(status).toBe(400)
    expect(json).toEqual({
      error: "Delivery date cannot be before the order was created.",
    })
  })

  it("rejects anything that is not a plain YYYY-MM-DD", async () => {
    sessionState.value = admin
    const { status } = await call(setExpectedDelivery, {
      date: "next Tuesday",
    })
    expect(status).toBe(400)
  })

  it("sets the date to end of that day and keeps the day count in step", async () => {
    sessionState.value = warehouseAdmin()
    const order = makeOrder({ status: "PENDING", warehouseId: "wh_1" })
    dbState.selectQueue = [[order]]
    dbState.updateResult = [makeOrder({ status: "PENDING" })]

    const { status, payload } = await call(setExpectedDelivery, {
      date: "2030-01-01",
    })
    expect(status).toBe(200)
    expect(payload?.expectedDeliveryAt).toBe(
      businessDayEnd("2030-01-01").toISOString(),
    )
    // The two must move together — a count that disagreed with the date would
    // let "2 days" sit next to a promise three weeks out.
    expect(payload?.expectedDeliveryDays).toBe(
      businessDaysBetween(
        businessDateString(new Date(order.createdAt)),
        "2030-01-01",
      ),
    )
  })
})

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

  it("merchant can cancel while out for pickup — that is still before collection", async () => {
    // The merchant's rule is stated as "before they are picked up", and going
    // out for pickup happens before that. Refusing it here would put the real
    // boundary somewhere other than the one the error message names.
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [makeOrder({ status: "OUT_FOR_PICKUP", merchantId: "merch_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED" })
  })

  it("admin can cancel an OUT_FOR_PICKUP order, as they can a PICKED_UP one", async () => {
    // The admin window runs up to OUT_FOR_DELIVERY. OUT_FOR_PICKUP precedes
    // PICKED_UP — which is cancellable — so excluding it would make the
    // boundary move backwards as a parcel advances.
    sessionState.value = warehouseAdmin()
    dbState.selectQueue = [
      [makeOrder({ status: "OUT_FOR_PICKUP", warehouseId: "wh_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status, payload } = await call(cancel)
    expect(status).toBe(200)
    expect(payload).toMatchObject({ status: "CANCELLED" })
  })

  it("refunds the full creation charge when cancelled before pickup", async () => {
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

  it("returns the bundle quota when the cancelled order had one", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [
        makeOrder({
          status: "PENDING",
          merchantId: "merch_1",
          merchantPackageId: "mp_1",
        }),
      ],
    ]
    dbState.updateResult = [
      makeOrder({ status: "CANCELLED", merchantPackageId: "mp_1" }),
    ]
    const { status } = await call(cancel)
    expect(status).toBe(200)

    // The quota refund is a GREATEST(ordersUsed - 1, 0) update on the bundle.
    expect(dbState.updatePayloads.some((p) => "ordersUsed" in p)).toBe(true)
  })

  it("leaves bundle quota alone when the cancelled order had no package", async () => {
    sessionState.value = merchantSession("merch_1")
    dbState.selectQueue = [
      [makeOrder({ status: "PENDING", merchantId: "merch_1" })],
    ]
    dbState.updateResult = [makeOrder({ status: "CANCELLED" })]
    const { status } = await call(cancel)
    expect(status).toBe(200)
    expect(dbState.updatePayloads.some((p) => "ordersUsed" in p)).toBe(false)
  })

  it("charges the cancellation fee when cancelled after pickup", async () => {
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

  it("keeps the charge when refundOnCancel is off", async () => {
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
      "OUT_FOR_PICKUP",
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

// ---------------------------------------------------------------------------
// A 100-order bulk transition used to cost ~900 statements in one transaction:
// the guard re-read the merchant and re-resolved the lane (5 queries) for
// *every* row, each row then got its own `UPDATE ... WHERE id =`, and each row
// stamped its own `Date.now()` so those SET payloads could never have been
// Merged even if they had been attempted.
//
// The invariant that matters: adding more orders in the same merchant and on
// the same lane must not add statements. Only genuinely new keys (a second
// merchant, a second lane) may cost more, and only once each.
// ---------------------------------------------------------------------------
describe("bulk transition batch cost", () => {
  /**
   * Run a bulk `approve` over `n` orders that share one merchant and one lane,
   * and report the statements it cost.
   */
  async function bulkApprove(n: number) {
    sessionState.value = superAdmin
    dbState.selectCount = 0
    dbState.updatePayloads = []
    dbState.insertPayloads = []
    const orders = Array.from({ length: n }, (_, i) =>
      makeOrder({ id: `order_${i}`, deliveryCityId: "city_1" }),
    )
    dbState.selectQueue = [
      // 1. the locked batch
      orders,
      // 2. the merchant status
      [{ status: "ACTIVE" }],
      // 3-6. resolveRoutePricing four reads for this lane
      ...pricedLane(),
    ]
    dbState.updateResult = orders.map((o) => ({ ...o, status: "APPROVED" }))

    const res = await applyBulkOrderTransition(
      "approve",
      orders.map((o) => o.id),
      {},
    )
    expect(res.status).toBe(200)
    await res.json()
    return {
      selects: dbState.selectCount,
      updates: dbState.updatePayloads.length,
      historyInserts: dbState.insertPayloads.length,
    }
  }

  it("costs the same for 2 orders as for 25", async () => {
    const small = await bulkApprove(2)
    const large = await bulkApprove(25)
    // The whole point: the batch size is not in the statement count. Before the
    // fix this was ~5 reads + 1 write per order, so 25 rows cost ~150.
    expect(large.selects).toBe(small.selects)
    expect(large.selects).toBeLessThan(12)
  })

  it("writes one UPDATE for the whole batch, not one per order", async () => {
    const { updates } = await bulkApprove(25)
    expect(updates).toBe(1)
  })

  it("stamps every row with the same instant", async () => {
    // This is what makes the grouping above legal, so it has to be a real
    // assertion: make the clock *advance* on every read, and require one
    // UPDATE. If `buildUpdate` read its own `Date.now()`, each row would get a
    // different `approvedAt`, the SET payloads would all differ, and the batch
    // would fall back to one UPDATE per order.
    let tick = 0
    // Spelled out rather than computed via `new Date(...).toISOString()`, which
    // is the very method under spy and would recurse.
    const clock = vi
      .spyOn(Date.prototype, "toISOString")
      .mockImplementation(() => `2026-01-01T00:00:0${tick++}.000Z`)
    try {
      sessionState.value = superAdmin
      dbState.selectQueue = [
        [makeOrder({ id: "order_a" }), makeOrder({ id: "order_b" })],
        [{ status: "ACTIVE" }],
      ]
      dbState.updateResult = [
        makeOrder({ id: "order_a", status: "APPROVED" }),
        makeOrder({ id: "order_b", status: "APPROVED" }),
      ]
      dbState.updatePayloads = []
      const res = await applyBulkOrderTransition(
        "approve",
        ["order_a", "order_b"],
        {},
      )
      expect(res.status).toBe(200)
      expect(dbState.updatePayloads).toHaveLength(1)
      // And both rows carry the batch's single instant, not their own.
      expect(dbState.updatePayloads[0].approvedAt).toBe(
        "2026-01-01T00:00:00.000Z",
      )
      expect(tick).toBe(1)
    } finally {
      clock.mockRestore()
    }
  })

  it("expires the dashboard stat tiles after a successful transition", async () => {
    // The cached tiles on /dashboard, /dashboard/riders and
    // /warehouse/cod-settlement would otherwise keep serving pre-transition
    // numbers until the 30s TTL ran out. Asserted here because a missing
    // `refreshStats` call is invisible: the write succeeds, the response is
    // 200, and only the tile is quietly wrong.
    sessionState.value = superAdmin
    dbState.selectQueue = [
      [makeOrder({ id: "order_a" })],
      [{ status: "ACTIVE" }],
    ]
    dbState.updateResult = [makeOrder({ id: "order_a", status: "APPROVED" })]

    const res = await applyBulkOrderTransition("approve", ["order_a"], {})

    expect(res.status).toBe(200)
    expect(revalidatedTags).toContain("stat:order")
  })

  it("leaves the tiles alone when the transition was rejected", async () => {
    // A guard rejection means nothing was written, so expiring the tiles would
    // throw away a cache entry that is still correct.
    sessionState.value = superAdmin
    // Not APPROVED-able: already APPROVED, so the guard refuses it.
    dbState.selectQueue = [
      [makeOrder({ id: "order_a", status: "APPROVED" })],
      [{ status: "APPROVED" }],
    ]

    const res = await applyBulkOrderTransition("approve", ["order_a"], {})

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(revalidatedTags).toEqual([])
  })

  it("still writes one status-history row per order", async () => {
    // The batching must not lose per-row detail: history is append-only and
    // one row per order is the point of the table.
    const { historyInserts } = await bulkApprove(5)
    expect(historyInserts).toBe(1)
    const payload = dbState.insertPayloads.at(-1) as unknown as {
      orderId: string
      toStatus: string
    }[]
    expect(payload).toHaveLength(5)
    expect(payload.every((r) => r.toStatus === "APPROVED")).toBe(true)
  })

  /**
   * Run a bulk `approve` over `orders` and report what it cost, asserting that
   * the queued read results were consumed *exactly* — an exhausted queue is
   * what makes the absolute count below trustworthy, since a resolver that
   * bailed out early would otherwise silently read fewer rows. Pass
   * `drained: false` for a fixture whose queue is deliberately longer than the
   * code needs (see the two-lane case below).
   */
  async function approveBatch(
    orders: (ReturnType<typeof makeOrder> & {
      merchantId: string
      deliveryCityId: string
    })[],
    { drained = true }: { drained?: boolean } = {},
  ) {
    sessionState.value = superAdmin
    dbState.selectCount = 0
    dbState.updatePayloads = []

    // The mock hands out queued results in call order, so this must follow the
    // guard's real read order: per row, merchant first, then its lane — and a
    // key already seen issues nothing at all.
    const queue: unknown[][] = [orders]
    const seenMerchants = new Set<string>()
    const seenLanes = new Set<string>()
    for (const o of orders) {
      if (!seenMerchants.has(o.merchantId)) {
        seenMerchants.add(o.merchantId)
        queue.push([{ status: "ACTIVE" }])
      }
      const lane = `${o.warehouseId}|${o.deliveryCityId}`
      if (!seenLanes.has(lane)) {
        seenLanes.add(lane)
        queue.push(...pricedLane())
      }
    }
    dbState.selectQueue = queue
    dbState.updateResult = orders.map((o) => ({ ...o, status: "APPROVED" }))

    const res = await applyBulkOrderTransition(
      "approve",
      orders.map((o) => o.id),
      {},
    )
    expect(res.status).toBe(200)
    if (drained) expect(dbState.selectQueue).toHaveLength(0)
    return {
      selects: dbState.selectCount,
      updates: dbState.updatePayloads.length,
    }
  }

  /** Four orders sharing one lane, spread over the given merchants. */
  function fourOrdersOn(
    lanes: string[],
    merchants: string[],
  ): (ReturnType<typeof makeOrder> & {
    merchantId: string
    deliveryCityId: string
  })[] {
    const cell = (i: number) => ({
      merchantId: merchants[i % merchants.length],
      deliveryCityId: lanes[Math.floor(i / merchants.length) % lanes.length],
    })
    return Array.from({ length: 4 }, (_, i) => ({
      ...makeOrder({ id: `o_${i}` }),
      ...cell(i),
    }))
  }

  it("reads each merchant in the batch exactly once", async () => {
    // 1 batch lock + 2 merchant reads + 4 reads for the one shared lane
    // + 1 notification-recipient read per *distinct* merchant.
    // Without the memo this was one merchant read *per order* — 4, and it grew
    // with the batch rather than with the number of distinct merchants. The
    // recipient lookup is memoised the same way, so it is 2 here (not 4) and 1
    // in the single-merchant case: it tracks distinct merchants, not rows.
    expect(
      await approveBatch(fourOrdersOn(["city_1"], ["merch_1", "merch_2"])),
    ).toMatchObject({ selects: 9, updates: 1 })
    expect(
      await approveBatch(fourOrdersOn(["city_1"], ["merch_1"])),
    ).toMatchObject({ selects: 7, updates: 1 })
  })

  it("resolves each lane in the batch exactly once", async () => {
    // The guard's lane key is `warehouseId|deliveryCityId`, so a second
    // *warehouse* is the clean way to get a second key: both origins price out
    // through the same fixture rows.
    //
    // 1 lock + 1 merchant + 2 lanes x 4 reads + 1 recipient read = 11, and the
    // queue drains exactly. Without the memo each of the 4 orders resolved its
    // own lane: 22 statements. This also pins the memo's contract — it must
    // store a settled value, not the re-runnable query builder, or every cache
    // hit would issue the query again and desynchronise the reads.
    type BatchOrder = ReturnType<typeof makeOrder> & {
      merchantId: string
      deliveryCityId: string
    }
    const orders = fourOrdersOn(["city_1"], ["merch_1"]).map(
      (o, i): BatchOrder => ({ ...o, warehouseId: i % 2 ? "wh_2" : "wh_1" }),
    )
    expect(await approveBatch(orders)).toMatchObject({
      selects: 11,
      updates: 1,
    })
  })
})
