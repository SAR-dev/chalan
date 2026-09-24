import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { SEED_ORDERS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedOrders() {
  log("Seeding orders…")

  const exists = await db
    .select()
    .from(order)
    .where(eq(order.id, SEED_ORDERS[0].id))
    .limit(1)
  if (exists.length > 0) {
    log("  orders already exist, skipping")
    return
  }

  // Insert in batches of 25 to avoid parameter limits
  const BATCH = 25
  for (let i = 0; i < SEED_ORDERS.length; i += BATCH) {
    const batch = SEED_ORDERS.slice(i, i + BATCH).map(
      ({
        id,
        merchantId,
        pickupLocationId,
        recipientName,
        recipientPhone,
        deliveryAddress,
        parcelWeightKg,
        deliveryType,
        productCost,
        deliveryFee,
        codFee,
        merchantEarnings,
        status,
        warehouseId,
        approvedBy,
        approvedAt,
        pickupRiderId,
        assignedAt,
        pickedUpAt,
        receivedAtWarehouseAt,
        receivedByWarehouse,
        deliveryRiderId,
        dispatchedAt,
        dispatchedBy,
        outForDeliveryAt,
        deliveredAt,
        deliveryProofRef,
        amountCollected,
        failedAttemptAt,
        failureNote,
        returnedAt,
        returnReason,
        cancelledAt,
        cancelledBy,
        cancelReason,
        deliveryAttempts,
        createdAt,
      }) => ({
        id,
        merchantId,
        pickupLocationId,
        recipientName,
        recipientPhone,
        deliveryAddress,
        parcelWeightKg,
        deliveryType,
        productCost,
        deliveryFee,
        codFee,
        merchantEarnings,
        status,
        warehouseId,
        approvedBy,
        approvedAt,
        pickupRiderId,
        assignedAt,
        pickedUpAt,
        receivedAtWarehouseAt,
        receivedByWarehouse,
        deliveryRiderId,
        dispatchedAt,
        dispatchedBy,
        outForDeliveryAt,
        deliveredAt,
        deliveryProofRef,
        amountCollected,
        failedAttemptAt,
        failureNote,
        returnedAt,
        returnReason,
        cancelledAt,
        cancelledBy,
        cancelReason,
        deliveryAttempts,
        createdAt,
      }),
    )
    await db.insert(order).values(batch)
    log(`  inserted orders ${i + 1}–${Math.min(i + BATCH, SEED_ORDERS.length)}`)
  }

  log(`  seeded ${SEED_ORDERS.length} orders`)
}
