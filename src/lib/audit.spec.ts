import { beforeEach, describe, expect, it, vi } from "vitest"

let shouldThrow = false
const insertCalls: { table: string; values: Record<string, unknown> }[] = []

vi.mock("@/lib/db", () => ({
  db: {
    insert: (table: any) => ({
      values: (v: any) => {
        if (shouldThrow) return Promise.reject(new Error("DB error"))
        const name =
          typeof table?._?.name === "string" ? table._.name : "unknown"
        insertCalls.push({ table: name, values: v })
        return Promise.resolve()
      },
    }),
  },
}))

vi.mock("@/lib/db/schema", () => ({
  auditLog: { _: { name: "audit_log" } },
}))

describe("logAudit", () => {
  beforeEach(() => {
    shouldThrow = false
    insertCalls.length = 0
  })

  it("inserts an audit log entry", async () => {
    const { logAudit } = await import("@/lib/audit")
    await logAudit({
      actor: { userId: "u1", name: "Admin", role: "SUPER_ADMIN" },
      action: "MERCHANT_APPROVED",
      entityType: "merchant",
      entityId: "m1",
      description: "Approved merchant TestBiz",
    })
    expect(insertCalls.length).toBe(1)
    expect(insertCalls[0].table).toBe("audit_log")
    expect(insertCalls[0].values).toMatchObject({
      actorId: "u1",
      actorName: "Admin",
      action: "MERCHANT_APPROVED",
      entityId: "m1",
    })
  })

  it("sets null entityId and metadata when omitted", async () => {
    const { logAudit } = await import("@/lib/audit")
    await logAudit({
      actor: { userId: "u2", name: "System", role: "SUPER_ADMIN" },
      action: "BULK_ACTION",
      entityType: "order",
      description: "Bulk cancelled 5 orders",
    })
    expect(insertCalls[0].values.entityId).toBeNull()
    expect(insertCalls[0].values.metadata).toBeNull()
  })

  it("does not throw when DB insert fails", async () => {
    shouldThrow = true
    const { logAudit } = await import("@/lib/audit")
    await expect(
      logAudit({
        actor: { userId: "u3", name: "Tester", role: "SUPER_ADMIN" },
        action: "TEST",
        entityType: "test",
        description: "Should not throw",
      }),
    ).resolves.toBeUndefined()
  })

  it("writes through the transaction handle when one is given", async () => {
    // ROADMAP P1.1/P1.4: the entry must commit with the change it describes.
    const { logAudit } = await import("@/lib/audit")
    const txValues: Record<string, unknown>[] = []
    const tx = {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          txValues.push(v)
          return Promise.resolve()
        },
      }),
    }
    await logAudit(
      {
        actor: { userId: "u4", name: "Owner", role: "MERCHANT" },
        action: "MODERATOR_CREATED",
        entityType: "profile",
        entityId: "mod_1",
        description: "Invited a moderator",
      },
      tx as never,
    )
    expect(txValues).toHaveLength(1)
    expect(txValues[0]).toMatchObject({
      action: "MODERATOR_CREATED",
      entityId: "mod_1",
    })
    // The standalone writer was not used.
    expect(insertCalls).toHaveLength(0)
  })

  it("propagates a failure inside a transaction so the change rolls back", async () => {
    // Outside a transaction a logging failure must never break the response;
    // inside one, swallowing it would commit a mutation with no trail.
    const { logAudit } = await import("@/lib/audit")
    const tx = {
      insert: () => ({
        values: () => Promise.reject(new Error("DB error")),
      }),
    }
    await expect(
      logAudit(
        {
          actor: { userId: "u5", name: "Owner", role: "MERCHANT" },
          action: "MODERATOR_CREATED",
          entityType: "profile",
          description: "Should roll back",
        },
        tx as never,
      ),
    ).rejects.toThrow("DB error")
  })
})
