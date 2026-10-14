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
    expect(
      screen.getByRole("link", { name: "Notifications, 2 unread" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Notifications, 2 unread" }),
    ).toBeInTheDocument()
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
    expect(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument()
  })

  it("marks a row read without re-fetching the whole list", async () => {
    // Read state is optimistic: the row is stamped locally so the badge clears
    // on the same tick the POST lands, rather than lying for a round trip.
    const { useNotifications } = await import(
      "@/features/notifications/hooks/use-notifications"
    )
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      const res = await result.current.markRead(["n1"])
      expect(res.ok).toBe(true)
    })

    expect(listMutate).not.toHaveBeenCalled()
  })

  it("refreshes the badge's own cache when marking read", async () => {
    // The badge reads a separate SWR key (`?count=1`). Leaving it alone would
    // show the bell still counting rows the tray has already marked read, which
    // is the "the badge is lying" moment the per-row model was meant to remove.
    const { useNotifications } = await import(
      "@/features/notifications/hooks/use-notifications"
    )
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await result.current.markRead(["n1"])
    })

    expect(globalMutate).toHaveBeenCalledWith(
      "/api/notifications?count=1",
      undefined,
      { revalidate: true },
    )
  })

  it("revalidates both caches after archiving", async () => {
    // The row leaves a filtered list entirely, so hand-editing the cache would
    // be how the badge and the list drift apart.
    const { useNotifications } = await import(
      "@/features/notifications/hooks/use-notifications"
    )
    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      const res = await result.current.setArchived("n1", true)
      expect(res.ok).toBe(true)
    })

    // A predicate, not a literal key: archiving from the inbox also changes what
    // the tray would show, so every mounted notification key is revalidated.
    // Rewriting only this hook's own key left the other surface stale until its
    // own 30s tick.
    expect(globalMutate).toHaveBeenCalledWith(expect.any(Function), undefined, {
      revalidate: true,
    })
    const calls = globalMutate.mock.calls as unknown as Array<
      [(key: string) => boolean, unknown, unknown]
    >
    const predicate = calls.at(-1)?.[0]
    expect(typeof predicate).toBe("function")
    expect(predicate?.("/api/notifications?limit=50")).toBe(true)
    expect(predicate?.("/api/notifications?count=1")).toBe(true)
    expect(predicate?.("/api/orders")).toBe(false)
  })
})
