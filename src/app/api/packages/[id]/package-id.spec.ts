import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { DELETE, PATCH } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const selectQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []
let updateReturning: unknown[] = []
const deleted: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      $dynamic: () => chain,
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return { where: () => ({ returning: () => updateReturning }) }
      },
    }),
    delete: () => ({
      where: () => {
        deleted.push(true)
        return Promise.resolve([])
      },
    }),
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([]) }),
    }),
  }
  return { db, dbRead: db, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updatePayloads.length = 0
  updateReturning = []
  deleted.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://test.local/api/packages/pkg_1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchant = { role: "MERCHANT", name: "Moe", userId: "u2" }

const starter = {
  id: "pkg_1",
  name: "Starter",
  description: null,
  price: "1000.00",
  isActive: true,
}

/** Reference counts come back as two separate select chains. */
function queueReferences(bundles: number, requests: number) {
  selectQueue.push([{ bundles }])
  selectQueue.push([{ requests }])
}

describe("DELETE /api/packages/[id]", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(
      new Request("http://test.local/api/packages/pkg_1"),
      params("pkg_1"),
    )
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await DELETE(
      new Request("http://test.local/api/packages/pkg_1"),
      params("pkg_1"),
    )
    expect(res.status).toBe(403)
  })

  it("404 when the package does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await DELETE(
      new Request("http://test.local/api/packages/nope"),
      params("nope"),
    )
    expect(res.status).toBe(404)
    expect(deleted).toHaveLength(0)
  })

  it("hard-deletes a package nobody has bought", async () => {
    sessionState.value = admin
    selectQueue.push([starter])
    queueReferences(0, 0)

    const res = await DELETE(
      new Request("http://test.local/api/packages/pkg_1"),
      params("pkg_1"),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    expect(deleted).toHaveLength(1)
    expect(updatePayloads).toHaveLength(0)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_DELETED" }),
    )
  })

  it("archives instead of deleting while bundles still reference it", async () => {
    sessionState.value = admin
    selectQueue.push([starter])
    queueReferences(3, 0)
    updateReturning = [{ ...starter, isActive: false }]

    const res = await DELETE(
      new Request("http://test.local/api/packages/pkg_1"),
      params("pkg_1"),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ archived: true })
    expect(json.package).toMatchObject({ isActive: false })
    expect(deleted).toHaveLength(0)
    expect(updatePayloads[0]).toMatchObject({ isActive: false })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_ARCHIVED" }),
    )
  })

  it("archives when only a purchase request references it", async () => {
    sessionState.value = admin
    selectQueue.push([starter])
    queueReferences(0, 1)
    updateReturning = [{ ...starter, isActive: false }]

    const res = await DELETE(
      new Request("http://test.local/api/packages/pkg_1"),
      params("pkg_1"),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ archived: true })
    expect(deleted).toHaveLength(0)
  })
})

describe("PATCH /api/packages/[id]", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(jsonReq("PATCH", { name: "New" }), params("pkg_1"))
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await PATCH(jsonReq("PATCH", { name: "New" }), params("pkg_1"))
    expect(res.status).toBe(403)
  })

  it("400 on an invalid body", async () => {
    sessionState.value = admin
    const res = await PATCH(jsonReq("PATCH", { price: -50 }), params("pkg_1"))
    expect(res.status).toBe(400)
  })

  it("404 when the package does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await PATCH(jsonReq("PATCH", { name: "New" }), params("nope"))
    expect(res.status).toBe(404)
  })

  it("updates the package and writes an audit diff", async () => {
    sessionState.value = admin
    selectQueue.push([starter])
    updateReturning = [{ ...starter, name: "New name" }]

    const res = await PATCH(
      jsonReq("PATCH", { name: "  New name  " }),
      params("pkg_1"),
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({ name: "New name" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_UPDATED" }),
    )
  })
})
