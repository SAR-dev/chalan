// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeUser, renderPage } from "@/app/__tests__/test-utils"

let mockIsLoading = true
let mockConfig: { refundOnCancel?: boolean } | null = null

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/features/platform-config/hooks/use-platform-config", () => ({
  usePlatformConfig: () => ({
    config: mockConfig,
    isLoading: mockIsLoading,
    updatePlatformConfig: vi.fn(async () => ({ ok: true })),
  }),
}))

// `/dashboard/settings` is super-admin only, and the mail-config hook keys its
// SWR request off `role === "SUPER_ADMIN"` (a null key means "no request"), so
// the mock has to be that role — `makeUser()` defaults to RIDER.
vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: makeUser({ role: "SUPER_ADMIN" }) }),
}))

beforeEach(() => {
  mockIsLoading = true
  mockConfig = null
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch
})

async function importPage() {
  const Page = (await import("./page")).default
  return Page
}

describe("DashboardSettingsPage loading", () => {
  it("keeps the page on screen while the config loads instead of blanking", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    // The regression this guards: the page used to `return null` until
    // `/api/platform-config` resolved, so a slow or failing request left the
    // whole route blank with no header and no explanation.
    expect(screen.getByText("Platform settings")).toBeInTheDocument()
    expect(screen.getByTestId("cancellation-policy-card")).toBeInTheDocument()
  })

  it("withholds the switch rather than showing a policy the server may not hold", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    // `refundOnCancel` is optimistically `true` before the fetch resolves, so
    // rendering it would display a policy that may not be the stored one.
    expect(
      screen.getByTestId("cancellation-policy-loading"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("refund-on-cancel-switch"),
    ).not.toBeInTheDocument()
  })

  it("disables saving until the value it would write has been read", async () => {
    const Page = await importPage()
    renderPage(<Page />)

    const save = screen.getByTestId("save-policy")
    expect(save).toBeDisabled()
  })

  it("swaps in the real switch once the config arrives", async () => {
    mockIsLoading = false
    mockConfig = { refundOnCancel: false }
    const Page = await importPage()
    renderPage(<Page />)

    const toggle = screen.getByTestId("refund-on-cancel-switch")
    expect(toggle).toBeInTheDocument()
    expect(
      screen.queryByTestId("cancellation-policy-loading"),
    ).not.toBeInTheDocument()
    // The value shown is the one that came back, not the optimistic default.
    expect(toggle).toHaveAttribute("aria-checked", "false")
    await waitFor(() => expect(screen.getByTestId("save-policy")).toBeEnabled())
  })

  it("saves after loading", async () => {
    mockIsLoading = false
    mockConfig = { refundOnCancel: true }
    const user = userEvent.setup()
    const Page = await importPage()
    renderPage(<Page />)

    const toggle = screen.getByTestId("refund-on-cancel-switch")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
    await user.click(screen.getByTestId("save-policy"))
    expect(toggle).toBeInTheDocument()
  })
})

const EXISTING_MAIL_CONFIGS = [
  {
    id: "mc_1",
    label: "Primary SMTP",
    host: "smtp.example.com",
    port: "587",
    secure: true,
    user: "mailer",
    pass: "secret",
    fromEmail: "no-reply@example.com",
    fromName: "Example",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "mc_2",
    label: "Backup SMTP",
    host: "smtp2.example.com",
    port: "2525",
    secure: false,
    user: "mailer2",
    pass: "secret2",
    fromEmail: "bounce@example.com",
    fromName: "Example Backup",
    isActive: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
]

/** Mail-config responses, in the order the page will request them. */
let mailResponses: unknown[][] = []

function stubMailConfigs() {
  mailResponses = [EXISTING_MAIL_CONFIGS]
  globalThis.fetch = vi.fn(async () => {
    const body = mailResponses.shift() ?? []
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch
}

/**
 * Per-test SWR cache, reset in `beforeEach`.
 *
 * SWR's default cache is module-level, so it outlives `cleanup()` and leaks
 * between tests: a request left in flight by one test is deduped into the next
 * (`dedupingInterval: 2000`), which silently starves the next render of data and
 * looks exactly like the blanking bug under test.
 *
 * The cache is created once per *test*, not once per render — deliberately. A
 * remount inside a single test must see the previous render's cache, because
 * surviving a remount is the behaviour under test. The provider only has to be
 * scoped to the test, not to each `render()` call.
 */
let swrCache = new Map()

function renderIsolated(ui: React.ReactElement) {
  return renderPage(
    <SWRConfig value={{ provider: () => swrCache, dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>,
  )
}

function row(id: string) {
  return screen.queryByTestId(`row-dashboard-mail-config-${id}`)
}

describe("Mail Configuration table refresh", () => {
  beforeEach(() => {
    mockIsLoading = false
    mockConfig = { refundOnCancel: true }
    stubMailConfigs()
    swrCache = new Map()
  })

  it("shows the loaded configs rather than a skeleton", async () => {
    const Page = await importPage()
    renderIsolated(<Page />)

    await waitFor(() => expect(row("mc_1")).toBeInTheDocument())
    expect(row("mc_2")).toBeInTheDocument()
  })

  // The actual regression, and the one the toolbar-refresh test cannot catch.
  //
  // The DataTable's overlay is driven by the toolbar's own `refreshing` flag, so
  // clicking refresh masked the bug. The table used to hold its configs in
  // `useState`, which is destroyed on every remount — a re-render that
  // re-creates the element, a router transition, a React remount after a
  // suspended boundary. On the next mount `loading` was true and the list was
  // `[]`, so the table showed skeleton rows for configs the server still had:
  // "data vanishes and shows skeleton". SWR's cache lives above the component,
  // so a remount reads the last response back synchronously and the rows never
  // leave. Reproduced here by unmounting and re-rendering the same tree.
  it("keeps the configs after a remount instead of falling back to skeletons", async () => {
    const Page = await importPage()
    const { unmount } = renderIsolated(<Page />)
    await waitFor(() => expect(row("mc_1")).toBeInTheDocument())
    unmount()

    // The re-mount request must be slow enough that the skeleton state would be
    // observable, so a state-based list is caught rather than masked by a
    // response that lands instantly.
    globalThis.fetch = vi.fn(
      async () =>
        new Promise<Response>(() => {
          /* never settles */
        }),
    ) as unknown as typeof fetch

    renderIsolated(<Page />)

    // Cached: present on the very first commit, with no request needed.
    expect(row("mc_1")).toBeInTheDocument()
    expect(row("mc_2")).toBeInTheDocument()
    expect(
      screen.queryByTestId("table-refreshing-dashboard-mail-config"),
    ).not.toBeInTheDocument()
  })

  it("keeps the existing rows on screen while a refresh is in flight", async () => {
    const Page = await importPage()
    renderIsolated(<Page />)
    await waitFor(() => expect(row("mc_1")).toBeInTheDocument())

    // The refetch never settles, so the in-flight state stays observable. A
    // table that blanks here shows skeletons, which reads as "the configs were
    // deleted" rather than "a refresh is running".
    globalThis.fetch = vi.fn(
      async () =>
        new Promise<Response>(() => {
          /* never settles */
        }),
    ) as unknown as typeof fetch

    await userEvent.click(
      screen.getByTestId("table-refresh-dashboard-mail-config"),
    )

    await waitFor(() =>
      expect(
        screen.getByTestId("table-refreshing-dashboard-mail-config"),
      ).toBeInTheDocument(),
    )
    // The regression: rows vanish and skeletons appear mid-refresh. They must
    // stay put behind the overlay instead.
    expect(row("mc_1")).toBeInTheDocument()
    expect(row("mc_2")).toBeInTheDocument()
  })
})
