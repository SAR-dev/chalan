// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import type { AutoAssignPlan } from "@/features/orders/hooks/use-order-auto-assign"
import { AutoAssignDialog } from "./auto-assign-dialog"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const bulkDispatch = vi.fn()

vi.mock("@/features/orders/hooks/use-orders", () => ({
  useOrders: () => ({ bulkDispatch }),
}))

function makePlan(overrides: Partial<AutoAssignPlan> = {}): AutoAssignPlan {
  return {
    assignments: [
      {
        orderId: "ORD-000001",
        riderId: "RID-000001",
        riderName: "Rafi",
        reason: "Fewest active parcels (0).",
      },
      {
        orderId: "ORD-000002",
        riderId: "RID-000002",
        riderName: "Sadia",
        reason: "Fewest active parcels (0).",
      },
    ],
    unassigned: [],
    riderLoads: [
      { riderId: "RID-000001", riderName: "Rafi", active: 2, assigned: 1 },
      { riderId: "RID-000002", riderName: "Sadia", active: 0, assigned: 1 },
    ],
    eligibleRiderCount: 2,
    ...overrides,
  }
}

/** Stubs the plan endpoint. The hook under test is the real one. */
function stubPlan(plan: AutoAssignPlan) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(plan), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function stubPlanFailure(message: string, status = 400) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderDialog(ids = ["ORD-000001", "ORD-000002"]) {
  return renderPage(
    <AutoAssignDialog
      ids={ids}
      open
      onOpenChange={() => {}}
      onComplete={() => {}}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  bulkDispatch.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AutoAssignDialog", () => {
  it("asks the server for a plan as soon as it opens", async () => {
    const fetchMock = stubPlan(makePlan())
    renderDialog()

    // The plan needs the whole roster's committed load, which a paged order
    // list cannot supply — so it is never computed on the client.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe("/api/orders/auto-assign")
    expect(JSON.parse(String(init.body))).toEqual({
      ids: ["ORD-000001", "ORD-000002"],
    })
  })

  it("rebuilds the plan each time it opens rather than reusing a cached one", async () => {
    const fetchMock = stubPlan(makePlan())
    const { rerender } = renderPage(
      <AutoAssignDialog
        ids={["ORD-000001"]}
        open={false}
        onOpenChange={() => {}}
        onComplete={() => {}}
      />,
    )

    expect(fetchMock).not.toHaveBeenCalled()

    rerender(
      <AutoAssignDialog
        ids={["ORD-000001"]}
        open
        onOpenChange={() => {}}
        onComplete={() => {}}
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it("shows one block per rider with the parcels and the reason", async () => {
    stubPlan(makePlan())
    renderDialog()

    await screen.findByText("Rafi")
    // Blocks are keyed on rider id, not name: two riders can share a name, and
    // a spec that cannot tell them apart cannot tell a split apart either.
    expect(
      screen.getByTestId("auto-assign-rider-RID-000001"),
    ).toHaveTextContent("Rafi")
    expect(
      screen.getByTestId("auto-assign-rider-RID-000002"),
    ).toHaveTextContent("Sadia")
    expect(screen.getByText("ORD-000001")).toBeInTheDocument()
    expect(screen.getByText("ORD-000002")).toBeInTheDocument()
    expect(screen.getAllByText("Fewest active parcels (0).")).toHaveLength(2)
  })

  it("shows the load each rider is carrying and will be carrying", async () => {
    stubPlan(makePlan())
    renderDialog()

    // The whole point of the suggestion is the before/after load, so it has to
    // be on screen rather than only in the payload.
    await screen.findByText("2 already in hand → 3 after this dispatch.")
    expect(
      screen.getByText("0 already in hand → 1 after this dispatch."),
    ).toBeInTheDocument()
  })

  it("lists parcels the plan refused, with the reason", async () => {
    stubPlan(
      makePlan({
        assignments: [],
        unassigned: [
          { orderId: "ORD-000009", reason: "Held at a different warehouse." },
        ],
        riderLoads: [],
      }),
    )
    renderDialog()

    expect(
      await screen.findByTestId("auto-assign-unassigned"),
    ).toHaveTextContent("ORD-000009 — Held at a different warehouse.")
  })

  it("disables the confirm button when nothing could be assigned", async () => {
    stubPlan(makePlan({ assignments: [] }))
    renderDialog()

    await screen.findByTestId("auto-assign-empty")
    expect(screen.getByTestId("auto-assign-confirm")).toBeDisabled()
  })

  it("surfaces a failed plan instead of showing an empty plan", async () => {
    stubPlanFailure("Could not build a dispatch plan.")
    renderDialog()

    expect(await screen.findByTestId("auto-assign-error")).toHaveTextContent(
      "Could not build a dispatch plan.",
    )
  })

  it("dispatches one bulk call per rider on confirm", async () => {
    // The bulk endpoint takes a single rider id, so applying a plan means one
    // call per rider — and it goes through the ordinary dispatch endpoint, so
    // the state machine still has the last word.
    stubPlan(makePlan())
    renderDialog()

    const confirm = await screen.findByTestId("auto-assign-confirm")
    await userEvent.click(confirm)

    await waitFor(() => expect(bulkDispatch).toHaveBeenCalledTimes(2))
    expect(bulkDispatch).toHaveBeenNthCalledWith(
      1,
      ["ORD-000001"],
      "RID-000001",
    )
    expect(bulkDispatch).toHaveBeenNthCalledWith(
      2,
      ["ORD-000002"],
      "RID-000002",
    )
    expect(toast.success).toHaveBeenCalledWith("2 of 2 dispatched.")
  })

  it("reports a partial dispatch as partial rather than as a total failure", async () => {
    bulkDispatch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "Rider status changed." })
    stubPlan(makePlan())
    renderDialog()

    await userEvent.click(await screen.findByTestId("auto-assign-confirm"))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "1 left behind: Rider status changed.",
      ),
    )
    // "Dispatch failed" for a batch that mostly went out would send a
    // dispatcher hunting a problem that is already half-solved.
    expect(toast.success).toHaveBeenCalledWith("1 of 2 dispatched.")
  })
})
