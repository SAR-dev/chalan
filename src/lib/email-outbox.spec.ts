import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendMail } from "@/lib/mailer"
import { drainEmailOutbox, enqueueEmail } from "./email-outbox"

const dbState = vi.hoisted(() => ({
  claimed: [] as Record<string, unknown>[],
  enqueued: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
}))

vi.mock("@/lib/db", () => {
  const updateChain = () => {
    const chain: Record<string, unknown> = {
      set: (v: Record<string, unknown>) => {
        dbState.updates.push(v)
        return chain
      },
      where: () => Promise.resolve(undefined),
    }
    return chain
  }
  const txSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      for: () => Promise.resolve(dbState.claimed),
    }
    return chain
  }
  const tx = { select: () => txSelectChain(), update: () => updateChain() }
  return {
    db: {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          dbState.enqueued.push(v)
          return Promise.resolve()
        },
      }),
      update: () => updateChain(),
      delete: () => ({
        where: () => {
          dbState.deletes++
          return Promise.resolve()
        },
      }),
      transaction: (fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)),
    },
    pool: {},
  }
})

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }))

beforeEach(() => {
  dbState.claimed.length = 0
  dbState.enqueued.length = 0
  dbState.updates.length = 0
  dbState.deletes = 0
  vi.mocked(sendMail).mockReset()
  vi.mocked(sendMail).mockResolvedValue(undefined)
})

describe("enqueueEmail", () => {
  it("stores the email as a PENDING row", async () => {
    await enqueueEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<b>Hi</b>",
    })
    expect(dbState.enqueued[0]).toMatchObject({
      to: "a@b.com",
      subject: "Hi",
      html: "<b>Hi</b>",
    })
  })

  it("joins multiple recipients", async () => {
    await enqueueEmail({ to: ["a@b.com", "c@d.com"], subject: "Hi" })
    expect(dbState.enqueued[0].to).toBe("a@b.com, c@d.com")
  })
})

describe("drainEmailOutbox", () => {
  it("sends claimed rows and deletes them on success", async () => {
    dbState.claimed.push({
      id: "ob_1",
      to: "a@b.com",
      subject: "Hi",
      html: null,
      text: "Hi",
      attempts: 0,
    })
    const result = await drainEmailOutbox()
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", subject: "Hi" }),
      { maxRetries: 0 },
    )
    expect(dbState.deletes).toBe(1)
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, requeued: 0 })
  })

  it("requeues with backoff when the send fails", async () => {
    dbState.claimed.push({
      id: "ob_2",
      to: "a@b.com",
      subject: "Hi",
      html: null,
      text: null,
      attempts: 0,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
    const result = await drainEmailOutbox()
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, requeued: 1 })
    expect(dbState.updates).toContainEqual(
      expect.objectContaining({ status: "PENDING", attempts: 1 }),
    )
  })

  it("marks FAILED after the final attempt", async () => {
    dbState.claimed.push({
      id: "ob_3",
      to: "a@b.com",
      subject: "Hi",
      html: null,
      text: null,
      attempts: 4,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
    const result = await drainEmailOutbox()
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, requeued: 0 })
    expect(dbState.updates).toContainEqual(
      expect.objectContaining({ status: "FAILED", attempts: 5 }),
    )
  })

  it("recovers stale SENDING rows before claiming", async () => {
    await drainEmailOutbox()
    // First update is the recovery sweep.
    expect(dbState.updates[0]).toMatchObject({ status: "PENDING" })
  })
})
