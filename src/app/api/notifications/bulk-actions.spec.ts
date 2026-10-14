import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as ARCHIVE_ALL } from "@/app/api/notifications/archive/route"
import { POST as RESTORE } from "@/app/api/notifications/restore/route"

// The two routes the Archived view and its undo depend on.
//
// Both are bulk on purpose and both return the ids they touched: the undo fires
// from a toast that expires in five seconds, and a caller that cannot name what
// came back has to either restore everything (resurrecting rows dismissed
// deliberately last week) or restore nothing.
const {
  requireSessionMock,
  unauthorizedMock,
  forbiddenMock,
  archiveReadNotificationsMock,
  restoreNotificationsMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  unauthorizedMock: vi.fn(() =>
    Response.json({ error: "Unauthorized" }, { status: 401 }),
  ),
  forbiddenMock: vi.fn(() =>
    Response.json({ error: "Forbidden" }, { status: 403 }),
  ),
  archiveReadNotificationsMock: vi.fn(
    async (_updater: unknown, _opts: Record<string, unknown>) => ["n1", "n2"],
  ),
  // Mirrors the real guard in `restoreNotifications`: an empty set is a no-op,
  // not a query. Without it the mock answers "restored 2" to a request that named
  // nothing, and the test would pass while asserting a fiction.
  restoreNotificationsMock: vi.fn(
    async (_updater: unknown, opts: Record<string, unknown>) => {
      const ids = (opts.ids ?? []) as string[]
      return ids.length
    },
  ),
}))

vi.mock("@/lib/api-auth", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/api-response", () => ({
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/notifications", () => ({
  archiveReadNotifications: archiveReadNotificationsMock,
  restoreNotifications: restoreNotificationsMock,
}))

const REQ = () => new Request("http://x/api/notifications")

describe("POST /api/notifications/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue({ userId: "u1", role: "MERCHANT" })
    archiveReadNotificationsMock.mockResolvedValue(["n1", "n2"])
  })

  it("dismisses only the caller's read rows and reports which", async () => {
    const res = await ARCHIVE_ALL(REQ())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, archived: 2, ids: ["n1", "n2"] })
    expect(archiveReadNotificationsMock.mock.calls[0][1]).toMatchObject({
      userId: "u1",
    })
  })

  it("refuses an unauthenticated caller", async () => {
    requireSessionMock.mockResolvedValue(null)
    const res = await ARCHIVE_ALL(REQ())

    expect(res.status).toBe(401)
    expect(archiveReadNotificationsMock).not.toHaveBeenCalled()
  })

  it("refuses a role with no inbox", async () => {
    // A rider has no notifications to dismiss; archiving must not be a way to
    // mutate rows for an account that never receives any.
    requireSessionMock.mockResolvedValue({ userId: "r1", role: "RIDER" })
    const res = await ARCHIVE_ALL(REQ())

    expect(res.status).toBe(403)
    expect(archiveReadNotificationsMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/notifications/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue({ userId: "u1", role: "MERCHANT" })
  })

  const post = (body: unknown) =>
    RESTORE(
      new Request("http://x/api/notifications/restore", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    )

  it("puts the named rows back, scoped to the caller", async () => {
    const res = await post({ ids: ["n1", "n2"] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, restored: 2 })
    expect(restoreNotificationsMock.mock.calls[0][1]).toEqual({
      userId: "u1",
      ids: ["n1", "n2"],
    })
  })

  it("treats a body-less undo as a no-op rather than an error", async () => {
    // The toast's undo can outlive the component that owned the ids, so a
    // request arriving with nothing to restore has to succeed quietly.
    const res = await RESTORE(REQ())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, restored: 0 })
    expect(restoreNotificationsMock.mock.calls[0][1]).toMatchObject({
      ids: [],
    })
  })

  it("drops non-string members rather than passing them to the query", async () => {
    const res = await post({ ids: ["n1", 42, null, { a: 1 }] })

    expect(res.status).toBe(200)
    expect(restoreNotificationsMock.mock.calls[0][1]).toEqual({
      userId: "u1",
      ids: ["n1"],
    })
  })

  it("refuses an unauthenticated caller", async () => {
    requireSessionMock.mockResolvedValue(null)
    const res = await post({ ids: ["n1"] })

    expect(res.status).toBe(401)
    expect(restoreNotificationsMock).not.toHaveBeenCalled()
  })
})
