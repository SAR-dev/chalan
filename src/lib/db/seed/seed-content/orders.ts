import { randomBytes } from "node:crypto"
import { SEED_COUNTS } from "./credentials"
import { SEED_DELIVERY_CITIES } from "./delivery-cities"
import { MERCHANT_IDS } from "./merchants"
import { SEED_RIDERS } from "./riders"
import { ADMIN_USER_NAMES } from "./users"
import { WAREHOUSE_IDS } from "./warehouses"

// =============================================================================
// SEED DATA: Orders, Payout Requests, Merchant Balances
// Used by db:seed:full (index-full.ts)
// =============================================================================

// ---------------------------------------------------------------------------
// Order status distribution for 100 orders
// ---------------------------------------------------------------------------
const ORDER_SEED_STATUSES: (
  | "PENDING"
  | "APPROVED"
  | "OUT_FOR_PICKUP"
  | "PICKED_UP"
  | "IN_WAREHOUSE"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_ATTEMPT"
  | "RETURNED"
  | "CANCELLED"
)[] = [
  ...Array.from({ length: 8 }, () => "PENDING" as const),
  // Split 8 → 4 + 4 so the new status is represented without changing the
  // total: suites assert "100 orders" as a number, and APPROVED only needs to
  // keep enough rows to be assignable.
  ...Array.from({ length: 4 }, () => "APPROVED" as const),
  ...Array.from({ length: 4 }, () => "OUT_FOR_PICKUP" as const),
  ...Array.from({ length: 8 }, () => "PICKED_UP" as const),
  ...Array.from({ length: 10 }, () => "IN_WAREHOUSE" as const),
  ...Array.from({ length: 10 }, () => "IN_TRANSIT" as const),
  ...Array.from({ length: 10 }, () => "OUT_FOR_DELIVERY" as const),
  ...Array.from({ length: 25 }, () => "DELIVERED" as const),
  ...Array.from({ length: 7 }, () => "FAILED_ATTEMPT" as const),
  ...Array.from({ length: 4 }, () => "RETURNED" as const),
  ...Array.from({ length: 10 }, () => "CANCELLED" as const),
]

// Cancellation fee snapshotted on every seeded order, and mirrored by the
// ledger rows seedBalances writes for returned ones. Uniform in the seed;
// production resolves it per zone pair at creation time.
export const SEED_CANCELLATION_FEE = 20

// Destination cities, cycled. These are the real `delivery_city` rows, not a
// parallel list of names: `delivery_city.name` is UNIQUE and is joined against
// `warehouse.city` by `resolveRoutePricing`, so a name here that does not exist
// in that table is not a cosmetic difference — it silently breaks lane pricing
// and leaves the order with no zone. See `seed-content/delivery-cities.ts` for
// the list this replaced.
const ORDER_SEED_CITIES = SEED_DELIVERY_CITIES

const RECIPIENT_NAMES = [
  "Rahim Uddin",
  "Karim Ahmed",
  "Fatima Begum",
  "Nusrat Jahan",
  "Abdul Hamid",
  "Saleha Khatun",
  "Mohammad Ali",
  "Jamal Hossain",
  "Roksana Akter",
  "Sharmin Sultana",
  "Tanvirul Islam",
  "Sumaiya Rahman",
  "Habib Rahman",
  "Nasima Khatun",
  "Fazlul Haque",
  "Monira Begum",
  "Aminul Islam",
  "Shirin Akter",
  "Kamal Hossain",
  "Ruma Ahmed",
]

const PRODUCT_COSTS = [
  0, 800, 0, 1500, 2000, 0, 3000, 3500, 0, 5000, 6000, 0, 8000, 9500, 0, 12000,
  0, 18000, 20000, 0,
]

const PARCEL_WEIGHTS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]

// Contents, cycled. Deliberately NOT applied to every order: the order table,
// the detail panel and the rider queues each render a distinct placeholder when
// nothing was stated, and a seed where every row is filled is exactly the case
// that leaves those branches unexercised. `i % 3 === 0` leaves roughly a third
// of orders without contents.
const ITEM_TYPES = [
  "Cotton saree",
  "Phone charger",
  "Cooked food",
  "Running shoes",
  "Gift box",
  "Documents",
  "Glassware",
  "Cosmetics",
  "Books",
]

// ---------------------------------------------------------------------------
// Deterministic: 100 Orders
// ---------------------------------------------------------------------------
export interface OrderSeedEntry {
  id: string
  /** Public tracking token — generated per seeded order. */
  trackingToken: string
  merchantId: string
  pickupLocationId: string
  recipientName: string
  recipientPhone: string
  deliveryAddress: string
  /** `delivery_city.id` — the destination zone the pricing lane and the rider
   *  run sheet are both derived from. Required by `orderCreateSchema`, so a
   *  seeded order carries one too. */
  deliveryCityId: string
  parcelWeightKg: number
  /** What is in the parcel. Null for roughly a third of seeded orders. */
  itemType?: string | null
  deliveryType: "STANDARD" | "FRAGILE"
  productCost: number
  deliveryFee: number
  codFee: number
  merchantEarnings: number
  status: (typeof ORDER_SEED_STATUSES)[number]
  warehouseId: string
  approvedBy: string | null
  approvedAt: string | null
  pickupRiderId: string | null
  assignedAt: string | null
  outForPickupAt: string | null
  pickedUpAt: string | null
  receivedAtWarehouseAt: string | null
  receivedByWarehouse: string | null
  deliveryRiderId: string | null
  dispatchedAt: string | null
  dispatchedBy: string | null
  outForDeliveryAt: string | null
  deliveredAt: string | null
  deliveryProofRef: string | null
  amountCollected: number | null
  failedAttemptAt: string | null
  failureNote: string | null
  returnedAt: string | null
  returnReason: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelReason: string | null
  deliveryAttempts: number
  createdAt: string
}

function buildSeedOrders(): OrderSeedEntry[] {
  const activeMerchants = [
    {
      id: MERCHANT_IDS.merchant1,
      pickupId: "PKL-100001E",
      baseRate: 50,
      extraRatePerKg: 10,
      freeWeightKg: 1,
    },
    {
      id: MERCHANT_IDS.merchant2,
      pickupId: "PKL-100002E",
      baseRate: 60,
      extraRatePerKg: 15,
      freeWeightKg: 1,
    },
    {
      id: MERCHANT_IDS.merchant3,
      pickupId: "PKL-100003E",
      baseRate: 70,
      extraRatePerKg: 20,
      freeWeightKg: 1,
    },
  ]

  const usableRiders = SEED_RIDERS.filter((r) => r.isActive)
  const pickupRiders = usableRiders.filter(
    (r) => r.taskType === "PICKUP" || r.taskType === "BOTH",
  )
  const deliveryRiders = usableRiders.filter(
    (r) => r.taskType === "DELIVERY" || r.taskType === "BOTH",
  )

  // Deterministic shuffle using index-based picks
  const now = Date.now()
  const DAY = 86_400_000

  return Array.from({ length: SEED_COUNTS.orders }, (_, i) => {
    const merchant = activeMerchants[i % activeMerchants.length]
    const status = ORDER_SEED_STATUSES[i]
    const city = ORDER_SEED_CITIES[i % ORDER_SEED_CITIES.length]
    const recipientName = RECIPIENT_NAMES[i % RECIPIENT_NAMES.length]
    const weight = PARCEL_WEIGHTS[i % PARCEL_WEIGHTS.length]
    const productCost = PRODUCT_COSTS[i % PRODUCT_COSTS.length]
    const deliveryType = i % 5 === 0 ? "FRAGILE" : "STANDARD"

    // Delivery charge: base + ceil(max(0, weight - freeWeight)) * extraRate
    const billableExtraKg = Math.ceil(
      Math.max(0, weight - merchant.freeWeightKg),
    )
    const deliveryFee =
      merchant.baseRate + billableExtraKg * merchant.extraRatePerKg

    // COD fee: 1% of productCost
    const codFee = Math.round(productCost * 0.01 * 100) / 100
    const merchantEarnings = Math.max(0, productCost - deliveryFee - codFee)

    // Stagger creation dates over the last 30 days
    const createdAt = new Date(
      now - (SEED_COUNTS.orders - i) * (DAY / 4),
    ).toISOString()

    const base: OrderSeedEntry = {
      id: `ORD-${String(100001 + i).padStart(6, "0")}E`,
      trackingToken: randomBytes(16).toString("hex"),
      merchantId: merchant.id,
      pickupLocationId: merchant.pickupId,
      recipientName,
      recipientPhone: `+8801712${String(10000 + i).slice(0, 5)}`,
      deliveryAddress: `${100 + i} Seed Road, ${city.name}`,
      deliveryCityId: city.id,
      parcelWeightKg: weight,
      itemType: i % 3 === 0 ? null : ITEM_TYPES[i % ITEM_TYPES.length],
      deliveryType,
      productCost,
      deliveryFee,
      codFee,
      merchantEarnings,
      status,
      warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
      approvedBy: null,
      approvedAt: null,
      pickupRiderId: null,
      assignedAt: null,
      outForPickupAt: null,
      pickedUpAt: null,
      receivedAtWarehouseAt: null,
      receivedByWarehouse: null,
      deliveryRiderId: null,
      dispatchedAt: null,
      dispatchedBy: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      deliveryProofRef: null,
      amountCollected: null,
      failedAttemptAt: null,
      failureNote: null,
      returnedAt: null,
      returnReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      deliveryAttempts: 0,
      createdAt,
    }

    if (status !== "PENDING" && status !== "CANCELLED") {
      base.approvedBy = ADMIN_USER_NAMES.tanvir
      base.approvedAt = new Date(
        new Date(createdAt).getTime() + 0.5 * DAY,
      ).toISOString()
    }

    if (
      status === "OUT_FOR_PICKUP" ||
      status === "PICKED_UP" ||
      status === "IN_WAREHOUSE" ||
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      const rider = pickupRiders[i % pickupRiders.length]
      base.pickupRiderId = rider.id
      base.assignedAt = base.approvedAt
    }

    // Heading out is half a day after approval; collecting is a day after
    // approval, so a seeded OUT_FOR_PICKUP parcel has a believable gap before a
    // pickup that has not happened yet.
    if (status === "OUT_FOR_PICKUP") {
      base.outForPickupAt = new Date(
        new Date(base.approvedAt!).getTime() + 0.5 * DAY,
      ).toISOString()
    }

    if (
      status === "PICKED_UP" ||
      status === "IN_WAREHOUSE" ||
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      base.pickedUpAt = new Date(
        new Date(base.approvedAt!).getTime() + DAY,
      ).toISOString()
    }

    if (
      status === "IN_WAREHOUSE" ||
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      base.receivedAtWarehouseAt = new Date(
        new Date(base.pickedUpAt!).getTime() + DAY,
      ).toISOString()
      base.receivedByWarehouse = ADMIN_USER_NAMES.rifat
    }

    if (
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      const rider = deliveryRiders[i % deliveryRiders.length]
      base.deliveryRiderId = rider.id
      base.dispatchedAt = new Date(
        new Date(base.receivedAtWarehouseAt!).getTime() + 0.5 * DAY,
      ).toISOString()
      base.dispatchedBy = ADMIN_USER_NAMES.rifat
    }

    if (
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      base.outForDeliveryAt = new Date(
        new Date(base.dispatchedAt!).getTime() + 0.5 * DAY,
      ).toISOString()
    }

    if (status === "DELIVERED") {
      base.deliveredAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.deliveryProofRef = `proof_seed_${i + 1}.jpg`
      base.amountCollected = productCost
      base.deliveryAttempts = 1
    }

    if (status === "FAILED_ATTEMPT") {
      base.failedAttemptAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.failureNote = "Recipient not available at delivery address"
      base.deliveryAttempts = 1
    }

    if (status === "RETURNED") {
      base.failedAttemptAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.failureNote = "Recipient refused delivery"
      base.deliveryAttempts = 2
      base.returnedAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + 3 * DAY,
      ).toISOString()
      base.returnReason = "Recipient refused to accept"
    }

    if (status === "CANCELLED") {
      base.cancelledAt = new Date(
        new Date(createdAt).getTime() + 2 * DAY,
      ).toISOString()
      base.cancelledBy = ADMIN_USER_NAMES.tanvir
      base.cancelReason = "Customer requested cancellation"
    }

    return base
  })
}

export const SEED_ORDERS: OrderSeedEntry[] = buildSeedOrders()
