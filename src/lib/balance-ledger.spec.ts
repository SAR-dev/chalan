import { describe, expect, it } from "vitest"
import {
  cancellationChargeAmount,
  codCollectedAmount,
  orderChargeAmount,
  orderChargeReversalAmount,
  paymentAmount,
  payoutAmount,
  settledTotal,
  toPaisa,
} from "@/lib/balance-ledger"
import { balanceTxTypes } from "@/lib/db/schema.postgres/enums"

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

  it("refunds the creation fees on a return (negative reversal)", () => {
    expect(orderChargeReversalAmount(10, 1)).toBe(-11)
    expect(orderChargeReversalAmount(10.005, 0.005)).toBe(-10.01)
  })

  it("charges the cancellation fee on a return (positive)", () => {
    expect(cancellationChargeAmount(3)).toBe(3)
    expect(cancellationChargeAmount(0)).toBe(0)
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

describe("worked example — returned order (productCost 100, fees 11, cancellationFee 3)", () => {
  // The canonical return story from lib/balance-ledger.ts: the creation charge
  // is reversed and only the cancellation fee remains owed.
  const rows = [
    {
      type: "ORDER_CHARGE",
      amount: orderChargeAmount(10, 1),
      status: "SETTLED",
    },
    {
      type: "ORDER_CHARGE",
      amount: orderChargeReversalAmount(10, 1),
      status: "SETTLED",
    },
    {
      type: "ORDER_CANCELLATION",
      amount: cancellationChargeAmount(3),
      status: "SETTLED",
    },
  ]

  it("leaves the merchant owing only the cancellation fee", () => {
    expect(settledTotal(rows)).toBe(3)
  })

  it("refunds the delivery + COD fees minus the cancellation fee", () => {
    // Net credit to the merchant = 11 - 3 = 8.
    const netChange =
      orderChargeReversalAmount(10, 1) + cancellationChargeAmount(3)
    expect(netChange).toBe(-8)
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

  it("still balances when a bundle credit is mixed in", () => {
    // The prepaid package is money already in hand, so approving one writes a
    // PAYMENT_CONFIRMED credit. The reconciliation invariant must survive it.
    const rows = [
      { amount: 52, status: "SETTLED" }, // ORDER_CHARGE for the order below
      { amount: -500, status: "SETTLED" }, // package purchase approved
      { amount: -300, status: "PENDING" }, // top-up awaiting confirmation
    ]
    expect(settledTotal(rows)).toBe(-448)
  })
})

// Prepaid packages deliberately add NO ledger type: approving a purchase
// reuses PAYMENT_CONFIRMED (with `paymentMethod: "PACKAGE"`) and a direct
// admin assign writes nothing at all, because no money moved. This pins the
// whole enum so a future "just add a PACKAGE_CREDIT type" shortcut fails here.
describe("balanceTxTypes", () => {
  it("has no package-specific type", () => {
    expect(balanceTxTypes).toEqual([
      "ORDER_CHARGE",
      "ORDER_CHARGE_REVERSAL",
      "ORDER_EARNINGS",
      "ORDER_CANCELLATION",
      "PAYOUT",
      "PAYMENT_PENDING",
      "PAYMENT_CONFIRMED",
      "ADJUSTMENT",
    ])
    expect(
      balanceTxTypes.filter((type) => /PACKAGE|BUNDLE|TIER/i.test(type)),
    ).toEqual([])
  })
})
