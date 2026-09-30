import { createId } from "@paralleldrive/cuid2"
import { eq, inArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import type { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import {
  cancellationChargeAmount,
  codCollectedAmount,
  orderChargeReversalAmount,
  toPaisa,
} from "@/lib/balance-ledger"
import { db } from "@/lib/db"
import { pickupWarehouseId } from "@/lib/db/order-lookup"
import {
  balanceTransaction,
  merchant,
  merchantBalance,
  merchantPackage,
  order,
  orderStatusHistory,
  platformConfig,
  rider,
} from "@/lib/db/schema"
import { hasNavPermission } from "@/lib/nav-config"
import { resolveRoutePricing } from "@/lib/order-pricing"
import { applyPackageRule } from "@/lib/packages"
import { calcDeliveryCharge, calcMerchantEarnings } from "@/lib/pricing"
import {
  orderAssignPickupRiderSchema,
  orderCancelSchema,
  orderDeliveredSchema,
  orderDispatchSchema,
  orderFailedSchema,
  orderPickedUpSchema,
  orderReturnSchema,
  parseBody,
} from "@/lib/validation"

type Session = NonNullable<Awaited<ReturnType<typeof requireSession>>>
type OrderRow = typeof order.$inferSelect

// A short-circuit error (mapped to a NextResponse) or null to continue.
type GuardError = { error: string; status: number } | null

interface TransitionContext<Body> {
  order: OrderRow
  session: Session
  body: Body
}

interface TransitionDef<Schema extends z.ZodType | undefined = undefined> {
  authorize: (session: Session) => boolean
  schema?: Schema
  guard: (
    ctx: TransitionContext<
      Schema extends z.ZodType ? z.infer<Schema> : undefined
    >,
  ) => Promise<GuardError> | GuardError
  buildUpdate: (
    ctx: TransitionContext<
      Schema extends z.ZodType ? z.infer<Schema> : undefined
    >,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
}

function defineTransition<Schema extends z.ZodType | undefined>(
  def: TransitionDef<Schema>,
): TransitionDef<Schema> {
  return def
}

// In-memory twin of buildWarehouseOrderScope() (src/lib/db/order-scope.ts):
// the same three clauses that decide which rows a WAREHOUSE_ADMIN sees in
// the list/detail endpoints must decide which rows they may act on.
function warehouseOrderInScope(
  o: OrderRow,
  warehouseId: string | null | undefined,
): boolean {
  if (!warehouseId) return false
  if (o.warehouseId === warehouseId) return true
  if (!o.warehouseId && o.status === "PICKED_UP") return true
  return o.status === "APPROVED" && !o.pickupRiderId
}

/** A business-rule failure raised from `buildUpdate` (mapped to a 400). */
class TransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransitionError"
  }
}

export const ORDER_TRANSITIONS = {
  approve: defineTransition({
    authorize: (me) => me.role === "SUPER_ADMIN",
    guard: async ({ order: o }) => {
      if (o.status !== "PENDING") {
        return { error: "Only PENDING orders can be approved", status: 400 }
      }
      const [merchantRow] = await db
        .select({ status: merchant.status })
        .from(merchant)
        .where(eq(merchant.id, o.merchantId))
        .limit(1)
      // A suspended/closed merchant must not have new orders enter the pipeline
      // (ROADMAP B8). New orders are already blocked at creation; this closes
      // the gap for PENDING orders queued before suspension.
      if (merchantRow && merchantRow.status !== "ACTIVE") {
        return {
          error: "This merchant is not active; the order cannot be approved.",
          status: 400,
        }
      }
      // The lane's own `zone_pricing.maxWeightKg` is the only weight limit.
      // Re-checked here because an admin may have lowered the rate between
      // creation and approval — and approving would dispatch a parcel the route
      // no longer accepts. If the lane cannot be resolved the order is still
      // blocked by creation, so this degrades to not re-checking rather than
      // stranding an already-charged order.
      const resolved = await resolveRoutePricing(
        o.warehouseId,
        o.deliveryCityId,
      )
      if (resolved.ok && o.parcelWeightKg > resolved.pricing.maxWeightKg) {
        return {
          error: `Parcel weight exceeds the ${resolved.pricing.maxWeightKg} KG limit for this route and cannot be approved.`,
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ session }) => ({
      status: "APPROVED",
      approvedBy: session.name,
      approvedAt: new Date().toISOString(),
    }),
  }),

  "assign-pickup-rider": defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    schema: orderAssignPickupRiderSchema,
    guard: async ({ order: o, session, body }) => {
      if (o.status !== "APPROVED") {
        return {
          error: "Only APPROVED orders can be assigned a pickup rider.",
          status: 400,
        }
      }
      if (o.pickupRiderId) {
        return {
          error: "This order already has a pickup rider assigned.",
          status: 400,
        }
      }
      const [riderRow] = await db
        .select()
        .from(rider)
        .where(eq(rider.id, body.riderId))
        .limit(1)
      if (!riderRow || !riderRow.isActive) {
        return { error: "Select an active pickup rider.", status: 400 }
      }
      if (riderRow.taskType === "DELIVERY") {
        return {
          error:
            "Select a pickup rider — this rider is a warehouse delivery rider.",
          status: 400,
        }
      }
      if (riderRow.warehouseId !== session.warehouseId) {
        return {
          error: "Select a pickup rider based at this warehouse.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ body }) => ({
      pickupRiderId: body.riderId,
      assignedAt: new Date().toISOString(),
    }),
  }),

  dispatch: defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    schema: orderDispatchSchema,
    guard: async ({ order: o, session, body }) => {
      if (o.status !== "IN_WAREHOUSE") {
        return {
          error: "Only IN_WAREHOUSE parcels can be dispatched.",
          status: 400,
        }
      }
      if (o.warehouseId !== session.warehouseId) {
        return {
          error: "This parcel is held at a different warehouse.",
          status: 400,
        }
      }
      const [riderRow] = await db
        .select()
        .from(rider)
        .where(eq(rider.id, body.riderId))
        .limit(1)
      if (!riderRow || !riderRow.isActive) {
        return { error: "Select an active delivery rider.", status: 400 }
      }
      if (riderRow.warehouseId !== session.warehouseId) {
        return {
          error: "Select a delivery rider based at this warehouse.",
          status: 400,
        }
      }
      if (riderRow.taskType === "PICKUP") {
        return {
          error: "Select a delivery rider — this rider is a pickup rider.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ session, body }) => ({
      status: "IN_TRANSIT",
      deliveryRiderId: body.riderId,
      dispatchedAt: new Date().toISOString(),
      dispatchedBy: session.name,
    }),
  }),

  "picked-up": defineTransition({
    authorize: (me) => me.role === "RIDER" && Boolean(me.riderId),
    schema: orderPickedUpSchema,
    guard: ({ order: o, session }) => {
      if (o.pickupRiderId !== session.riderId) {
        return { error: "This pickup is not assigned to you.", status: 403 }
      }
      if (o.status !== "APPROVED") {
        return { error: "Only APPROVED orders can be picked up.", status: 400 }
      }
      return null
    },
    buildUpdate: async ({ order: o, body }) => {
      const warehouseId = o.pickupLocationId
        ? await pickupWarehouseId(o.pickupLocationId)
        : null
      const update: Record<string, unknown> = {
        status: "PICKED_UP",
        pickedUpAt: new Date().toISOString(),
        pickupProofRefs: body.proofRefs,
        warehouseId,
      }
      // The rider may correct the parcel weight at pickup. Re-price the delivery
      // and reject a weight over the lane's limit.
      //
      // The lane's `zone_pricing.maxWeightKg` is the only weight limit. There is
      // no per-merchant cap to fall back on, so on an unpriced lane there is
      // nothing to validate against — the correction is accepted and the fee
      // stays on the creation-time snapshot. Blocking the pickup would strand an
      // in-flight parcel, which is the worse failure than a weight we cannot
      // re-check (the order is already charged). The lane gap itself is surfaced
      // on the dashboard coverage list and blocks *new* orders at creation.
      // See `lib/order-pricing.ts`.
      if (body.parcelWeightKg !== undefined) {
        const resolved = await resolveRoutePricing(
          o.warehouseId,
          o.deliveryCityId,
        )

        if (resolved.ok && body.parcelWeightKg > resolved.pricing.maxWeightKg) {
          throw new TransitionError(
            `Parcel weight exceeds the ${resolved.pricing.maxWeightKg} KG limit.`,
          )
        }

        update.parcelWeightKg = body.parcelWeightKg
        if (resolved.ok) {
          // The bundle rule is frozen onto the order at creation, so re-apply
          // the snapshotted rule to the re-priced zone fee. A FLAT rule is
          // weight-independent, so a weight correction under a flat bundle
          // yields no delivery-fee delta — exactly as at creation.
          const { total: zoneDeliveryFee } = calcDeliveryCharge(
            resolved.pricing,
            body.parcelWeightKg,
          )
          const deliveryFee = applyPackageRule(
            zoneDeliveryFee,
            o.packageRuleType
              ? {
                  ruleType: o.packageRuleType,
                  ruleValue: o.packageRuleValue ?? 0,
                }
              : null,
          )
          update.deliveryFee = deliveryFee
          update.merchantEarnings = calcMerchantEarnings(
            o.productCost,
            deliveryFee,
            o.codFee,
          )
        }
        // Unpriced lane: `deliveryFee` and `merchantEarnings` stay on the
        // creation-time snapshot.
      }
      return update
    },
  }),

  receive: defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    guard: ({ order: o, session }) => {
      if (o.status !== "PICKED_UP") {
        return {
          error: "Only PICKED_UP parcels can be received.",
          status: 400,
        }
      }
      if (!warehouseOrderInScope(o, session.warehouseId)) {
        return {
          error: "This parcel is held at a different warehouse.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ session }) => ({
      status: "IN_WAREHOUSE",
      warehouseId: session.warehouseId,
      receivedAtWarehouseAt: new Date().toISOString(),
      receivedByWarehouse: session.name,
    }),
  }),

  "out-for-delivery": defineTransition({
    authorize: (me) => me.role === "RIDER" && Boolean(me.riderId),
    guard: ({ order: o, session }) => {
      if (o.deliveryRiderId !== session.riderId) {
        return { error: "This delivery is not assigned to you.", status: 403 }
      }
      if (o.status !== "IN_TRANSIT") {
        return {
          error: "Only IN_TRANSIT parcels can go out for delivery.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ order: o }) => ({
      status: "OUT_FOR_DELIVERY",
      outForDeliveryAt: new Date().toISOString(),
      deliveryAttempts: (o.deliveryAttempts ?? 0) + 1,
    }),
  }),

  delivered: defineTransition({
    authorize: (me) => me.role === "RIDER" && Boolean(me.riderId),
    schema: orderDeliveredSchema,
    guard: ({ order: o, session, body }) => {
      if (o.deliveryRiderId !== session.riderId) {
        return { error: "This delivery is not assigned to you.", status: 403 }
      }
      if (o.status !== "OUT_FOR_DELIVERY") {
        return {
          error: "Only OUT_FOR_DELIVERY parcels can be marked delivered.",
          status: 400,
        }
      }
      // Partial COD (ROADMAP B2): can't collect more than owed, and a shortfall
      // must be explained.
      const collected = body.amountCollected
      if (collected !== undefined && collected > o.productCost) {
        return {
          error: "Collected amount cannot exceed the COD amount.",
          status: 400,
        }
      }
      if (
        collected !== undefined &&
        collected < o.productCost &&
        !body.shortfallReason?.trim()
      ) {
        return {
          error:
            "A reason is required when collecting less than the COD amount.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ order: o, body }) => {
      const collected = body.amountCollected ?? o.productCost
      return {
        status: "DELIVERED",
        deliveredAt: new Date().toISOString(),
        deliveryProofRef: body.proofRef ?? `proof_${o.id.toLowerCase()}.jpg`,
        amountCollected: collected,
        deliveryShortfallReason: body.shortfallReason?.trim() || null,
        // Earnings follow the amount actually collected, not the expected COD.
        merchantEarnings: calcMerchantEarnings(
          collected,
          o.deliveryFee,
          o.codFee,
        ),
      }
    },
  }),

  failed: defineTransition({
    authorize: (me) => me.role === "RIDER" && Boolean(me.riderId),
    schema: orderFailedSchema,
    guard: ({ order: o, session }) => {
      if (o.deliveryRiderId !== session.riderId) {
        return { error: "This delivery is not assigned to you.", status: 403 }
      }
      if (o.status !== "OUT_FOR_DELIVERY") {
        return {
          error: "Only OUT_FOR_DELIVERY parcels can be marked failed.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ body }) => ({
      status: "FAILED_ATTEMPT",
      failedAttemptAt: new Date().toISOString(),
      failureNote: body.note.trim(),
    }),
  }),

  reattempt: defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    guard: ({ order: o, session }) => {
      if (o.status !== "FAILED_ATTEMPT") {
        return {
          error: "Only FAILED_ATTEMPT parcels can be reattempted.",
          status: 400,
        }
      }
      if (o.warehouseId !== session.warehouseId) {
        return {
          error: "This parcel is held at a different warehouse.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ order: o, session }) => {
      const now = new Date().toISOString()
      return {
        status: "OUT_FOR_DELIVERY",
        failureNote: null,
        failedAttemptAt: null,
        failedResolvedAt: now,
        failedResolvedBy: session.name,
        outForDeliveryAt: now,
        deliveryAttempts: (o.deliveryAttempts ?? 0) + 1,
      }
    },
  }),

  return: defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    schema: orderReturnSchema,
    guard: ({ order: o, session }) => {
      if (o.status !== "FAILED_ATTEMPT") {
        return {
          error: "Only FAILED_ATTEMPT parcels can be returned.",
          status: 400,
        }
      }
      if (o.warehouseId !== session.warehouseId) {
        return {
          error: "This parcel is held at a different warehouse.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ session, body }) => {
      const now = new Date().toISOString()
      return {
        status: "RETURNED",
        failedResolvedAt: now,
        failedResolvedBy: session.name,
        returnedAt: now,
        returnReason: body.reason.trim(),
      }
    },
  }),

  "settle-cod": defineTransition({
    authorize: (me) => me.role === "WAREHOUSE_ADMIN" && Boolean(me.warehouseId),
    guard: ({ order: o, session }) => {
      if (o.status !== "DELIVERED") {
        return { error: "Only DELIVERED parcels can be settled.", status: 400 }
      }
      if (o.warehouseId !== session.warehouseId) {
        return {
          error: "This parcel belongs to a different warehouse.",
          status: 400,
        }
      }
      if (o.codSettledAt) {
        return {
          error: "This parcel's COD is already settled.",
          status: 400,
        }
      }
      return null
    },
    buildUpdate: ({ session }) => ({
      codSettledAt: new Date().toISOString(),
      codSettledBy: session.name,
    }),
  }),

  cancel: defineTransition({
    // Merchants cancel from the Orders surface, so a moderator needs that grant
    // (ROADMAP 5.2 hard server checks).
    authorize: (me) =>
      me.role === "SUPER_ADMIN" ||
      me.role === "WAREHOUSE_ADMIN" ||
      (me.role === "MERCHANT" && hasNavPermission(me, "/merchant/orders")),
    schema: orderCancelSchema,
    guard: ({ order: o, session }) => {
      if (session.role === "MERCHANT") {
        if (o.merchantId !== session.merchantId) {
          return { error: "Forbidden", status: 403 }
        }
        const merchantAllowed = ["PENDING", "APPROVED"] as const
        if (!(merchantAllowed as readonly string[]).includes(o.status)) {
          return {
            error: "Orders can only be cancelled before they are picked up.",
            status: 400,
          }
        }
      } else {
        const adminAllowed = [
          "PENDING",
          "APPROVED",
          "PICKED_UP",
          "IN_WAREHOUSE",
          "IN_TRANSIT",
        ] as const
        if (!(adminAllowed as readonly string[]).includes(o.status)) {
          return {
            error: "Orders cannot be cancelled once they are out for delivery.",
            status: 400,
          }
        }
        if (
          session.role === "WAREHOUSE_ADMIN" &&
          !warehouseOrderInScope(o, session.warehouseId)
        ) {
          return {
            error: "This parcel belongs to a different warehouse.",
            status: 400,
          }
        }
      }
      return null
    },
    buildUpdate: ({ session, body }) => ({
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      cancelledBy: session.name,
      cancelReason: body?.reason?.trim() ?? null,
    }),
  }),
} as const

export type TransitionName = keyof typeof ORDER_TRANSITIONS

const ORDER_DIFF_FIELDS = [
  "status",
  "approvedBy",
  "approvedAt",
  "pickupRiderId",
  "assignedAt",
  "warehouseId",
  "pickedUpAt",
  "pickupProofRefs",
  "receivedAtWarehouseAt",
  "receivedByWarehouse",
  "deliveryRiderId",
  "dispatchedAt",
  "dispatchedBy",
  "outForDeliveryAt",
  "deliveredAt",
  "deliveryProofRef",
  "amountCollected",
  "failedAttemptAt",
  "failureNote",
  "deliveryAttempts",
  "failedResolvedAt",
  "failedResolvedBy",
  "returnedAt",
  "returnReason",
  "cancelledAt",
  "cancelledBy",
  "cancelReason",
  "codSettledAt",
  "codSettledBy",
] as const

const TRANSITION_LABELS: Record<TransitionName, string> = {
  approve: "Approved",
  "assign-pickup-rider": "Assigned pickup rider",
  dispatch: "Dispatched",
  "picked-up": "Marked picked up",
  "out-for-delivery": "Marked out for delivery",
  delivered: "Marked delivered",
  failed: "Marked failed delivery attempt",
  return: "Returned",
  reattempt: "Scheduled reattempt for",
  receive: "Received",
  "settle-cod": "Settled COD for",
  cancel: "Cancelled",
}

/** Free-text reason a transition carries, stored on its history row. */
function transitionNote(name: TransitionName, body: unknown): string | null {
  const b = (body ?? {}) as { note?: string; reason?: string }
  if (name === "failed") return b.note?.trim() || null
  if (name === "return" || name === "cancel") return b.reason?.trim() || null
  return null
}

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Writes the fee settlement for a terminal order (returned/cancelled): reverses
 * the creation `ORDER_CHARGE` and optionally charges the cancellation fee, then
 * moves the merchant balance by the net. Zero rows are skipped.
 */
async function applyFeeSettlement(
  tx: OrderTx,
  updated: OrderRow,
  actorName: string,
  opts: { label: string; refundFees: boolean; cancellationFee: number },
): Promise<void> {
  const reversal = opts.refundFees
    ? orderChargeReversalAmount(updated.deliveryFee, updated.codFee)
    : 0
  const cancellation = cancellationChargeAmount(opts.cancellationFee)

  if (reversal !== 0) {
    await tx.insert(balanceTransaction).values({
      merchantId: updated.merchantId,
      type: "ORDER_CHARGE_REVERSAL",
      amount: reversal,
      status: "SETTLED",
      note: `Order ${updated.id} ${opts.label} — delivery & COD fees refunded`,
      orderId: updated.id,
      createdBy: actorName,
    })
  }

  if (cancellation !== 0) {
    await tx.insert(balanceTransaction).values({
      merchantId: updated.merchantId,
      type: "ORDER_CANCELLATION",
      amount: cancellation,
      status: "SETTLED",
      note: `Order ${updated.id} ${opts.label} — cancellation fee`,
      orderId: updated.id,
      createdBy: actorName,
    })
  }

  const net = toPaisa(reversal + cancellation)
  if (net !== 0) {
    await tx
      .insert(merchantBalance)
      .values({
        id: createId(),
        merchantId: updated.merchantId,
        balance: net,
      })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${net}`,
          updatedAt: new Date().toISOString(),
        },
      })
  }
}

/**
 * The `refundOnCancel` platform toggle (ROADMAP B15). Read once per transaction
 * and threaded through, so a bulk cancel does not hit the config per order.
 */
async function loadRefundOnCancelPolicy(tx: OrderTx): Promise<boolean> {
  const [policy] = await tx
    .select({ refundOnCancel: platformConfig.refundOnCancel })
    .from(platformConfig)
    .limit(1)
  return policy?.refundOnCancel ?? true
}

/**
 * Returns one order to the merchant's bundle quota. A cancelled/returned parcel
 * never really shipped, so the quota it took at creation is given back.
 * Clamped at zero so a double refund can never drive the counter negative.
 */
async function refundPackageQuota(
  tx: OrderTx,
  updated: OrderRow,
): Promise<void> {
  if (!updated.merchantPackageId) return
  await tx
    .update(merchantPackage)
    .set({
      ordersUsed: sql`GREATEST(${merchantPackage.ordersUsed} - 1, 0)`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(merchantPackage.id, updated.merchantPackageId))
}

/**
 * Every balance-ledger side effect of a transition, in one shared helper so the
 * single and bulk runners cannot drift.
 *
 * This is what closed a real gap: the bulk runner used to apply the status
 * change only, so bulk-cancelling never refunded the creation charge, never
 * charged the cancellation fee, and never returned the bundle quota.
 */
async function settleOrderFinancials(
  tx: OrderTx,
  before: OrderRow,
  updated: OrderRow,
  name: TransitionName,
  actorName: string,
  refundOnCancel: boolean,
): Promise<void> {
  // If the order is delivered, the platform has collected the COD from the
  // recipient — credit the merchant the GROSS amount (ROADMAP P0.4). The fee
  // charge written at creation nets this to the merchant's earnings, so a
  // later payout of those earnings settles the balance to zero.
  const collectedAmount = updated.amountCollected ?? updated.productCost
  if (name === "delivered" && collectedAmount > 0) {
    const collected = codCollectedAmount(collectedAmount)

    // Create ORDER_EARNINGS transaction — negative amount reduces merchant debt
    await tx.insert(balanceTransaction).values({
      merchantId: updated.merchantId,
      type: "ORDER_EARNINGS",
      amount: collected,
      status: "SETTLED",
      note: `Order ${updated.id} delivered — COD collected`,
      orderId: updated.id,
      createdBy: actorName,
    })

    // Upsert merchant balance — credit the collected COD
    await tx
      .insert(merchantBalance)
      .values({
        id: createId(),
        merchantId: updated.merchantId,
        balance: collected,
      })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${collected}`,
          updatedAt: new Date().toISOString(),
        },
      })
  }

  // A weight correction at pickup re-prices the delivery — adjust the creation
  // charge by the delivery-fee delta.
  if (name === "picked-up" && updated.deliveryFee !== before.deliveryFee) {
    const delta = toPaisa(updated.deliveryFee - before.deliveryFee)
    if (delta !== 0) {
      await tx.insert(balanceTransaction).values({
        merchantId: updated.merchantId,
        type: delta > 0 ? "ORDER_CHARGE" : "ORDER_CHARGE_REVERSAL",
        amount: delta,
        status: "SETTLED",
        note: `Order ${updated.id} picked up — weight corrected to ${updated.parcelWeightKg} kg`,
        orderId: updated.id,
        createdBy: actorName,
      })
      await tx
        .insert(merchantBalance)
        .values({
          id: createId(),
          merchantId: updated.merchantId,
          balance: delta,
        })
        .onConflictDoUpdate({
          target: merchantBalance.merchantId,
          set: {
            balance: sql`${merchantBalance.balance} + ${delta}`,
            updatedAt: new Date().toISOString(),
          },
        })
    }
  }

  // A returned order refunds the creation charge and charges the zone-pair
  // cancellation fee instead (ROADMAP B4). Net: the merchant's obligation
  // becomes just the cancellation fee.
  if (name === "return") {
    await applyFeeSettlement(tx, updated, actorName, {
      label: "returned",
      refundFees: true,
      cancellationFee: updated.cancellationFee,
    })
    await refundPackageQuota(tx, updated)
  }

  // A cancelled order is refunded the creation charge. Before pickup nothing
  // has been rendered, so the refund is total; once the parcel has moved, the
  // zone-pair cancellation fee applies instead (ROADMAP B4/B10). The
  // `refundOnCancel` platform toggle can disable the refund entirely (B15).
  if (name === "cancel") {
    const postPickup =
      before.status === "PICKED_UP" ||
      before.status === "IN_WAREHOUSE" ||
      before.status === "IN_TRANSIT"
    await applyFeeSettlement(tx, updated, actorName, {
      label: "cancelled",
      refundFees: refundOnCancel,
      cancellationFee:
        refundOnCancel && postPickup ? updated.cancellationFee : 0,
    })
    await refundPackageQuota(tx, updated)
  }
}

export async function applyOrderTransition(
  name: TransitionName,
  orderId: string,
  req: Request,
): Promise<NextResponse> {
  const def = ORDER_TRANSITIONS[name] as TransitionDef<z.ZodType | undefined>

  const me = await requireSession()
  if (!me) {
    return unauthorized()
  }
  if (!def.authorize(me)) {
    return forbidden()
  }

  let body: unknown
  if (def.schema) {
    const parsed = await parseBody(req, def.schema)
    if (parsed.error) {
      return parsed.error
    }
    body = parsed.data
  }

  const response = await db.transaction(async (tx) => {
    const [orderRow] = await tx
      .select()
      .from(order)
      .where(eq(order.id, orderId))
      .for("update")
      .limit(1)
    if (!orderRow) {
      return notFound("Order not found")
    }

    const ctx = {
      order: orderRow,
      session: me,
      body,
    } as TransitionContext<never>

    const guardError = await def.guard(ctx)
    if (guardError) {
      return NextResponse.json(
        { error: guardError.error },
        { status: guardError.status },
      )
    }

    let updateValues: Record<string, unknown>
    try {
      updateValues = await def.buildUpdate(ctx)
    } catch (err) {
      if (err instanceof TransitionError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }
    const [updated] = await tx
      .update(order)
      .set(updateValues)
      .where(eq(order.id, orderId))
      .returning()

    // COD credit, weight-delta re-charge, terminal fee settlement and
    // bundle-quota refund all live in one helper, shared with the bulk runner.
    const refundOnCancel =
      name === "cancel" ? await loadRefundOnCancelPolicy(tx) : true
    await settleOrderFinancials(
      tx,
      orderRow,
      updated,
      name,
      me.name,
      refundOnCancel,
    )

    // Audit and status history commit with the change they describe
    // (ROADMAP P1.4): a crash between commit and the audit write used to lose
    // the trail entirely. Inside the transaction a failure rolls the whole
    // change back, so state and trail can never diverge.
    const diff = diffEntity(orderRow, updated, ORDER_DIFF_FIELDS)
    await logAudit(
      {
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: `ORDER_${name.toUpperCase().replace(/-/g, "_")}`,
        entityType: "order",
        entityId: updated.id,
        description: `${TRANSITION_LABELS[name]} order ${updated.id}`,
        metadata: diff ? { diff } : null,
      },
      tx,
    )
    await tx.insert(orderStatusHistory).values({
      orderId: updated.id,
      fromStatus: orderRow.status,
      toStatus: updated.status,
      transition: name,
      actorId: me.userId,
      actorName: me.name,
      actorRole: me.role,
      note: transitionNote(name, body),
    })

    return NextResponse.json(updated)
  })

  return response
}

/**
 * Apply a transition to many orders at once, reusing the exact same
 * authorize + guard + buildUpdate as the single-order path.
 *
 * Orders that fail their guard are skipped (partial success is preserved and
 * reported via `count`), matching the old bulk-route behaviour without
 * duplicating the guard logic. Runs inside one transaction.
 *
 * `body` is the already-validated request payload from the calling route
 * (e.g. `{ ids, riderId }`) — the transition's guard/buildUpdate read only the
 * fields they care about.
 */
export async function applyBulkOrderTransition(
  name: TransitionName,
  ids: string[],
  body: Record<string, unknown>,
): Promise<NextResponse> {
  const def = ORDER_TRANSITIONS[name] as TransitionDef<z.ZodType | undefined>

  const me = await requireSession()
  if (!me) return unauthorized()
  if (!def.authorize(me)) return forbidden()

  const response = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(order)
      .where(inArray(order.id, ids))
      .for("update")

    if (rows.length === 0) {
      return badRequest("No orders found for the given IDs.")
    }

    const beforeById = new Map(rows.map((row) => [row.id, row]))

    let firstFail: GuardError = null
    const updates: { id: string; values: Record<string, unknown> }[] = []
    for (const orderRow of rows) {
      const ctx = {
        order: orderRow,
        session: me,
        body,
      } as TransitionContext<never>
      const guardError = await def.guard(ctx)
      if (guardError) {
        if (!firstFail) firstFail = guardError
        continue
      }
      updates.push({
        id: orderRow.id,
        values: await def.buildUpdate(ctx),
      })
    }

    if (updates.length === 0) {
      return NextResponse.json(
        {
          error:
            firstFail?.error ??
            `None of the selected orders can be ${name.replace(/-/g, " ")}.`,
        },
        { status: firstFail?.status ?? 400 },
      )
    }

    const updated: OrderRow[] = []
    for (const { id, values } of updates) {
      const [row] = await tx
        .update(order)
        .set(values)
        .where(eq(order.id, id))
        .returning()
      if (row) updated.push(row)
    }

    // The same balance-ledger side effects the single-order path applies. This
    // used to be missing entirely, so a bulk cancel left the creation charge on
    // the merchant's balance and never returned the bundle quota.
    const refundOnCancel =
      name === "cancel" ? await loadRefundOnCancelPolicy(tx) : true
    for (const row of updated) {
      await settleOrderFinancials(
        tx,
        beforeById.get(row.id) ?? row,
        row,
        name,
        me.name,
        refundOnCancel,
      )
    }

    for (const row of updated) {
      const before = beforeById.get(row.id) ?? null
      const diff = diffEntity(before, row, ORDER_DIFF_FIELDS)
      // Audit + history inside the same transaction (ROADMAP P1.4).
      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: `ORDER_${name.toUpperCase().replace(/-/g, "_")}`,
          entityType: "order",
          entityId: row.id,
          description: `${TRANSITION_LABELS[name]} order ${row.id} (bulk)`,
          metadata: diff ? { diff } : null,
        },
        tx,
      )
      await tx.insert(orderStatusHistory).values({
        orderId: row.id,
        fromStatus: before?.status ?? null,
        toStatus: row.status,
        transition: name,
        actorId: me.userId,
        actorName: me.name,
        actorRole: me.role,
        note: transitionNote(name, body),
      })
    }
    return NextResponse.json({ ok: true, count: updated.length })
  })

  return response
}
