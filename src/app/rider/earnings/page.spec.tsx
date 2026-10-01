// @vitest-environment jsdom

import { act, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { SWRConfig, useSWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage } from "@/app/__tests__/test-utils"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The hook keys its request off `currentUser.riderId`; `makeUser()` already
// defaults to a RIDER with `riderId: "rider_1"`, so the plain default works.
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: makeUser() }),
}))

const DETAIL = {
  cash: { cashOnHand: 7000, totalCollected: 9000, totalSubmitted: 2000 },
  transactions: [
    {
      id: "ORD-1-confirm",
      riderId: "rider_1",
      orderId: "ORD-1",
      type: "CONFIRMED",
      amount: 2000,
      createdAt: "2026-01-05T10:00:00.000Z",
      confirmedBy: "wh_admin",
      confirmedAt: "2026-01-05T10:00:00.000Z",
    },
    {
      id: "ORD-2-collect",
      riderId: "rider_1",
      orderId: "ORD-2",
      type: "COLLECTED",
      amount: 4000,
      createdAt: "2026-01-06T10:00:00.000Z",
      confirmedBy: null,
      confirmedAt: null,
    },
  ],
}

function stub(detail: unknown = DETAIL, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(detail), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch
}

function stubNeverSettles() {
  globalThis.fetch = vi.fn(
    async () =>
      new Promise<Response>(() => {
        /* never settles */
      }),
  ) as unknown as typeof fetch
}

/**
 * Per-test SWR cache, reset in `beforeEach`.
 *
 * SWR's default cache is module-level, so it outlives `cleanup()` and leaks
 * between tests: a request left in flight by one test is deduped into the next,
 * which silently starves the next render of data and looks exactly like the
 * blanking bug under test. Created once per *test*, not per render — a remount
 * inside a single test must see the previous render's cache, because surviving
 * a remount is the behaviour under test.
 */
let swrCache = new Map()

function renderIsolated(ui: React.ReactElement) {
  return renderPage(
    <SWRConfig
      value={{
        provider: () => swrCache,
        dedupingInterval: 0,
        shouldRetryOnError: false,
      }}
    >
      {ui}
    </SWRConfig>,
  )
}

async function importPage() {
  return (await import("./page")).default
}

/**
 * Revalidates the hook's key on an already-mounted tree — the case a remount
 * test cannot reach. Uses the provider's own `mutate` rather than SWR's browser
 * event wiring, which jsdom does not exercise.
 */
let revalidate: (() => void) | null = null

function RevalidateProbe() {
  const { mutate } = useSWRConfig()
  useEffect(() => {
    revalidate = () => void mutate("/api/riders/rider_1/cash")
    return () => {
      revalidate = null
    }
  }, [mutate])
  return null
}

beforeEach(() => {
  stub()
  swrCache = new Map()
  revalidate = null
})

describe("RiderEarningsPage", () => {
  it("shows the summary and activity rather than a spinner", async () => {
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-activity")).toBeInTheDocument(),
    )
    expect(screen.getByTestId("rider-earnings-cash-on-hand")).toHaveTextContent(
      "7,000",
    )
    expect(screen.getByTestId("rider-earnings-collected")).toHaveTextContent(
      "9,000",
    )
    expect(screen.getByTestId("rider-earnings-submitted")).toHaveTextContent(
      "2,000",
    )
    expect(
      screen.queryByTestId("rider-earnings-loading"),
    ).not.toBeInTheDocument()
  })

  // The regression. This page held its response in `useState` behind a local
  // `loading` flag and returned early on it, so every remount — a router
  // transition, a re-render that re-creates the element, a React remount after a
  // suspended boundary — replaced the header, the three cards, and the activity
  // list with a single spinner. SWR's cache sits above the component, so a
  // remount reads the last response back synchronously.
  it("keeps the view after a remount instead of blanking to a spinner", async () => {
    const Page = await importPage()
    const { unmount } = renderIsolated(<Page />)
    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-activity")).toBeInTheDocument(),
    )
    unmount()

    // The re-mount request never settles, so a state-based page would be caught
    // in its spinner state rather than masked by an instant response.
    stubNeverSettles()

    renderIsolated(<Page />)

    // Present on the very first commit, with no request needed.
    expect(screen.getByTestId("rider-earnings-page")).toBeInTheDocument()
    expect(screen.getByTestId("rider-earnings-cash-on-hand")).toHaveTextContent(
      "7,000",
    )
    expect(screen.getByTestId("rider-earnings-activity")).toBeInTheDocument()
    expect(
      screen.queryByTestId("rider-earnings-loading"),
    ).not.toBeInTheDocument()
  })

  it("keeps the summary on screen while a refresh is in flight", async () => {
    const Page = await importPage()
    renderIsolated(
      <>
        <RevalidateProbe />
        <Page />
      </>,
    )
    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-activity")).toBeInTheDocument(),
    )

    // Revalidation of an already-mounted tree. The old code's early return made
    // this unrepresentable: any refetch blanked the page first.
    stubNeverSettles()
    act(() => revalidate?.())

    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-activity")).toBeInTheDocument(),
    )
    expect(
      screen.getByTestId("rider-earnings-cash-on-hand"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("rider-earnings-loading"),
    ).not.toBeInTheDocument()
  })

  // The old code swallowed failures into `setLoading(false)` with `data` still
  // null, which did at least say so — but only after a blank remount.
  it("reports a failed load rather than spinning forever", async () => {
    stub({ error: "boom" }, 500)
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-error")).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId("rider-earnings-loading"),
    ).not.toBeInTheDocument()
  })

  it("says so plainly when there are no transactions yet", async () => {
    stub({
      cash: { cashOnHand: 0, totalCollected: 0, totalSubmitted: 0 },
      transactions: [],
    })
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() =>
      expect(screen.getByTestId("rider-earnings-empty")).toBeInTheDocument(),
    )
    expect(screen.queryByTestId("rider-earnings-error")).not.toBeInTheDocument()
  })
})
