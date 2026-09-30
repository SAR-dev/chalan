import { deliveryCity, order } from "@/lib/db/schema"

/**
 * Order fields shared by every list/detail projection (admin orders list,
 * warehouse orders list, and order detail). View-specific fields are spread on
 * top of this constant at each call site so a frequently-needed column is
 * defined once instead of being hand-synced across four queries.
 *
 * Callers must `leftJoin(deliveryCity, ...)` — `deliveryCity.name` is selected
 * as the `deliveryCity` alias.
 */
export const ORDER_CORE_COLUMNS = {
  id: order.id,
  trackingToken: order.trackingToken,
  merchantId: order.merchantId,
  warehouseId: order.warehouseId,
  pickupLocationId: order.pickupLocationId,
  pickupRiderId: order.pickupRiderId,
  deliveryRiderId: order.deliveryRiderId,
  recipientName: order.recipientName,
  recipientPhone: order.recipientPhone,
  deliveryAddress: order.deliveryAddress,
  deliveryMapLink: order.deliveryMapLink,
  deliveryCity: deliveryCity.name,
  parcelWeightKg: order.parcelWeightKg,
  // Beside the weight because the two are read together: a rider picks up "a
  // 3 kg box of books", not "a box". Part of the core set so every order list
  // and the detail view show it without each one having to remember.
  itemType: order.itemType,
  deliveryType: order.deliveryType,
  productCost: order.productCost,
  deliveryFee: order.deliveryFee,
  codFee: order.codFee,
  cancellationFee: order.cancellationFee,
  merchantEarnings: order.merchantEarnings,
  status: order.status,
  codSettledAt: order.codSettledAt,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
}
