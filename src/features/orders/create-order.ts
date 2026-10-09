import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import type { z } from "zod"
import { badRequest, forbidden, notFound } from "@/lib/api-response"
import { orderChargeAmount, toPaisa } from "@/lib/balance-ledger"
import { db, dbRead } from "@/lib/db"
import { pickupLocationHubs } from "@/lib/db/order-lookup"
import {
  balanceTransaction,
  merchant,
  merchantBalance,
  merchantPackage,
  order,
  warehouse,
} from "@/lib/db/schema"
import { canPlaceOrders } from "@/lib/merchant-verification"
import {
  computeExpectedDeliveryAt,
  resolveRouteDeliveryTime,
} from "@/lib/order-delivery-time"
import {
  lockAndResolveMerchantPackageRule,
  resolveRoutePricing,
} from "@/lib/order-pricing"
import { applyPackageRule } from "@/lib/packages"
import {
  calcCodFee,
  calcDeliveryCharge,
  calcMerchantEarnings,
  pricingUnavailableMessage,
} from "@/lib/pricing"
import { generateTrackingToken } from "@/lib/tracking-token"
import type { orderCreateSchema } from "@/lib/validation"
import { emitWebhookEvent } from "@/lib/webhooks"

/**
 * Order creation, shared by the merchant UI and the public API (R2).
 *
 * **One implementation, two callers.** `/api/orders` (session, merchant
 * portal) and `/api/v1/orders` (API key, programmatic) both call
 * `createOrderForMerchant`. The alternative — a parallel v1 implementation —
 * would duplicate four coupled writes that must commit together (the order, an
 * `ORDER_CHARGE` ledger row, the `merchant_balance` upsert, and the bundle quota
 * decrement), and every future pricing or fee rule would then exist in two
 * places. `bulk/route.ts` set the precedent: it reuses these same helpers
 * rather than reimplementing them, which is why single and bulk orders agree on
 * what a parcel costs.
 *
 * What is *not* shared is authorization. The session route checks the moderator
 * grant and the caller's role before getting here; the v1 route checks the key's
 * scopes. Both then land on identical money behaviour, because `canPlaceOrders`
 * takes a merchant rather than a session — the same account-state gate for both.
 */

export type OrderCreateInput = z.infer<typeof orderCreateSchema>

/** Who to credit on the ledger row — a person's name, or the API key's prefix. */
export interface CreateOrderActor {
  /**
   * Recorded as `createdBy` on the `ORDER_CHARGE` entry. For an API request
   * this is the key's prefix, so a charge in the ledger can be traced back to
   * the credential that created it without storing the secret.
   */
  name: string
}

export type CreateOrderResult =
  | { ok: true; order: typeof order.$inferSelect }
  /** The caller returns `response` verbatim — it is already a NextResponse. */
  | { ok: false; response: NextResponse }
  | { ok: false; response: null; replayed: true }

export async function createOrderForMerchant(
  merchantId: string,
  data: OrderCreateInput,
  actor: CreateOrderActor,
  idempotencyKey: string | null,
): Promise<CreateOrderResult> {
  const {
    pickupLocationId,
    recipientName,
    recipientPhone,
    recipientMail,
    deliveryAddress,
    deliveryMapLink,
    parcelWeightKg,
    itemType,
    deliveryType,
    productCost: rawProductCost,
    merchantNote,
  } = data

  // Money is stored to paisa — never carry sub-paisa noise.
  const productCost = toPaisa(rawProductCost)

  const normalizedMapLink = deliveryMapLink?.trim()
    ? deliveryMapLink.trim()
    : null

  // Idempotency: a retried create with the same key returns the original order
  // instead of charging twice. Checked before any pricing work; the unique
  // (merchantId, key) index makes the concurrent case safe too.
  const findByKey = () =>
    db
      .select()
      .from(order)
      .where(
        and(
          eq(order.merchantId, merchantId),
          eq(order.idempotencyKey, idempotencyKey!),
        ),
      )
      .limit(1)
      .then((r) => r[0])
  if (idempotencyKey) {
    const existing = await findByKey()
    if (existing) return { ok: false, response: null, replayed: true }
  }

  // One query resolves both the serving warehouse and the owner: the location
  // must belong to the caller, so a merchant can never book against another
  // merchant's shop address.
  const pickupHub = (await pickupLocationHubs([pickupLocationId])).get(
    pickupLocationId,
  )
  if (!pickupHub || pickupHub.merchantId !== merchantId) {
    return { ok: false, response: notFound("Pickup location not found") }
  }
  const hubId = pickupHub.warehouseId
  if (!hubId) {
    return {
      ok: false,
      response: badRequest("Pickup location has no warehouse assigned."),
    }
  }
  const [hub] = await db
    .select({ id: warehouse.id, isActive: warehouse.isActive })
    .from(warehouse)
    .where(eq(warehouse.id, hubId))
    .limit(1)
  if (!hub || !hub.isActive) {
    return {
      ok: false,
      response: badRequest(
        "No active warehouse available for this pickup location.",
      ),
    }
  }

  const [merchantRow] = await db
    .select({
      id: merchant.id,
      status: merchant.status,
      emailVerifiedAt: merchant.emailVerifiedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
    })
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .limit(1)

  if (!merchantRow) {
    return { ok: false, response: notFound("Merchant not found") }
  }
  if (merchantRow.status !== "ACTIVE") {
    return {
      ok: false,
      response: badRequest(
        merchantRow.status === "PENDING"
          ? "Your merchant account is not active yet."
          : "Your merchant account is suspended and cannot create orders.",
      ),
    }
  }
  const verification = canPlaceOrders(merchantRow)
  if (!verification.allowed) {
    return { ok: false, response: forbidden(verification.reason) }
  }

  // ── Pricing: zone pricing is the single source for delivery, COD and
  //    cancellation fees. There is no platform fallback — an unconfigured lane
  //    is a configuration gap and is rejected with the reason, so the admin can
  //    fix the right thing.
  const destCityId = data.deliveryCityId
  const resolved = await resolveRoutePricing(hub.id, destCityId ?? null)
  if (!resolved.ok) {
    return {
      ok: false,
      response: badRequest(
        pricingUnavailableMessage(
          resolved.reason,
          resolved.fromZone,
          resolved.toZone,
        ),
      ),
    }
  }
  const pricing = resolved.pricing

  // ── Delivery time: the same zone-pair matrix as pricing, but never blocking.
  const deliveryTime = await resolveRouteDeliveryTime(
    hub.id,
    destCityId ?? null,
  )
  const expectedDeliveryDays = deliveryTime.ok ? deliveryTime.days : null

  const { total: zoneDeliveryFee, exceedsMax } = calcDeliveryCharge(
    pricing,
    parcelWeightKg,
  )
  if (exceedsMax) {
    return {
      ok: false,
      response: badRequest(
        `Parcel weight exceeds the ${pricing.maxWeightKg} KG limit for this route.`,
      ),
    }
  }
  const codFee = calcCodFee(productCost, pricing.codFeePercentage ?? 1)
  const cancellationFee = toPaisa(pricing.cancellationFee ?? 0)

  // One clock for the creation instant and for the promise derived from it.
  const createdAtIso = new Date().toISOString()

  const created = await db.transaction(async (tx) => {
    const bundle = await lockAndResolveMerchantPackageRule(tx, merchantId)
    const deliveryFee = applyPackageRule(zoneDeliveryFee, bundle?.rule)
    const merchantEarnings = calcMerchantEarnings(
      productCost,
      deliveryFee,
      codFee,
    )

    const [inserted] = await tx
      .insert(order)
      .values({
        merchantId,
        pickupLocationId,
        warehouseId: hub.id,
        trackingToken: generateTrackingToken(),
        idempotencyKey,
        recipientName,
        recipientPhone,
        recipientMail,
        deliveryCityId: destCityId ?? null,
        deliveryAddress,
        deliveryMapLink: normalizedMapLink,
        parcelWeightKg,
        itemType,
        deliveryType: deliveryType ?? "STANDARD",
        productCost,
        deliveryFee,
        codFee,
        cancellationFee,
        merchantEarnings,
        packageId: bundle?.packageId ?? null,
        packageTierId: bundle?.tierId ?? null,
        merchantPackageId: bundle?.merchantPackageId ?? null,
        packageRuleType: bundle?.rule?.ruleType ?? null,
        packageRuleValue: bundle?.rule?.ruleValue ?? null,
        status: "PENDING",
        deliveryAttempts: 0,
        merchantNote: merchantNote?.trim() || null,
        createdAt: createdAtIso,
        expectedDeliveryDays,
        expectedDeliveryAt: computeExpectedDeliveryAt(
          createdAtIso,
          expectedDeliveryDays,
        ),
      })
      .onConflictDoNothing()
      .returning()

    // Lost the race to a concurrent retry — nothing to write; the caller
    // re-reads the winner.
    if (!inserted) return { replay: true as const }

    const platformFee = orderChargeAmount(deliveryFee, codFee)

    await tx.insert(balanceTransaction).values({
      merchantId,
      type: "ORDER_CHARGE",
      amount: platformFee,
      status: "SETTLED",
      note: inserted.id,
      orderId: inserted.id,
      createdBy: actor.name,
    })

    // Upsert the merchant's running balance. onConflictDoUpdate handles the
    // first-order case where no balance row exists yet for this merchant.
    await tx
      .insert(merchantBalance)
      .values({ merchantId, balance: platformFee })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${platformFee}`,
          updatedAt: new Date().toISOString(),
        },
      })

    // Consume one order from the bundle's quota (only on a real insert — a
    // replayed idempotent request must not double-count).
    if (bundle) {
      await tx
        .update(merchantPackage)
        .set({
          ordersUsed: sql`${merchantPackage.ordersUsed} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(merchantPackage.id, bundle.merchantPackageId))
    }

    // Enqueue the creation event in the same transaction so it can never
    // describe an order that rolled back. No I/O here — just a row. Pass the
    // single `createdAtIso` as `now` so the bulk test's clock spy stays at 1.
    await emitWebhookEvent({
      tx,
      merchantId,
      event: "order.created",
      orderId: inserted.id,
      data: {
        id: inserted.id,
        status: inserted.status,
        recipientName: inserted.recipientName,
        recipientPhone: inserted.recipientPhone,
        recipientMail: inserted.recipientMail,
        deliveryAddress: inserted.deliveryAddress,
        parcelWeightKg: inserted.parcelWeightKg,
        productCost: inserted.productCost,
        deliveryFee: inserted.deliveryFee,
        trackingToken: inserted.trackingToken,
        createdAt: (inserted.createdAt as unknown as string) ?? createdAtIso,
      },
      now: createdAtIso,
    })

    return { replay: false as const, order: inserted }
  })

  if (created.replay) {
    const existing = idempotencyKey ? await findByKey() : undefined
    if (existing) return { ok: false, response: null, replayed: true }
    return { ok: false, response: badRequest("Duplicate request") }
  }

  return { ok: true, order: created.order }
}
