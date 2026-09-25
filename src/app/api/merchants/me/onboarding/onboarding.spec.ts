import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as completeOnboarding } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => null,
  rateLimitByIp: () => null,
  getClientIp: () => "127.0.0.1",
}))

const updatePayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (vals: Record<string, unknown>) => {
        updatePayloads.push(vals)
        return chain
      },
      where: () => chain,
    }
    return chain
  }
  const db = {
    select: () => {
      throw new Error("select should not be called")
    },
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db }, pool: {} }
})

beforeEach(() => {
  updatePayloads.length = 0
  sessionState.value = null
})

const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u1",
  merchantId: "m_1",
}

describe("PATCH /api/merchants/me/onboarding", () => {
  it("401 when unauthenticated", async () => {
    const res = await completeOnboarding()
    expect(res.status).toBe(401)
  })

  it("401 for super admin role", async () => {
    sessionState.value = { role: "SUPER_ADMIN", name: "Admin", userId: "u2" }
    const res = await completeOnboarding()
    expect(res.status).toBe(401)
  })

  it("401 for warehouse admin role", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH",
      userId: "u3",
    }
    const res = await completeOnboarding()
    expect(res.status).toBe(401)
  })

  it("401 for merchant session without merchantId", async () => {
    sessionState.value = { role: "MERCHANT", name: "Moe", userId: "u4" }
    const res = await completeOnboarding()
    expect(res.status).toBe(401)
    expect(updatePayloads).toHaveLength(0)
  })

  it("completes onboarding and returns ok", async () => {
    sessionState.value = merchantSession
    const res = await completeOnboarding()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true })
  })

  it("sets onboardingCompletedAt to an ISO timestamp", async () => {
    sessionState.value = merchantSession
    await completeOnboarding()
    expect(updatePayloads).toHaveLength(1)
    const payload = updatePayloads[0]
    expect(typeof payload.onboardingCompletedAt).toBe("string")
    expect(
      Number.isNaN(Date.parse(payload.onboardingCompletedAt as string)),
    ).toBe(false)
  })
})
