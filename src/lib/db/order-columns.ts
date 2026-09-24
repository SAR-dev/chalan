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
  deliveryType: order.deliveryType,
  productCost: order.productCost,
  deliveryFee: order.deliveryFee,
  codFee: order.codFee,
  merchantEarnings: order.merchantEarnings,
  status: order.status,
  codSettledAt: order.codSettledAt,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
}