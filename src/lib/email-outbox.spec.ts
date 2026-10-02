import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendMail } from "@/lib/mailer"
import {
  drainEmailOutbox,
  enqueueEmail,
  MAX_OUTBOX_ATTEMPTS,
} from "./email-outbox"

const dbState = vi.hoisted(() => ({
  claimed: [] as Record<string, unknown>[],
  enqueued: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
}))

/**
 * The update written by the send-failure path, as distinct from the stale
 * `SENDING` recovery sweep that runs first. Only the failure path writes
 * `attempts`, which is what makes it the discriminator.
 */
function failureUpdate(): Record<string, unknown> | undefined {
  return dbState.updates.find((u) => typeof u.attempts === "number")
}

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

vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(async () => {}),
  toPlainText: (html: string) => html.replace(/<[^>]+>/g, ""),
}))

beforeEach(() => {
  dbState.claimed.length = 0
  dbState.enqueued.length = 0
  dbState.updates.length = 0
  dbState.deletes = 0
  vi.mocked(sendMail).mockReset()
  vi.mocked(sendMail).mockResolvedValue(undefined)
})

describe("enqueueEmail", () => {
  it("stores the plain-text version of the email as a PENDING row", async () => {
    await enqueueEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<b>Hi</b>",
    })
    expect(dbState.enqueued[0]).toMatchObject({
      to: "a@b.com",
      subject: "Hi",
      text: "Hi",
    })
  })

  it("does not persist the HTML body", async () => {
    await enqueueEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<b>Hi</b>",
      text: "Hi",
    })
    expect(dbState.enqueued[0]).not.toHaveProperty("html")
  })

  it("stores the explicit text version when provided", async () => {
    await enqueueEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>HTML</p>",
      text: "Plain text",
    })
    expect(dbState.enqueued[0].text).toBe("Plain text")
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
      text: "Hi",
      attempts: 0,
    })
    const result = await drainEmailOutbox()
    expect(sendMail).toHaveBeenCalledWith({
      to: "a@b.com",
      subject: "Hi",
      text: "Hi",
    })
    expect(dbState.deletes).toBe(1)
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 })
  })

  // A single SMTP blip must not cost the recipient their activation or
  // password-reset link — the whole reason the outbox exists.
  it("requeues with backoff instead of parking on the first failure", async () => {
    dbState.claimed.push({
      id: "ob_2",
      to: "a@b.com",
      subject: "Hi",
      text: null,
      attempts: 0,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
    const result = await drainEmailOutbox()
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 })
    const failure = failureUpdate()
    expect(failure).toMatchObject({ status: "PENDING", attempts: 1 })
    expect(failure?.lastError).toBe("smtp down")
    // Nothing is deleted — the intent stays queued for the next drain.
    expect(dbState.deletes).toBe(0)
  })

  // Backoff is what stops a sustained outage from hammering the provider, and
  // what stops the row being re-claimed the instant this drain returns.
  it("delays the retry rather than leaving it immediately claimable", async () => {
    dbState.claimed.push({
      id: "ob_2b",
      to: "a@b.com",
      subject: "Hi",
      text: null,
      attempts: 0,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
    await drainEmailOutbox()
    const next = failureUpdate()?.nextAttemptAt
    expect(typeof next).toBe("string")
    const delayMinutes = (Date.parse(next as string) - Date.now()) / 60_000
    // First backoff is 2 minutes; allow slack for test execution.
    expect(delayMinutes).toBeGreaterThan(1.5)
    expect(delayMinutes).toBeLessThan(3)
  })

  it("backs off further on each consecutive failure", async () => {
    const delays: number[] = []
    for (const attempts of [1, 2, 3]) {
      dbState.claimed.length = 0
      dbState.updates.length = 0
      dbState.claimed.push({
        id: `ob_bo_${attempts}`,
        to: "a@b.com",
        subject: "Hi",
        text: null,
        attempts,
      })
      vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
      await drainEmailOutbox()
      const next = failureUpdate()?.nextAttemptAt
      delays.push((Date.parse(next as string) - Date.now()) / 60_000)
    }
    // 2 → 4 → 8 minutes: strictly increasing.
    expect(delays[0]).toBeLessThan(delays[1])
    expect(delays[1]).toBeLessThan(delays[2])
  })

  it("parks the row as FAILED once the attempts are spent", async () => {
    dbState.claimed.push({
      id: "ob_4",
      to: "a@b.com",
      subject: "Hi",
      text: null,
      attempts: MAX_OUTBOX_ATTEMPTS - 1,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"))
    const result = await drainEmailOutbox()
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 })
    const failure = failureUpdate()
    expect(failure?.status).toBe("FAILED")
    expect(failure?.attempts).toBe(MAX_OUTBOX_ATTEMPTS)
    // A parked row must not be given a future retry time — it is done.
    expect(failure).not.toHaveProperty("nextAttemptAt")
  })

  it("records the error message on the retried row", async () => {
    dbState.claimed.push({
      id: "ob_3",
      to: "a@b.com",
      subject: "Hi",
      text: null,
      attempts: 2,
    })
    vi.mocked(sendMail).mockRejectedValueOnce(
      new Error("Invalid login: 535 5.7.8 Username and Password not accepted"),
    )
    await drainEmailOutbox()
    const failure = failureUpdate()
    expect(failure?.attempts).toBe(3)
    expect(failure?.status).toBe("PENDING")
    expect(failure?.lastError).toContain("Username and Password not accepted")
  })

  it("recovers stale SENDING rows before claiming", async () => {
    await drainEmailOutbox()
    // First update is the recovery sweep.
    expect(dbState.updates[0]).toMatchObject({ status: "PENDING" })
  })
})
