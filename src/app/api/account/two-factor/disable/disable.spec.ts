import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as disableTwoFactor } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
const verifyTOTP = vi.fn()
const verifyBackupCode = vi.fn()

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      verifyTOTP: (...args: unknown[]) => verifyTOTP(...args),
      verifyBackupCode: (...args: unknown[]) => verifyBackupCode(...args),
    },
  },
}))

const selectQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []
const deleteCalls: string[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => {
      const chain = {
        set: (vals: Record<string, unknown>) => {
          updatePayloads.push(vals)
          return chain
        },
        where: () => Promise.resolve([]),
      }
      return chain
    },
    delete: () => ({
      where: () => {
        deleteCalls.push("twoFactor")
        return Promise.resolve([])
      },
    }),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updatePayloads.length = 0
  deleteCalls.length = 0
  sessionState.value = null
  verifyTOTP.mockReset()
  verifyBackupCode.mockReset()
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/account/two-factor/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const apiError = Object.assign(new Error("Invalid code"), {
  name: "APIError",
  status: 401,
})

describe("POST /api/account/two-factor/disable", () => {
  it("401 when unauthenticated", async () => {
    const res = await disableTwoFactor(req({ code: "123456" }))
    expect(res.status).toBe(401)
  })

  it("400 on missing code", async () => {
    sessionState.value = admin
    const res = await disableTwoFactor(req({}))
    expect(res.status).toBe(400)
    expect(verifyTOTP).not.toHaveBeenCalled()
  })

  it("400 when the user has no enrolment", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await disableTwoFactor(req({ code: "123456" }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Two-factor authentication is not enabled.")
    expect(verifyTOTP).not.toHaveBeenCalled()
    expect(updatePayloads).toHaveLength(0)
  })

  it("401 when neither the TOTP nor a recovery code is valid", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "tf_1" }])
    verifyTOTP.mockRejectedValue(apiError)
    verifyBackupCode.mockRejectedValue(apiError)
    const res = await disableTwoFactor(req({ code: "000000" }))
    const json = await res.json()
    expect(res.status).toBe(401)
    expect(json.error).toBe("Invalid verification code.")
    expect(updatePayloads).toHaveLength(0)
    expect(deleteCalls).toHaveLength(0)
  })

  it("disables after a valid TOTP code", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "tf_1" }])
    verifyTOTP.mockResolvedValue({ token: "t", user: {} })
    const res = await disableTwoFactor(req({ code: "123456" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: true })
    expect(updatePayloads[0].twoFactorEnabled).toBe(false)
    expect(deleteCalls).toEqual(["twoFactor"])
    expect(verifyBackupCode).not.toHaveBeenCalled()
  })

  it("disables after a valid recovery code when the TOTP fails", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "tf_1" }])
    verifyTOTP.mockRejectedValue(apiError)
    verifyBackupCode.mockResolvedValue({ token: "t", user: {} })
    const res = await disableTwoFactor(req({ code: "abcde-fghij" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: true })
    expect(updatePayloads[0].twoFactorEnabled).toBe(false)
    expect(deleteCalls).toEqual(["twoFactor"])
  })

  it("surfaces unexpected verification failures as 500", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "tf_1" }])
    verifyTOTP.mockRejectedValue(new Error("database down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await disableTwoFactor(req({ code: "123456" }))
    expect(res.status).toBe(500)
    expect(updatePayloads).toHaveLength(0)
    spy.mockRestore()
  })
})
