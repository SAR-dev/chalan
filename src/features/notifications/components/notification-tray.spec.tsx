// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The tray is a Sheet whose `open` state is local React state. A `next/link`
 * navigation is client-side, so the browser never reloads and nothing tells that
 * state to change — every link in the tray used to navigate *and leave the panel
 * open on top of the destination*.
 *
 * RightNav's links already close on click; these did not, which is why the same
 * panel was correct in one place and broken in the other.
 */

const ROW = {
  id: "n1",
  event: "order.delivered",
  orderId: "ORD-1",
  merchantId: "MER-1",
  actorName: "RIDER-014",
  title: "Order delivered",
  href: "/merchant/orders/ORD-1",
  createdAt: new Date().toISOString(),
}

vi.mock("swr", () => ({
  default: (key: unknown) => ({
    data:
      key === "/api/notifications?limit=50"
        ? { notifications: [ROW], newCount: 1 }
        : { newCount: 1 },
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: { id: "usr-1", role: "MERCHANT" } }),
}))

import { NotificationTray } from "@/features/notifications/components/notification-tray"

function renderTray() {
  return render(
    <NotificationTray
      trigger={
        <button type="button" data-testid="tray-trigger">
          Open
        </button>
      }
    />,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ),
  )
})

/** The panel is unmounted when closed, so its absence is the assertion. */
const trayVisible = () => screen.queryByTestId("notification-tray") !== null

/**
 * The first row's link.
 *
 * The testid carries the group key, so it can only be matched by prefix. The
 * *link* is the thing to click, not the `<li>` — the click handler lives on it.
 */
async function firstRowLink(): Promise<HTMLElement> {
  return waitFor(() => {
    const link = document.querySelector<HTMLElement>(
      "[data-notification-row-link]",
    )
    if (!link) throw new Error("no notification row rendered yet")
    return link
  })
}

describe("NotificationTray", () => {
  it("closes when a notification is followed", async () => {
    renderTray()
    await userEvent.click(screen.getByTestId("tray-trigger"))
    await waitFor(() => expect(trayVisible()).toBe(true))

    // The list is fetched on first open, so the row appears a beat later.
    const row = await firstRowLink()
    await userEvent.click(row)

    // The router navigates either way. What this pins is the panel going away —
    // before, it stayed open over the order page the row points at.
    await waitFor(() => expect(trayVisible()).toBe(false))
  })

  it("closes when View all is followed", async () => {
    renderTray()
    await userEvent.click(screen.getByTestId("tray-trigger"))
    await waitFor(() => expect(trayVisible()).toBe(true))

    await userEvent.click(await screen.findByTestId("notification-tray-all"))
    await waitFor(() => expect(trayVisible()).toBe(false))
  })

  it("still opens, and still lists the rows", async () => {
    // Guards the fix from closing the tray on render or on mount, which would
    // pass the two tests above while making the panel unusable.
    renderTray()
    await userEvent.click(screen.getByTestId("tray-trigger"))
    await waitFor(() => expect(trayVisible()).toBe(true))
    expect(await firstRowLink()).toBeInTheDocument()
    expect(trayVisible()).toBe(true)
  })
})
