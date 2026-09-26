import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { PATCH as banUser } from "./[id]/ban/route"
import { PATCH as setUserPassword } from "./[id]/password/route"
import { PATCH as unbanUser } from "./[id]/unban/route"
import { GET as listUsers } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      setUserPassword: vi.fn(() => Promise.resolve({ status: true })),
      banUser: vi.fn(() => Promise.resolve({ user: {} })),
      unbanUser: vi.fn(() => Promise.resolve({ user: {} })),
    },
  },
}))

const selectQueue: unknown[][] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      $dynamic: () => chain,
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(selectQueue.shift() ?? []).then(
          onFulfilled,
          onRejected,
        ),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => ({ values: () => Promise.resolve([]) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    delete: () => ({ where: () => Promise.resolve([]) }),
  }
  return { db, dbRead: { select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
  vi.mocked(auth.api.setUserPassword).mockClear()
  vi.mocked(auth.api.banUser).mockClear()
  vi.mocked(auth.api.unbanUser).mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api/admin/users", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wendy",
  userId: "u3",
}

describe("GET /api/admin/users", () => {
  it("401 when unauthenticated", async () => {
    const res = await listUsers(req("GET"))
    expect(res.status).toBe(401)
  })

  it("403 for a non-super-admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await listUsers(req("GET"))
    expect(res.status).toBe(403)
  })

  it("lists users with a total", async () => {
    sessionState.value = admin
    selectQueue.push(
      [{ count: 2 }],
      [
        { id: "u1", name: "Admin01", email: "admin1@email.com" },
        { id: "u2", name: "Owner 2", email: "merchant2@email.com" },
      ],
    )
    const res = await listUsers(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
    expect(json.data).toHaveLength(2)
    expect(json.data[1].email).toBe("merchant2@email.com")
  })

  it("accepts a search query", async () => {
    sessionState.value = admin
    selectQueue.push(
      [{ count: 1 }],
      [{ id: "u2", email: "merchant2@email.com" }],
    )
    const res = await listUsers(
      req("GET", "http://test.local/api/admin/users?q=merchant2"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("accepts a role filter and ignores unknown roles", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }], [{ id: "u2", role: "MERCHANT" }])
    const filtered = await listUsers(
      req("GET", "http://test.local/api/admin/users?role=MERCHANT"),
    )
    expect(filtered.status).toBe(200)

    selectQueue.push([{ count: 2 }], [{ id: "u1" }, { id: "u2" }])
    const unknown = await listUsers(
      req("GET", "http://test.local/api/admin/users?role=BOGUS"),
    )
    expect(unknown.status).toBe(200)
    const json = await unknown.json()
    expect(json.total).toBe(2)
  })
})

describe("PATCH /api/admin/users/[id]/password", () => {
  it("401 when unauthenticated", async () => {
    const res = await setUserPassword(
      req("PATCH", undefined, { password: "newsecret1" }),
      ctx("u2"),
    )
    expect(res.status).toBe(401)
  })

  it("403 for a non-super-admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await setUserPassword(
      req("PATCH", undefined, { password: "newsecret1" }),
      ctx("u2"),
    )
    expect(res.status).toBe(403)
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
  })

  it("400 when the password is too short", async () => {
    sessionState.value = admin
    const res = await setUserPassword(
      req("PATCH", undefined, { password: "short" }),
      ctx("u2"),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.issues).toBeDefined()
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("404 for an unknown user", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await setUserPassword(
      req("PATCH", undefined, { password: "newsecret1" }),
      ctx("missing"),
    )
    expect(res.status).toBe(404)
    expect(auth.api.setUserPassword).not.toHaveBeenCalled()
  })

  it("sets the password and audits it without the password", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "u2", email: "merchant2@email.com" }])
    const res = await setUserPassword(
      req("PATCH", undefined, { password: "newsecret1" }),
      ctx("u2"),
    )
    expect(res.status).toBe(200)
    expect(auth.api.setUserPassword).toHaveBeenCalledWith({
      body: { userId: "u2", newPassword: "newsecret1" },
      headers: expect.anything(),
    })
    expect(logAudit).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logAudit).mock.calls[0][0]
    expect(entry.action).toBe("USER_PASSWORD_RESET")
    expect(entry.entityType).toBe("user")
    expect(entry.entityId).toBe("u2")
    expect(entry.description).toContain("merchant2@email.com")
    expect(JSON.stringify(entry)).not.toContain("newsecret1")
    const json = await res.json()
    expect(json.id).toBe("u2")
  })
})

describe("PATCH /api/admin/users/[id]/ban", () => {
  it("401 when unauthenticated", async () => {
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation" }),
      ctx("u2"),
    )
    expect(res.status).toBe(401)
  })

  it("403 for a non-super-admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation" }),
      ctx("u2"),
    )
    expect(res.status).toBe(403)
    expect(auth.api.banUser).not.toHaveBeenCalled()
  })

  it("400 when the reason is missing", async () => {
    sessionState.value = admin
    const res = await banUser(req("PATCH", undefined, {}), ctx("u2"))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.issues).toBeDefined()
    expect(auth.api.banUser).not.toHaveBeenCalled()
  })

  it("400 when the reason is too short", async () => {
    sessionState.value = admin
    const res = await banUser(
      req("PATCH", undefined, { reason: "ab" }),
      ctx("u2"),
    )
    expect(res.status).toBe(400)
    expect(auth.api.banUser).not.toHaveBeenCalled()
  })

  it("404 for an unknown user", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation" }),
      ctx("missing"),
    )
    expect(res.status).toBe(404)
    expect(auth.api.banUser).not.toHaveBeenCalled()
  })

  it("400 when banning your own account", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "u1", email: "admin1@email.com" }])
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation" }),
      ctx("u1"),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Cannot ban your own account")
    expect(auth.api.banUser).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("bans the user with a reason and duration and audits it", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "u5", email: "merchant5@email.com" }])
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation", expiresInDays: 7 }),
      ctx("u5"),
    )
    expect(res.status).toBe(200)
    expect(auth.api.banUser).toHaveBeenCalledWith({
      body: {
        userId: "u5",
        banReason: "Terms violation",
        banExpiresIn: 7 * 24 * 60 * 60,
      },
      headers: expect.anything(),
    })
    const entry = vi.mocked(logAudit).mock.calls[0][0]
    expect(entry.action).toBe("USER_BANNED")
    expect(entry.entityType).toBe("user")
    expect(entry.entityId).toBe("u5")
    expect(entry.description).toBe("Banned merchant5@email.com")
    expect(entry.description).not.toContain("Terms violation")
    expect(entry.metadata).toMatchObject({
      target: "merchant5@email.com",
      reason: "Terms violation",
      expiresInDays: 7,
    })
  })

  it("bans without a duration", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "u5", email: "merchant5@email.com" }])
    const res = await banUser(
      req("PATCH", undefined, { reason: "Terms violation" }),
      ctx("u5"),
    )
    expect(res.status).toBe(200)
    expect(auth.api.banUser).toHaveBeenCalledWith({
      body: { userId: "u5", banReason: "Terms violation" },
      headers: expect.anything(),
    })
  })
})

describe("PATCH /api/admin/users/[id]/unban", () => {
  it("401 when unauthenticated", async () => {
    const res = await unbanUser(req("PATCH"), ctx("u5"))
    expect(res.status).toBe(401)
  })

  it("403 for a non-super-admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await unbanUser(req("PATCH"), ctx("u5"))
    expect(res.status).toBe(403)
    expect(auth.api.unbanUser).not.toHaveBeenCalled()
  })

  it("404 for an unknown user", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await unbanUser(req("PATCH"), ctx("missing"))
    expect(res.status).toBe(404)
    expect(auth.api.unbanUser).not.toHaveBeenCalled()
  })

  it("unbans the user and audits it", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "u5", email: "merchant5@email.com" }])
    const res = await unbanUser(req("PATCH"), ctx("u5"))
    expect(res.status).toBe(200)
    expect(auth.api.unbanUser).toHaveBeenCalledWith({
      body: { userId: "u5" },
      headers: expect.anything(),
    })
    expect(logAudit).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logAudit).mock.calls[0][0]
    expect(entry.action).toBe("USER_UNBANNED")
    expect(entry.entityType).toBe("user")
    expect(entry.entityId).toBe("u5")
    expect(entry.description).toBe("Unbanned merchant5@email.com")
    const json = await res.json()
    expect(json).toEqual({ id: "u5", banned: false })
  })
})
