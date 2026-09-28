import { describe, expect, it } from "vitest"
import {
  BADGE_TONES,
  BALANCE_TX_STATUS_LABELS,
  BALANCE_TX_STATUS_TONES,
  BALANCE_TX_TYPE_LABELS,
  BRAND_NAME,
  CURRENCY_SUFFIX,
  DEFAULT_TABLE_ROWS_PER_PAGE,
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_LOG_STATUS_TONES,
  MAX_BULK_ORDERS,
  MAX_TABLE_ROWS_PER_PAGE,
  MERCHANT_STATUS_LABELS,
  MERCHANT_STATUS_TONES,
  ORDER_DELIVERY_TYPE_LABELS,
  ORDER_DELIVERY_TYPE_TONES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYOUT_STATUS_LABELS,
  PAYOUT_STATUS_TONES,
  RIDER_STATUS_LABELS,
  RIDER_STATUS_TONES,
  RIDER_TASK_TYPE_LABELS,
  RIDER_TASK_TYPE_TONES,
  ROLE_LABELS,
  ROLE_TONES,
} from "./constants"

describe("constants", () => {
  it("exports BRAND_NAME as a non-empty string", () => {
    expect(typeof BRAND_NAME).toBe("string")
    expect(BRAND_NAME.length).toBeGreaterThan(0)
  })

  it("exports CURRENCY_SUFFIX", () => {
    expect(CURRENCY_SUFFIX).toBe("TK")
  })

  it("exports MAX_BULK_ORDERS as positive integer", () => {
    expect(MAX_BULK_ORDERS).toBe(50)
    expect(Number.isInteger(MAX_BULK_ORDERS)).toBe(true)
  })

  it("exports DEFAULT_TABLE_ROWS_PER_PAGE", () => {
    expect(DEFAULT_TABLE_ROWS_PER_PAGE).toBe(20)
  })

  it("exports MAX_TABLE_ROWS_PER_PAGE", () => {
    expect(MAX_TABLE_ROWS_PER_PAGE).toBe(250)
  })
})

describe("BADGE_TONES", () => {
  it("contains all expected tone keys", () => {
    const keys = Object.keys(BADGE_TONES)
    expect(keys).toContain("pending")
    expect(keys).toContain("info")
    expect(keys).toContain("success")
    expect(keys).toContain("transit")
    expect(keys).toContain("warehouse")
    expect(keys).toContain("neutral")
    expect(keys).toContain("danger")
    expect(keys).toContain("brand")
  })

  it("all values are non-empty strings", () => {
    for (const [_key, value] of Object.entries(BADGE_TONES)) {
      expect(typeof value).toBe("string")
      expect(value.length).toBeGreaterThan(0)
    }
  })
})

describe("ORDER_STATUS_LABELS", () => {
  it("has labels for all order statuses", () => {
    expect(ORDER_STATUS_LABELS.PENDING).toBe("Pending")
    expect(ORDER_STATUS_LABELS.APPROVED).toBe("Approved")
    expect(ORDER_STATUS_LABELS.PICKED_UP).toBe("Picked up")
    expect(ORDER_STATUS_LABELS.IN_WAREHOUSE).toBe("In warehouse")
    expect(ORDER_STATUS_LABELS.IN_TRANSIT).toBe("In transit")
    expect(ORDER_STATUS_LABELS.OUT_FOR_DELIVERY).toBe("Out for delivery")
    expect(ORDER_STATUS_LABELS.DELIVERED).toBe("Delivered")
    expect(ORDER_STATUS_LABELS.FAILED_ATTEMPT).toBe("Failed attempt")
    expect(ORDER_STATUS_LABELS.RETURNED).toBe("Returned")
    expect(ORDER_STATUS_LABELS.CANCELLED).toBe("Cancelled")
  })

  it("has matching tone for every status", () => {
    for (const key of Object.keys(ORDER_STATUS_LABELS)) {
      expect(
        ORDER_STATUS_TONES[key as keyof typeof ORDER_STATUS_TONES],
      ).toBeDefined()
    }
  })

  it("uses a distinct tone for every status", () => {
    const tones = Object.values(ORDER_STATUS_TONES)
    expect(new Set(tones).size).toBe(tones.length)
  })
})

describe("MERCHANT_STATUS_LABELS", () => {
  it("has all statuses", () => {
    expect(MERCHANT_STATUS_LABELS.PENDING).toBe("Pending")
    expect(MERCHANT_STATUS_LABELS.ACTIVE).toBe("Active")
    expect(MERCHANT_STATUS_LABELS.SUSPENDED).toBe("Suspended")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(MERCHANT_STATUS_LABELS)) {
      expect(
        MERCHANT_STATUS_TONES[key as keyof typeof MERCHANT_STATUS_TONES],
      ).toBeDefined()
    }
  })
})

describe("PAYOUT_STATUS_LABELS", () => {
  it("has all statuses", () => {
    expect(PAYOUT_STATUS_LABELS.PENDING).toBe("Pending")
    expect(PAYOUT_STATUS_LABELS.APPROVED).toBe("Approved")
    expect(PAYOUT_STATUS_LABELS.PAID).toBe("Paid")
    expect(PAYOUT_STATUS_LABELS.REJECTED).toBe("Rejected")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(PAYOUT_STATUS_LABELS)) {
      expect(
        PAYOUT_STATUS_TONES[key as keyof typeof PAYOUT_STATUS_TONES],
      ).toBeDefined()
    }
  })
})

describe("ROLE_LABELS", () => {
  it("has all roles", () => {
    expect(ROLE_LABELS.SUPER_ADMIN).toBe("Super Admin")
    expect(ROLE_LABELS.WAREHOUSE_ADMIN).toBe("Warehouse Admin")
    expect(ROLE_LABELS.MERCHANT).toBe("Merchant")
    expect(ROLE_LABELS.RIDER).toBe("Rider")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(ROLE_LABELS)) {
      expect(ROLE_TONES[key as keyof typeof ROLE_TONES]).toBeDefined()
    }
  })
})

describe("EMAIL_LOG_STATUS_LABELS", () => {
  it("has all statuses", () => {
    expect(EMAIL_LOG_STATUS_LABELS.SENT).toBe("Sent")
    expect(EMAIL_LOG_STATUS_LABELS.FAILED).toBe("Failed")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(EMAIL_LOG_STATUS_LABELS)) {
      expect(
        EMAIL_LOG_STATUS_TONES[key as keyof typeof EMAIL_LOG_STATUS_TONES],
      ).toBeDefined()
    }
  })
})

describe("RIDER_STATUS_LABELS", () => {
  it("has all statuses", () => {
    expect(RIDER_STATUS_LABELS.PENDING).toBe("Pending")
    expect(RIDER_STATUS_LABELS.APPROVED).toBe("Approved")
    expect(RIDER_STATUS_LABELS.REJECTED).toBe("Rejected")
    expect(RIDER_STATUS_LABELS.ACTIVE).toBe("Active")
    expect(RIDER_STATUS_LABELS.SUSPENDED).toBe("Suspended")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(RIDER_STATUS_LABELS)) {
      expect(
        RIDER_STATUS_TONES[key as keyof typeof RIDER_STATUS_TONES],
      ).toBeDefined()
    }
  })
})

describe("BALANCE_TX_TYPE_LABELS", () => {
  it("has all types", () => {
    expect(BALANCE_TX_TYPE_LABELS.ORDER_CHARGE).toBe("Order Charge")
    expect(BALANCE_TX_TYPE_LABELS.ORDER_EARNINGS).toBe("Order Earnings")
    expect(BALANCE_TX_TYPE_LABELS.ORDER_CANCELLATION).toBe("Order Cancellation")
    expect(BALANCE_TX_TYPE_LABELS.PAYOUT).toBe("Payout")
    expect(BALANCE_TX_TYPE_LABELS.PAYMENT_PENDING).toBe("Payment Pending")
    expect(BALANCE_TX_TYPE_LABELS.PAYMENT_CONFIRMED).toBe("Payment Confirmed")
    expect(BALANCE_TX_TYPE_LABELS.ADJUSTMENT).toBe("Adjustment")
  })
})

describe("BALANCE_TX_STATUS_LABELS", () => {
  it("has all statuses", () => {
    expect(BALANCE_TX_STATUS_LABELS.SETTLED).toBe("Settled")
    expect(BALANCE_TX_STATUS_LABELS.PENDING).toBe("Pending")
    expect(BALANCE_TX_STATUS_LABELS.REJECTED).toBe("Rejected")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(BALANCE_TX_STATUS_LABELS)) {
      expect(
        BALANCE_TX_STATUS_TONES[key as keyof typeof BALANCE_TX_STATUS_TONES],
      ).toBeDefined()
    }
  })
})

describe("ORDER_DELIVERY_TYPE_LABELS", () => {
  it("has all types", () => {
    expect(ORDER_DELIVERY_TYPE_LABELS.STANDARD).toBe("Standard")
    expect(ORDER_DELIVERY_TYPE_LABELS.FRAGILE).toBe("Fragile")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(ORDER_DELIVERY_TYPE_LABELS)) {
      expect(
        ORDER_DELIVERY_TYPE_TONES[
          key as keyof typeof ORDER_DELIVERY_TYPE_TONES
        ],
      ).toBeDefined()
    }
  })
})

describe("RIDER_TASK_TYPE_LABELS", () => {
  it("has all types", () => {
    expect(RIDER_TASK_TYPE_LABELS.PICKUP).toBe("Pickup")
    expect(RIDER_TASK_TYPE_LABELS.DELIVERY).toBe("Delivery")
    expect(RIDER_TASK_TYPE_LABELS.BOTH).toBe("Both")
  })

  it("has matching tones", () => {
    for (const key of Object.keys(RIDER_TASK_TYPE_LABELS)) {
      expect(
        RIDER_TASK_TYPE_TONES[key as keyof typeof RIDER_TASK_TYPE_TONES],
      ).toBeDefined()
    }
  })
})
