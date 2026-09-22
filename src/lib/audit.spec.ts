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
})
