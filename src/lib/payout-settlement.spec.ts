import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked purely so importing the module does not construct a real pg Pool.
// `settlePayoutAsPaid` only ever touches the `tx` handle passed to it, which the
// test builds itself — so the branch logic under test is real.
vi.mock("@/lib/db", () => ({ db: {}, pool: {} }))

import { settlePayoutAsPaid } from "./payout-settlement"

type Tx = Parameters<typeof settlePayoutAsPaid>[0]

const selectQueue: unknown[][] = []
const insertPayloads: Record<string, unknown>[] = []
const updatePayloads: Record<string, unknown>[] = []

function makeTx(): Tx {
  const selectChain: Record<string, unknown> = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () => selectChain,
    for: () => selectChain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
  }
  const insertChain: Record<string, unknown> = {
    values: (payload: Record<string, unknown>) => {
      insertPayloads.push(payload)
      return insertChain
    },
    // The balance upsert chains this; the ledger insert just awaits the chain.
    onConflictDoUpdate: () => insertChain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(onFulfilled),
  }
  const updateChain: Record<string, unknown> = {
    set: (payload: Record<string, unknown>) => {
      updatePayloads.push(payload)
      return updateChain
    },
    where: () => updateChain,
    returning: () => Promise.resolve([{ id: "pr_1", status: "PAID" }]),
  }
  return {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
  } as unknown as Tx
}

const approved = {
  id: "pr_1",
  merchantId: "m_1",
  status: "APPROVED",
  amount: 0,
}

beforeEach(() => {
  selectQueue.length = 0
  insertPayloads.length = 0
  updatePayloads.length = 0
})

describe("settlePayoutAsPaid", () => {
  it("returns not_found when the request does not exist", async () => {
    selectQueue.push([])
    const result = await settlePayoutAsPaid(makeTx(), "pr_x", "Admin")
    expect(result).toEqual({ ok: false, reason: "not_found" })
    expect(insertPayloads).toHaveLength(0)
  })

  it("returns not_approved for a request that is not APPROVED", async () => {
    selectQueue.push([{ ...approved, status: "PENDING" }])
    const result = await settlePayoutAsPaid(makeTx(), "pr_1", "Admin")
    expect(result).toEqual({ ok: false, reason: "not_approved" })
    expect(insertPayloads).toHaveLength(0)
  })

  it("returns no_orders when nothing is linked to the request", async () => {
    selectQueue.push([approved])
    selectQueue.push([{ orderCount: 0, total: 0 }])
    const result = await settlePayoutAsPaid(makeTx(), "pr_1", "Admin")
    expect(result).toEqual({ ok: false, reason: "no_orders" })
    expect(insertPayloads).toHaveLength(0)
  })

  it("marks PAID and writes exactly one ledger row + one balance debit", async () => {
    selectQueue.push([approved])
    selectQueue.push([{ orderCount: 2, total: 150 }])

    const result = await settlePayoutAsPaid(makeTx(), "pr_1", "Admin")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.amount).toBe(150)

    // Request marked PAID with the amount recomputed from the linked orders.
    expect(updatePayloads[0]).toMatchObject({ status: "PAID", amount: 150 })

    // Exactly one PAYOUT ledger row, POSITIVE (a payout consumes credit).
    const ledger = insertPayloads.filter((p) => p.type === "PAYOUT")
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      merchantId: "m_1",
      status: "SETTLED",
      amount: 150,
      createdBy: "Admin",
    })

    // Exactly one balance upsert.
    const balance = insertPayloads.filter((p) => "balance" in p)
    expect(balance).toHaveLength(1)
    expect(balance[0]).toMatchObject({ merchantId: "m_1", balance: 150 })
  })

  it("recomputes the amount instead of trusting the stored value", async () => {
    selectQueue.push([{ ...approved, amount: 999 }])
    selectQueue.push([{ orderCount: 1, total: 42 }])
    const result = await settlePayoutAsPaid(makeTx(), "pr_1", "Admin")
    expect(result.ok).toBe(true)
    expect(updatePayloads[0]).toMatchObject({ amount: 42 })
  })
})
