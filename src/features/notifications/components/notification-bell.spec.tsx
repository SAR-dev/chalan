// @vitest-environment jsdom

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { countMutate, listMutate, globalMutate } = vi.hoisted(() => ({
  countMutate: vi.fn(),
  listMutate: vi.fn(),
  globalMutate: vi.fn(async () => undefined),
}))

const swrState = vi.hoisted(() => ({
  count: { data: { newCount: 0 } as unknown, key: null as unknown },
  list: { data: undefined as unknown, key: null as unknown },
}))

// Records every key the hooks ask for, so a gated-out reader can be proven to
// have issued no request at all rather than merely rendered the same output.
const swrKeys = vi.hoisted(() => [] as unknown[])

vi.mock("swr", () => ({
  default: (key: unknown, _fetcher: unknown, _opts?: unknown) => {
    swrKeys.push(key)
    const isCount = key === "/api/notifications?count=1"
    return {
      data: isCount ? swrState.count.data : swrState.list.data,
      isLoading: false,
      error: undefined,
      mutate: isCount ? countMutate : listMutate,
    }
  },
  // The hook drains the badge's own cache as well as the list, so it reaches
  // for the global mutator.
  useSWRConfig: () => ({ mutate: globalMutate }),
}))

let currentRole = "MERCHANT"
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: { id: "usr-1", role: currentRole } }),
}))

// Only the two TopNav bells render together here; the announcement feed's own
// fetching is covered by its route spec.
vi.mock("@/features/announcements/hooks/use-active-announcements", () => ({
  useActiveAnnouncements: () => ({
    announcements: [],
    newCount: 0,
    isLoading: false,
  }),
}))

import { NotificationBell } from "@/features/notifications/components/notification-bell"

const COUNT_KEY = "/api/notifications?count=1"
const LIST_KEY = "/api/notifications?limit=50"

const row = {
  id: "n1",
  event: "order.delivered",
  orderId: "ORD-1",
  merchantId: "MER-1",
  actorName: "RIDER-014",
  title: "Order delivered",
  href: "/dashboard/orders/ORD-1",
  createdAt: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
  swrKeys.length = 0
  currentRole = "MERCHANT"
  swrState.count = { data: { newCount: 0 }, key: COUNT_KEY }
  swrState.list = { data: undefined, key: LIST_KEY }
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ),
  )
})

describe("NotificationBell", () => {
  it("shows no badge when nothing is unread", () => {
    render(<NotificationBell />)
    expect(screen.queryByTestId("notification-badge")).toBeNull()
  })

  it("badges the unread count", () => {
    swrState.count.data = { newCount: 3 }
    render(<NotificationBell />)
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("3")
  })

  it("caps the badge so it cannot resize the bar", () => {
    swrState.count.data = { newCount: 42 }
    render(<NotificationBell />)
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("9+")
  })

  it("names the unread count for assistive tech", () => {
    swrState.count.data = { newCount: 2 }
    render(<NotificationBell />)
    expect(screen.getByLabelText("Notifications, 2 new")).toBeInTheDocument()
  })

  it("fetches the badge only, deferring the list until the tray opens", () => {
    render(<NotificationBell />)
    // Mounting the tray must not pull 50 rows for a panel nobody opened.
    expect(swrKeys).toContain(COUNT_KEY)
    expect(swrKeys).not.toContain(LIST_KEY)
  })

  it("issues no request at all for a role with no inbox", () => {
    currentRole = "RIDER"
    render(<NotificationBell />)
    // A rider has no inbox: every key is null, so SWR never fetches anything.
    expect(swrKeys.length).toBeGreaterThan(0)
    expect(swrKeys.every((k) => k === null)).toBe(true)
    expect(screen.queryByTestId("notification-badge")).toBeNull()
  })

  it("keeps the bell reachable by label even with an unread badge", async () => {
    swrState.count.data = { newCount: 1 }
    render(<NotificationBell />)
    await waitFor(() =>
      expect(screen.getByTestId("notification-badge")).toBeInTheDocument(),
    )
    expect(screen.getByLabelText("Notifications, 1 new")).toBeInTheDocument()
  })

  it("does not cache an empty inbox over rows still in flight", async () => {
    // Opening the tray stamps the watermark, which resolves before the first
    // list fetch. If markSeen wrote {notifications: []} into the cache at that
    // moment it would overwrite the real rows as they arrived, and a merchant
    // with notifications would be told they had none.
    const { useNotifications } = await import(
      "@/features/notifications/hooks/use-notifications"
    )
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      const res = await result.current.markSeen()
      expect(res.ok).toBe(true)
    })

    // The cache was never populated, so nothing was overwritten.
    expect(listMutate).not.toHaveBeenCalled()
  })

  it("drains the badge's own cache, not just the list", async () => {
    // The badge reads a separate SWR key (`?count=1`) from the list. Draining
    // only the list leaves the bell showing its last polled number, so the tray
    // reads "seen" while the badge still counts the same rows.
    const { useNotifications } = await import(
      "@/features/notifications/hooks/use-notifications"
    )
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markSeen()
    })

    expect(globalMutate).toHaveBeenCalledWith(
      "/api/notifications?count=1",
      { newCount: 0 },
      { revalidate: false },
    )
  })
})

/**
 * The two TopNav bells sit next to each other as icon-only buttons, so the glyph
 * is the only thing telling them apart for a sighted user. They were both a
 * generic `Bell`, which is indistinguishable at a glance and read as one broken
 * control rather than two features.
 */
describe("the two TopNav bells are visually distinguishable", () => {
  it("does not reuse the announcement glyph", async () => {
    const { AnnouncementBell } = await import(
      "@/features/announcements/components/announcement-bell"
    )
    const bell = render(<NotificationBell />).container
    const announcement = render(<AnnouncementBell />).container

    const bellGlyph = bell.querySelector("svg")?.getAttribute("class")
    const announcementGlyph = announcement
      .querySelector("svg")
      ?.getAttribute("class")

    expect(bellGlyph).toBeTruthy()
    expect(announcementGlyph).toBeTruthy()
    expect(bellGlyph).not.toBe(announcementGlyph)
    // A generic bell is what collided; pin the intended glyphs so a future
    // "tidy the imports" pass cannot quietly reintroduce the clash.
    expect(bellGlyph).toContain("lucide-inbox")
    expect(announcementGlyph).toContain("lucide-megaphone")
  })

  it("gives both a native tooltip, since neither shows a text label", async () => {
    const { AnnouncementBell } = await import(
      "@/features/announcements/components/announcement-bell"
    )
    render(<NotificationBell />)
    render(<AnnouncementBell />)

    expect(screen.getByTestId("notification-bell")).toHaveAttribute(
      "title",
      "Notifications",
    )
    expect(screen.getByTestId("announcement-bell")).toHaveAttribute(
      "title",
      "Announcements",
    )
  })
})
