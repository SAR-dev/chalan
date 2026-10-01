// @vitest-environment jsdom

import { act, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { SWRConfig, useSWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage } from "@/app/__tests__/test-utils"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The hook keys its request off the role and this route is warehouse-scoped, so
// the mock has to be that role — `makeUser()` defaults to RIDER, and the route
// rejects RIDER outright.
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: makeUser({ role: "WAREHOUSE_ADMIN" }) }),
}))

const CASH = [
  {
    riderId: "r_1",
    riderName: "Rider One",
    cashOnHand: 7000,
    totalCollected: 9000,
    totalSubmitted: 2000,
  },
  {
    riderId: "r_2",
    riderName: "Rider Two",
    cashOnHand: 0,
    totalCollected: 4000,
    totalSubmitted: 4000,
  },
]

function stubCash(body: unknown = CASH, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch
}

/** A request that never settles, so the in-flight state stays observable. */
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
 * between tests: a request left in flight by one test is deduped into the next
 * (`dedupingInterval: 2000`), which silently starves the next render of data and
 * looks exactly like the blanking bug under test.
 *
 * Created once per *test*, not once per render — deliberately. A remount inside
 * a single test must see the previous render's cache, because surviving a
 * remount is the behaviour under test.
 */
let swrCache = new Map()

function renderIsolated(ui: React.ReactElement) {
  return renderPage(
    <SWRConfig
      value={{
        provider: () => swrCache,
        dedupingInterval: 0,
        // The default retry loop would keep the failure test alive long after it
        // had asserted what it needed to.
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
 * A handle to revalidate the hook's key on an already-mounted tree — the case a
 * remount test cannot reach. Uses the provider's own `mutate` rather than SWR's
 * browser-event wiring, which jsdom does not exercise.
 */
let revalidate: (() => void) | null = null

function RevalidateProbe() {
  const { mutate } = useSWRConfig()
  useEffect(() => {
    revalidate = () => void mutate("/api/riders/cash")
    return () => {
      revalidate = null
    }
  }, [mutate])
  return null
}

function row(id: string) {
  return screen.queryByTestId(`rider-cash-row-${id}`)
}

beforeEach(() => {
  stubCash()
  swrCache = new Map()
  revalidate = null
})

describe("WarehouseRiderCashPage", () => {
  it("shows the loaded holdings rather than a spinner", async () => {
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() => expect(row("r_1")).toBeInTheDocument())
    expect(row("r_2")).toBeInTheDocument()
    expect(screen.queryByTestId("rider-cash-loading")).not.toBeInTheDocument()
  })

  // The regression this page had. It held the holdings in `useState` behind a
  // local `loading` flag and gated the entire table on it, so any remount — a
  // router transition, a re-render that re-creates the element, React remounting
  // after a suspended boundary — reset the list to `[]` with `loading` true and
  // replaced rows the server still had with a full-page spinner. SWR's cache
  // sits above the component, so a remount reads the last response back
  // synchronously and the rows never leave.
  it("keeps the rows after a remount instead of blanking to a spinner", async () => {
    const Page = await importPage()
    const { unmount } = renderIsolated(<Page />)
    await waitFor(() => expect(row("r_1")).toBeInTheDocument())
    unmount()

    // The re-mount request never settles, so a state-based list would be caught
    // in its skeleton state rather than masked by a response that lands instantly.
    stubNeverSettles()

    renderIsolated(<Page />)

    // Cached: present on the very first commit, with no request needed.
    expect(row("r_1")).toBeInTheDocument()
    expect(row("r_2")).toBeInTheDocument()
    expect(screen.queryByTestId("rider-cash-loading")).not.toBeInTheDocument()

    // The revalidation the remount kicked off is disclosed rather than hidden,
    // so a slow refresh does not look like a frozen page.
    await waitFor(() =>
      expect(screen.getByTestId("rider-cash-refreshing")).toBeInTheDocument(),
    )
    expect(row("r_1")).toBeInTheDocument()
  })

  it("keeps the rows on screen while a refresh is in flight", async () => {
    const Page = await importPage()
    renderIsolated(
      <>
        <RevalidateProbe />
        <Page />
      </>,
    )
    await waitFor(() => expect(row("r_1")).toBeInTheDocument())

    // The refetch never settles, so the in-flight state stays observable. A page
    // that blanks here shows a spinner for data it still holds, which reads as
    // "the riders' cash records were deleted" rather than "a refresh is running".
    stubNeverSettles()
    act(() => revalidate?.())

    await waitFor(() =>
      expect(screen.getByTestId("rider-cash-refreshing")).toBeInTheDocument(),
    )
    expect(row("r_1")).toBeInTheDocument()
    expect(row("r_2")).toBeInTheDocument()
    expect(screen.queryByTestId("rider-cash-loading")).not.toBeInTheDocument()
  })

  // The old code swallowed failures into `setCashData([])`, which rendered
  // "No rider cash data available" for a server error — indistinguishable from a
  // warehouse that genuinely has no riders holding cash.
  it("reports a failed load instead of claiming there is no cash data", async () => {
    stubCash({ error: "boom" }, 500)
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() =>
      expect(screen.getByTestId("rider-cash-error")).toBeInTheDocument(),
    )
    expect(screen.queryByTestId("rider-cash-empty")).not.toBeInTheDocument()
  })

  it("says so plainly when there are genuinely no holdings", async () => {
    stubCash([])
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() =>
      expect(screen.getByTestId("rider-cash-empty")).toBeInTheDocument(),
    )
    expect(screen.queryByTestId("rider-cash-error")).not.toBeInTheDocument()
  })

  it("sums the totals across riders", async () => {
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() => expect(row("r_1")).toBeInTheDocument())
    expect(screen.getByTestId("rider-cash-total-on-hand")).toHaveTextContent(
      "7,000",
    )
    expect(screen.getByTestId("rider-cash-total-collected")).toHaveTextContent(
      "13,000",
    )
    expect(screen.getByTestId("rider-cash-total-submitted")).toHaveTextContent(
      "6,000",
    )
  })
})
