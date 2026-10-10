// @vitest-environment jsdom

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { countMutate, listMutate } = vi.hoisted(() => ({
  countMutate: vi.fn(),
  listMutate: vi.fn(),
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
}))

let currentRole = "MERCHANT"
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: { id: "usr-1", role: currentRole } }),
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
})
