// `enum` here is a Drizzle-only hint — it narrows the inferred TypeScript type
// for `role` to this literal union instead of `string`. No Postgres enum type
// is created; the column remains plain `text` in the database and no migration
// is needed when this list changes. Runtime validation is the caller's job.
export const profileRoles = [
  "SUPER_ADMIN",
  "WAREHOUSE_ADMIN",
  "MERCHANT",
  "RIDER",
] as const

// What a rider is allowed to do. Decoupled from the warehouse association so a
// rider can, e.g., be a PICKUP rider that still belongs to a hub, or handle
// BOTH legs. Drizzle-only `enum` hint — the column stays plain `text`.
export const riderTaskTypes = ["PICKUP", "DELIVERY", "BOTH"] as const

export const riderStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ACTIVE",
  "SUSPENDED",
] as const

// The vehicle a rider collects parcels in. A closed list rather than free text
// because an admin scanning the rider list needs to compare vehicles at a
// glance, and "motorbike" / "Motorbike" / "bike" splitting into three riders'
// records is exactly the problem a list prevents.
//
// Deliberately carries no capacity. A vehicle here is a display aid so an admin
// can pick sensibly when assigning a parcel; it is not a constraint, and adding
// capacity later would imply a filtering rule that does not exist today.
// Drizzle-only `enum` hint — the column stays plain `text`.
export const riderVehicleTypes = [
  "FOOT",
  "BICYCLE",
  "BIKE",
  "CAR",
  "VAN",
  "PICKUP_TRUCK",
] as const

export const merchantStatuses = ["PENDING", "ACTIVE", "SUSPENDED"] as const

export const payoutRequestStatuses = [
  "PENDING",
  "APPROVED",
  "PAID",
  "REJECTED",
] as const

export const balanceTxTypes = [
  "ORDER_CHARGE", // auto-created when an order is placed — merchant charged platform fees
  "ORDER_CHARGE_REVERSAL", // order returned/cancelled — creation fees refunded
  "ORDER_EARNINGS", // order delivered — merchant earnings reduce debt
  "ORDER_CANCELLATION", // order returned — platform fee refunded, cancellation fee charged
  "PAYOUT", // payout paid — reduces merchant debt
  "PAYMENT_PENDING", // merchant submits proof of payment; balance not yet reduced
  "PAYMENT_CONFIRMED", // admin confirms the payment; balance is reduced
  "ADJUSTMENT", // admin manual credit/debit (no pending step)
] as const

export const balanceTxStatuses = [
  "SETTLED", // final — balance already updated
  "PENDING", // awaiting admin confirmation (PAYMENT_PENDING rows only)
  "REJECTED", // admin rejected the payment (PAYMENT_PENDING rows only)
] as const

export const orderDeliveryTypes = ["STANDARD", "FRAGILE"] as const

export const orderStatuses = [
  "PENDING",
  "APPROVED",
  // Mirrors OUT_FOR_DELIVERY on the collection leg: the rider has declared they
  // are heading to the shop, and until they do, PICKED_UP is not reachable.
  "OUT_FOR_PICKUP",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_ATTEMPT",
  "RETURNED",
  "CANCELLED",
] as const

export const emailLogStatuses = ["SENT", "FAILED"] as const

// Transactional email outbox: a row is written in the same
// transaction as the domain change, then drained by a worker/cron.
export const emailOutboxStatuses = [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
] as const

// Support ticket lifecycle: OPEN (submitted) → ANSWERED (admin replied) →
// CLOSED (either party closed it). Drizzle-only enum hint.
export const supportStatuses = ["OPEN", "ANSWERED", "CLOSED"] as const

// How a package tier adjusts the delivery fee: FLAT = fixed charge (Tk),
// PERCENT_OFF = percentage discount off the zone fee. Drizzle-only enum hint.
export const packageRuleTypes = ["FLAT", "PERCENT_OFF"] as const

// Package purchase request lifecycle. Drizzle-only enum hint.
export const packagePurchaseStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const
