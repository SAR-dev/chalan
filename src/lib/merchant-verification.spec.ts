import { describe, expect, it } from "vitest"
import { canPlaceOrders } from "./merchant-verification"
import type { Merchant } from "./types"

function makeMerchant(overrides: Partial<Merchant> = {}): Merchant {
  return {
    id: "m_1",
    businessName: "Test Biz",
    ownerName: "Owner",
    email: "test@test.com",
    phone: "01712345678",
    address: "Addr",
    status: "ACTIVE",
    baseRate: 50,
    extraRatePerKg: 10,
    freeWeightKg: 1,
    maxWeightKg: 10,
    codFeePercentage: 1,
    emailVerifiedAt: "2025-01-01T00:00:00Z",
    phoneVerifiedAt: "2025-01-01T00:00:00Z",
    nidVerifiedAt: "2025-01-01T00:00:00Z",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  } as Merchant
}

describe("canPlaceOrders", () => {
  it("allows when all checks pass", () => {
    const result = canPlaceOrders(makeMerchant())
    expect(result).toEqual({ allowed: true })
  })

  it("blocks when status is not ACTIVE", () => {
    const result = canPlaceOrders(makeMerchant({ status: "PENDING" }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("not active")
  })

  it("blocks when status is SUSPENDED", () => {
    const result = canPlaceOrders(makeMerchant({ status: "SUSPENDED" }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("not active")
  })

  it("blocks when email not verified", () => {
    const result = canPlaceOrders(makeMerchant({ emailVerifiedAt: null }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("email")
  })

  it("blocks when NID not verified", () => {
    const result = canPlaceOrders(makeMerchant({ nidVerifiedAt: null }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("NID")
  })

  it("blocks when NID submitted but not yet verified", () => {
    const result = canPlaceOrders(
      makeMerchant({
        nidVerifiedAt: null,
        nidSubmittedAt: "2025-01-01T00:00:00Z",
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("NID")
  })

  it("checks status before email", () => {
    const result = canPlaceOrders(
      makeMerchant({ status: "PENDING", emailVerifiedAt: null }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("not active")
  })

  it("checks email before NID", () => {
    const result = canPlaceOrders(
      makeMerchant({ emailVerifiedAt: null, nidVerifiedAt: null }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("email")
  })
})
