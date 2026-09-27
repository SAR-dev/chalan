import { describe, expect, it } from "vitest"
import {
  codCollectedAmount,
  orderChargeAmount,
  paymentAmount,
  payoutAmount,
  settledTotal,
  toPaisa,
} from "@/lib/balance-ledger"

describe("toPaisa", () => {
  it("rounds money to 2 decimals", () => {
    expect(toPaisa(10.005)).toBe(10.01)
    expect(toPaisa(0.1 + 0.2)).toBe(0.3)
    expect(toPaisa(1.239)).toBe(1.24)
    expect(toPaisa(-1.231)).toBe(-1.23)
  })
})

describe("ledger entry amounts", () => {
  it("charges the summed platform fees at order creation", () => {
    expect(orderChargeAmount(10, 1)).toBe(11)
    expect(orderChargeAmount(10.005, 0.005)).toBe(10.01)
  })

  it("credits the gross COD collected at delivery", () => {
    expect(codCollectedAmount(100)).toBe(-100)
  })

  it("records a payout as a positive (credit-consuming) amount", () => {
    expect(payoutAmount(89)).toBe(89)
  })

  it("records a merchant payment as negative", () => {
    expect(paymentAmount(50)).toBe(-50)
  })
})

describe("worked example — productCost 100, deliveryFee 10, codFee 1", () => {
  // The canonical settlement story from lib/balance-ledger.ts.
  const rows = [
    {
      type: "ORDER_CHARGE",
      amount: orderChargeAmount(10, 1),
      status: "SETTLED",
    },
    {
      type: "ORDER_EARNINGS",
      amount: codCollectedAmount(100),
      status: "SETTLED",
    },
  ]

  it("is in credit by the earnings after delivery", () => {
    expect(settledTotal(rows)).toBe(-89)
  })

  it("settles to zero once the payout is paid", () => {
    const withPayout = [
      ...rows,
      { type: "PAYOUT", amount: payoutAmount(89), status: "SETTLED" },
    ]
    expect(settledTotal(withPayout)).toBe(0)
  })

  it("leaves the platform's fee revenue intact (11)", () => {
    // balance 0 == platform keeps the 11 it charged and paid out the rest.
    expect(orderChargeAmount(10, 1)).toBe(11)
  })
})

describe("settledTotal (reconciliation invariant)", () => {
  it("sums only SETTLED rows", () => {
    const rows = [
      { amount: 100, status: "SETTLED" },
      { amount: -50, status: "SETTLED" },
      { amount: -25, status: "PENDING" },
      { amount: 40, status: "REJECTED" },
    ]
    expect(settledTotal(rows)).toBe(50)
  })

  it("is 0 for an empty ledger", () => {
    expect(settledTotal([])).toBe(0)
  })

  it("absorbs float noise", () => {
    const rows = [
      { amount: 0.1, status: "SETTLED" },
      { amount: 0.2, status: "SETTLED" },
    ]
    expect(settledTotal(rows)).toBe(0.3)
  })
})
