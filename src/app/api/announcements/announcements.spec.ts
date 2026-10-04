import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE as deleteAnnouncement,
  PATCH as updateAnnouncement,
} from "./[id]/route"
import { GET as activeAnnouncements } from "./active/route"
import { DELETE as bulkDeleteAnnouncements } from "./bulk/route"
import { POST as createAnnouncement, GET as listAnnouncements } from "./route"
import { POST as markSeen } from "./seen/route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
  logAuditMany: () => Promise.resolve(),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
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
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: () => chain,
      onConflictDoNothing: () => chain,
      returning: () => Promise.resolve(insertResult),
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(insertResult).then(onFulfilled),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  insertResult.length = 0
  sessionState.value = null
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "ann_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}

describe("GET /api/announcements", () => {
  it("401 when unauthenticated", async () => {
    const res = await listAnnouncements(req("GET"))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role (management list is super-admin only)", async () => {
    sessionState.value = merchantSession
    const res = await listAnnouncements(req("GET"))
    expect(res.status).toBe(403)
  })

  it("returns paginated announcements", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }], [{ id: "ann_1", title: "Update" }])
    const res = await listAnnouncements(
      req("GET", "http://test.local/api?limit=10"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })
})

describe("POST /api/announcements", () => {
  const validBody = {
    title: "New Announcement",
    content: "Content here",
    targetRoles: ["MERCHANT"],
  }

  it("401 when unauthenticated", async () => {
    const res = await createAnnouncement(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await createAnnouncement(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
  })

  it("creates announcement", async () => {
    sessionState.value = admin
    insertResult.push({ id: "ann_new", title: "New Announcement" })
    const res = await createAnnouncement(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "ann_new" })
  })
})

describe("GET /api/announcements/active", () => {
  it("401 when unauthenticated", async () => {
    const res = await activeAnnouncements()
    expect(res.status).toBe(401)
  })

  it("returns active announcements for role", async () => {
    sessionState.value = merchantSession
    selectQueue.push([
      {
        id: "ann_1",
        title: "Active",
        targetRoles: ["MERCHANT"],
        publishedAt: "2025-01-01",
      },
    ])
    const res = await activeAnnouncements()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
  })

  it("flags everything new when the reader has never visited the feed", async () => {
    sessionState.value = { ...merchantSession, announcementsSeenAt: null }
    selectQueue.push([
      { id: "ann_1", title: "Old post", publishedAt: "2025-01-01T00:00:00Z" },
      { id: "ann_2", title: "New post", publishedAt: "2025-06-01T00:00:00Z" },
    ])
    const res = await activeAnnouncements()
    const json = (await res.json()) as Array<{ id: string; isNew: boolean }>
    expect(json.map((r) => r.isNew)).toEqual([true, true])
  })

  it("flags only rows published after the last feed visit", async () => {
    // Watermark between the two publishedAt values: first row predates the
    // visit (seen), second one is newer (new).
    sessionState.value = {
      ...merchantSession,
      announcementsSeenAt: "2025-03-01T00:00:00Z",
    }
    selectQueue.push([
      { id: "ann_1", title: "Seen", publishedAt: "2025-01-01T00:00:00Z" },
      { id: "ann_2", title: "New", publishedAt: "2025-06-01T00:00:00Z" },
    ])
    const res = await activeAnnouncements()
    const json = (await res.json()) as Array<{ id: string; isNew: boolean }>
    expect(json.map((r) => r.isNew)).toEqual([false, true])
  })
})

describe("POST /api/announcements/seen", () => {
  it("401 when unauthenticated", async () => {
    const res = await markSeen()
    expect(res.status).toBe(401)
  })

  it("advances the watermark and returns ok", async () => {
    sessionState.value = merchantSession
    const res = await markSeen()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true })
    expect(json.seenAt).toBeTruthy()
  })
})

describe("PATCH /api/announcements/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateAnnouncement(
      req("PATCH", undefined, { title: "UPD" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await updateAnnouncement(
      req("PATCH", undefined, { title: "UPD" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("updates announcement", async () => {
    sessionState.value = admin
    updateResult.push({ id: "ann_1", title: "Updated" })
    const res = await updateAnnouncement(
      req("PATCH", undefined, { title: "Updated" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ title: "Updated" })
  })
})

describe("DELETE /api/announcements/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await deleteAnnouncement(req("DELETE"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await deleteAnnouncement(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await deleteAnnouncement(req("DELETE"), ctx())
    expect(res.status).toBe(404)
  })

  it("deletes announcement", async () => {
    sessionState.value = admin
    selectQueue.push([{ title: "Old" }])
    const res = await deleteAnnouncement(req("DELETE"), ctx())
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/announcements/bulk", () => {
  it("401 when unauthenticated", async () => {
    const res = await bulkDeleteAnnouncements(
      req("DELETE", undefined, { ids: ["a1"] }),
    )
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await bulkDeleteAnnouncements(
      req("DELETE", undefined, { ids: ["a1"] }),
    )
    expect(res.status).toBe(403)
  })

  it("400 when ids missing", async () => {
    sessionState.value = admin
    const res = await bulkDeleteAnnouncements(req("DELETE", undefined, {}))
    expect(res.status).toBe(400)
  })

  it("deletes the given announcements", async () => {
    sessionState.value = admin
    selectQueue.push([
      { id: "a1", title: "One" },
      { id: "a2", title: "Two" },
    ])
    const res = await bulkDeleteAnnouncements(
      req("DELETE", undefined, { ids: ["a1", "a2"] }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 2 })
  })

  it("no-ops when none of the ids exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await bulkDeleteAnnouncements(
      req("DELETE", undefined, { ids: ["missing"] }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 0 })
  })
})
