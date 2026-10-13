import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as ARCHIVE } from "@/app/api/notifications/[id]/archive/route"
import { POST as READ } from "@/app/api/notifications/read/route"
import { GET } from "@/app/api/notifications/route"

const {
  requireSessionMock,
  unauthorizedMock,
  forbiddenMock,
  getNotificationsForUserMock,
  countUnreadNotificationsMock,
  markNotificationsReadMock,
  setNotificationArchivedMock,
  notFoundMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  unauthorizedMock: vi.fn(() =>
    Response.json({ error: "Unauthorized" }, { status: 401 }),
  ),
  forbiddenMock: vi.fn(() =>
    Response.json({ error: "Forbidden" }, { status: 403 }),
  ),
  // Typed so `mock.calls[0][1]` is the options object the assertions read.
  getNotificationsForUserMock: vi.fn(
    async (_runner: unknown, _opts: Record<string, unknown>) => ({
      notifications: [],
      newCount: 0,
    }),
  ),
  countUnreadNotificationsMock: vi.fn(
    async (_runner: unknown, _opts: Record<string, unknown>) => 0,
  ),
  markNotificationsReadMock: vi.fn(
    async (_updater: unknown, _opts: Record<string, unknown>) => 3,
  ),
  setNotificationArchivedMock: vi.fn(
    async (_updater: unknown, _opts: Record<string, unknown>) => true,
  ),
  notFoundMock: vi.fn(() =>
    Response.json({ error: "Not found" }, { status: 404 }),
  ),
}))

vi.mock("@/lib/api-auth", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/api-response", () => ({
  notFound: notFoundMock,
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}))
vi.mock("@/lib/notifications", () => ({
  getNotificationsForUser: getNotificationsForUserMock,
  countUnreadNotifications: countUnreadNotificationsMock,
  markNotificationsRead: markNotificationsReadMock,
  setNotificationArchived: setNotificationArchivedMock,
}))
vi.mock("@/lib/db", () => ({ dbRead: {}, db: {} }))

const merchant = {
  userId: "usr-1",
  role: "MERCHANT",
  merchantId: "MER-1",
  notificationsSeenAt: null,
}

function req(url: string) {
  return new Request(`http://localhost${url}`)
}

/** A request carrying a JSON body, for the mutation routes. */
function jsonReq(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue(merchant)
    // Re-seeded after clearAllMocks, which drops the hoisted implementations.
    // mockImplementation (not mockResolvedValue) keeps the two-arg signature.
    getNotificationsForUserMock.mockImplementation(async () => ({
      notifications: [],
      newCount: 0,
    }))
    countUnreadNotificationsMock.mockImplementation(async () => 0)
  })

  it("401s without a session", async () => {
    requireSessionMock.mockResolvedValue(null)
    const res = await GET(req("/api/notifications"))
    expect(res.status).toBe(401)
    expect(getNotificationsForUserMock).not.toHaveBeenCalled()
  })

  it("refuses a role with no inbox rather than returning an empty one", async () => {
    // A rider would otherwise see a bell that can never light up.
    requireSessionMock.mockResolvedValue({ ...merchant, role: "RIDER" })
    const res = await GET(req("/api/notifications"))
    expect(res.status).toBe(403)
  })

  it("returns only the caller's own rows", async () => {
    await GET(req("/api/notifications"))
    // userId comes from the session and nothing else is accepted as input.
    expect(getNotificationsForUserMock.mock.calls[0][1]).toMatchObject({
      userId: "usr-1",
    })
  })

  it("ignores a userId supplied in the query string", async () => {
    await GET(req("/api/notifications?userId=usr-victim"))
    expect(getNotificationsForUserMock.mock.calls[0][1]).toMatchObject({
      userId: "usr-1",
    })
  })

  it("returns the unread count alone when asked", async () => {
    countUnreadNotificationsMock.mockResolvedValue(4)
    const res = await GET(req("/api/notifications?count=1"))
    expect(await res.json()).toEqual({ newCount: 4 })
    expect(getNotificationsForUserMock).not.toHaveBeenCalled()
  })

  it("clamps an oversized limit", async () => {
    await GET(req("/api/notifications?limit=100000"))
    expect(getNotificationsForUserMock.mock.calls[0][1]).toMatchObject({
      limit: 100,
    })
  })

  it("falls back to the default for a nonsense limit", async () => {
    await GET(req("/api/notifications?limit=abc"))
    expect(getNotificationsForUserMock.mock.calls[0][1]).toMatchObject({
      limit: 50,
    })
  })

  it("does not pass a watermark, because read state lives on the rows", async () => {
    // The whole point of the change: "what is unread" is a property of the
    // notifications themselves, so the route has nothing of the sort to forward.
    requireSessionMock.mockResolvedValue(merchant)
    await GET(req("/api/notifications"))
    expect(getNotificationsForUserMock.mock.calls[0][1]).not.toHaveProperty(
      "seenAt",
    )
  })
})

describe("POST /api/notifications/read", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue(merchant)
  })

  it("401s without a session", async () => {
    requireSessionMock.mockResolvedValue(null)
    const res = await READ(jsonReq("/api/notifications/read", { ids: ["n1"] }))
    expect(res.status).toBe(401)
    expect(markNotificationsReadMock).not.toHaveBeenCalled()
  })

  it("403s for a role with no inbox", async () => {
    requireSessionMock.mockResolvedValue({ ...merchant, role: "RIDER" })
    const res = await READ(jsonReq("/api/notifications/read", { ids: ["n1"] }))
    expect(res.status).toBe(403)
  })

  it("marks only the caller's own rows", async () => {
    const res = await READ(jsonReq("/api/notifications/read", { ids: ["n1"] }))
    expect(res.status).toBe(200)
    expect(markNotificationsReadMock.mock.calls[0][1]).toMatchObject({
      userId: "usr-1",
      ids: ["n1"],
    })
  })

  it("marks everything when asked to", async () => {
    await READ(jsonReq("/api/notifications/read", { all: true }))
    // `ids` must be omitted rather than empty, or the server would scope the
    // write to nothing and report success.
    expect(markNotificationsReadMock.mock.calls[0][1].ids).toBeUndefined()
  })

  it("400s when neither ids nor all is given", async () => {
    const res = await READ(jsonReq("/api/notifications/read", {}))
    expect(res.status).toBe(400)
    expect(markNotificationsReadMock).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/notifications/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue(merchant)
  })

  it("archives when the body omits a direction", async () => {
    const res = await ARCHIVE(
      new Request("http://test.local", { method: "PATCH" }),
      { params: Promise.resolve({ id: "n1" }) },
    )
    expect(res.status).toBe(200)
    expect(setNotificationArchivedMock.mock.calls[0][1]).toMatchObject({
      id: "n1",
      archived: true,
      userId: "usr-1",
    })
  })

  it("restores when told to", async () => {
    await ARCHIVE(
      jsonReq("/api/notifications/n1/archive", { archived: false }),
      { params: Promise.resolve({ id: "n1" }) },
    )
    expect(setNotificationArchivedMock.mock.calls[0][1]).toMatchObject({
      archived: false,
    })
  })

  it("404s for a row the caller does not own", async () => {
    setNotificationArchivedMock.mockResolvedValue(false)
    const res = await ARCHIVE(
      new Request("http://test.local", { method: "PATCH" }),
      { params: Promise.resolve({ id: "somebody-elses" }) },
    )
    expect(res.status).toBe(404)
  })
})
