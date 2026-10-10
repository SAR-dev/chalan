import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/notifications/route"
import { POST } from "@/app/api/notifications/seen/route"

const {
  requireSessionMock,
  unauthorizedMock,
  forbiddenMock,
  getNotificationsForUserMock,
  countUnreadNotificationsMock,
  markNotificationsSeenMock,
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
  markNotificationsSeenMock: vi.fn(
    async (_updater: unknown, _opts: Record<string, unknown>) => {},
  ),
}))

vi.mock("@/lib/api-auth", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/api-response", () => ({
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}))
vi.mock("@/lib/notifications", () => ({
  getNotificationsForUser: getNotificationsForUserMock,
  countUnreadNotifications: countUnreadNotificationsMock,
  markNotificationsSeen: markNotificationsSeenMock,
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

  it("passes the watermark so the server decides what is new", async () => {
    requireSessionMock.mockResolvedValue({
      ...merchant,
      notificationsSeenAt: "2026-01-01T00:00:00.000Z",
    })
    await GET(req("/api/notifications"))
    expect(getNotificationsForUserMock.mock.calls[0][1]).toMatchObject({
      seenAt: "2026-01-01T00:00:00.000Z",
    })
  })
})

describe("POST /api/notifications/seen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue(merchant)
  })

  it("401s without a session", async () => {
    requireSessionMock.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(markNotificationsSeenMock).not.toHaveBeenCalled()
  })

  it("stamps the caller's own watermark", async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(markNotificationsSeenMock.mock.calls[0][1]).toMatchObject({
      userId: "usr-1",
    })
  })

  it("returns the instant it stamped, so the client can show it", async () => {
    const res = await POST()
    const body = await res.json()
    expect(typeof body.seenAt).toBe("string")
  })
})
