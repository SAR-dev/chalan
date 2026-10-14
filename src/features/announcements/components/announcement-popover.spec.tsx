// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The popover is a reading surface: full markdown, no truncation, and opening
 * it stamps the watermark the way visiting the feed does — you have just been
 * shown everything that was new. These three are the product decisions; the
 * rest of the panel is layout.
 */

const LONG_BODY =
  "Dispatch has approved the revised rider incentive schedule effective " +
  "from the first of next month. Every pickup inside the metro zone now " +
  "earns an additional flat bonus on top of the per-parcel rate."

const swrState = vi.hoisted(() => ({
  data: undefined as unknown,
}))

vi.mock("swr", () => ({
  default: (key: unknown) => ({
    data: key === "/api/announcements/active" ? swrState.data : undefined,
    isLoading: false,
    error: undefined,
    // Mirrors the real hook's optimistic update: the bound mutate applies its
    // updater to the cache, which is what flips `isNew` to false on stamp.
    mutate: vi.fn(async (updater?: unknown) => {
      if (typeof updater === "function") {
        swrState.data = (updater as (d?: unknown) => unknown)(swrState.data)
      }
      return swrState.data
    }),
  }),
}))

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: { id: "usr-1", role: "SUPER_ADMIN" } }),
}))

import { AnnouncementPopover } from "@/features/announcements/components/announcement-popover"

function row(id: string, isNew: boolean) {
  return {
    id,
    title: `Announcement ${id}`,
    content: isNew ? LONG_BODY : `Already-seen body for ${id}.`,
    publishedAt: "2026-10-01T10:00:00.000Z",
    expiresAt: null,
    isActive: true,
    targetRoles: ["SUPER_ADMIN"],
    createdBy: "usr-1",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    isNew,
  }
}

function renderPopover() {
  return render(
    <AnnouncementPopover
      trigger={<button type="button">Open announcements</button>}
    />,
  )
}

const seenPosts = () =>
  (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
    (call) => call[0] === "/api/announcements/seen",
  )

beforeEach(() => {
  vi.clearAllMocks()
  swrState.data = undefined
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ),
  )
})

describe("AnnouncementPopover", () => {
  it("splits the board into New and Earlier on open", async () => {
    swrState.data = [row("a1", true), row("a2", false)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() =>
      expect(screen.getByTestId("announcement-popover")).toBeInTheDocument(),
    )

    expect(
      screen.getByTestId("announcement-popover-section-new"),
    ).toHaveTextContent("New (1)")
    expect(
      screen.getByTestId("announcement-popover-section-earlier"),
    ).toHaveTextContent("Earlier")
    expect(screen.getByTestId("announcement-popover-item-a1")).toBeVisible()
    expect(screen.getByTestId("announcement-popover-item-a2")).toBeVisible()
    expect(
      screen.getByTestId("announcement-popover-unread-count"),
    ).toHaveTextContent("1 new")
  })

  it("renders the full title and body with no truncation", async () => {
    swrState.data = [row("a1", true)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    const item = await screen.findByTestId("announcement-popover-item-a1")

    // The whole sentence is in the panel — not a one-line excerpt of it.
    expect(item).toHaveTextContent("Announcement a1")
    expect(item).toHaveTextContent(LONG_BODY)
    // And nothing in the item is a truncating cell: the popover folds by
    // scrolling, never by cutting a line short.
    expect(item.querySelector(".truncate, [class*='line-clamp']")).toBeNull()
  })

  it("stamps the watermark on open when something is new", async () => {
    swrState.data = [row("a1", true)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() => expect(seenPosts()).toHaveLength(1))
    // Reading the panel is reading the board: the badge drains with it.
    expect(screen.getByTestId("announcement-popover-new-a1")).toBeVisible()
  })

  it("keeps the NEW pill after the stamp drains the count", async () => {
    swrState.data = [row("a1", true)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() => expect(seenPosts()).toHaveLength(1))
    // The optimistic flip lands before we interrogate the second open —
    // otherwise a slow stub could let a redundant stamp through and the
    // "one write" assertion would be a race, not a behavior.
    await waitFor(() =>
      expect((swrState.data as Array<{ isNew: boolean }>)[0].isNew).toBe(false),
    )

    // Close, then reopen: the row is no longer live-new — but the pinned
    // snapshot keeps its pill for this visit, and a second stamp finds
    // nothing to write.
    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() =>
      expect(screen.queryByTestId("announcement-popover")).toBeNull(),
    )
    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() =>
      expect(screen.getByTestId("announcement-popover")).toBeInTheDocument(),
    )
    expect(screen.getByTestId("announcement-popover-new-a1")).toBeVisible()
    expect(seenPosts()).toHaveLength(1)
  })

  it("issues no write when nothing is new", async () => {
    swrState.data = [row("a1", false)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    await waitFor(() =>
      expect(screen.getByTestId("announcement-popover")).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId("announcement-popover-section-earlier"),
    ).toBeVisible()
    expect(screen.queryByTestId("announcement-popover-section-new")).toBeNull()
    expect(seenPosts()).toHaveLength(0)
  })

  it("shows an empty state when the board has nothing live", async () => {
    swrState.data = []
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    expect(
      await screen.findByTestId("announcement-popover-empty"),
    ).toBeVisible()
    expect(seenPosts()).toHaveLength(0)
  })

  it("closes when a title is followed", async () => {
    swrState.data = [row("a1", false)]
    renderPopover()

    await userEvent.click(screen.getByText("Open announcements"))
    const link = await screen.findByTestId("announcement-popover-open-a1")
    await userEvent.click(link)

    // next/link navigates client-side; what this pins is the panel going
    // away rather than floating over the destination.
    await waitFor(() =>
      expect(screen.queryByTestId("announcement-popover")).toBeNull(),
    )
  })
})
