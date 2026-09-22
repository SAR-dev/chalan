import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getMe, PATCH as updateMe } from "./route"

vi.mock("@/lib/api-auth", () => ({}))

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: () =>
        Promise.resolve({
          user: {
            id: "u1",
            name: "Test User",
            email: "test@test.com",
            emailVerified: true,
            image: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          session: {},
        }),
    },
  },
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const tx = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/users/me", () => {
  it("returns current user profile", async () => {
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "123",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await getMe()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "u1", name: "Test User" })
  })
})

describe("PATCH /api/users/me", () => {
  it("updates profile", async () => {
    updateResult.push({
      id: "u1",
      name: "Updated",
      updatedAt: new Date().toISOString(),
    })
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "123",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await updateMe(req("PATCH", { name: "Updated" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.name).toBe("Updated")
  })

  it("updates phone number", async () => {
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "01712345678",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await updateMe(req("PATCH", { phone: "01712345678" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.phone).toBe("01712345678")
  })
})
