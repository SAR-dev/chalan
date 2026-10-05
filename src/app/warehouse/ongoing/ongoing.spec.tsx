// @vitest-environment jsdom

import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  makeOrder,
  makeRider,
  makeUser,
  makeWarehouse,
  renderPage,
  resetIds,
} from "@/app/__tests__/test-utils"

vi.mock("@/features/account/hooks/use-auth", () => ({
  useAuth: () => ({ currentUser: mockUser }),
}))
vi.mock("@/features/warehouses/hooks/use-warehouses", () => ({
  useWarehouses: () => ({
    currentWarehouse: mockWarehouse,
    warehouses: mockWarehouse ? [mockWarehouse] : [],
  }),
}))
vi.mock("@/features/riders/hooks/use-riders", () => ({
  useRiders: () => ({
    riders: mockRiders,
    currentRider: null,
    warehouseDeliveryRiders: mockRiders,
  }),
  canPickup: () => true,
  canDeliver: () => true,
}))
vi.mock("@/features/merchants/hooks/use-merchants", () => ({
  useMerchants: () => ({ merchants: [] }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}))

// Records the `ids` each opened AutoAssignDialog was handed, so a test can prove
// the plan covers the whole warehouse rather than whatever the filter left on
// screen. Stubbed rather than opened for real: the plan itself has its own
// coverage in the dialog's spec.
const { autoAssignCalls } = vi.hoisted(() => ({
  autoAssignCalls: [] as string[][],
}))
vi.mock("@/features/orders/dialogs/auto-assign-dialog", () => ({
  AutoAssignDialog: ({ ids, open }: { ids: string[]; open: boolean }) => {
    if (open) autoAssignCalls.push(ids)
    return open ? <div data-testid="auto-assign-dialog" /> : null
  },
}))

let mockUser: ReturnType<typeof makeUser> | null
let mockWarehouse: ReturnType<typeof makeWarehouse> | null
let mockRiders: ReturnType<typeof makeRider>[]
let mockRefresh: ReturnType<typeof vi.fn>

/**
 * The whole city list, as `page.tsx` supplies it — deliberately including a
 * city that no board parcel is in, so a test can tell "the dropdown lists every
 * city" apart from "the dropdown lists the cities that happen to be loaded".
 */
const CITIES = [
  { id: "dc_1", name: "Dhaka" },
  { id: "dc_2", name: "Chattogram" },
  { id: "dc_3", name: "Sylhet" },
]

beforeEach(() => {
  resetIds()
  mockUser = makeUser({ role: "WAREHOUSE_ADMIN", warehouseId: "wh_1" })
  mockWarehouse = makeWarehouse()
  mockRiders = [
    makeRider({ id: "rider_1", name: "Rakib" }),
    makeRider({ id: "rider_2", name: "Sadia" }),
  ]
  mockRefresh = vi.fn()
  autoAssignCalls.length = 0
})

async function importPage(
  orders: ReturnType<typeof makeOrder>[],
  truncated = false,
  cities = CITIES,
) {
  const { WarehouseOngoingPageClient } = await import("./ongoing-client")
  renderPage(
    <WarehouseOngoingPageClient
      initialData={orders}
      truncated={truncated}
      cities={cities}
    />,
  )
}

describe("warehouse ongoing board", () => {
  it("shows one column per ongoing status, in order", async () => {
    await importPage([])
    const columns = screen
      .getAllByTestId(/^kanban-column-/)
      .map((el) => el.getAttribute("data-testid"))
    expect(columns).toEqual([
      "kanban-column-APPROVED",
      "kanban-column-OUT_FOR_PICKUP",
      "kanban-column-PICKED_UP",
      "kanban-column-IN_WAREHOUSE",
      "kanban-column-IN_TRANSIT",
      "kanban-column-OUT_FOR_DELIVERY",
    ])
  })

  it("places a parcel under its status column and shows its holder", async () => {
    const order = makeOrder({
      status: "PICKED_UP",
      pickupRiderId: "rider_1",
      recipientName: "Ayesha",
    })
    await importPage([order])
    const card = screen.getByTestId(`kanban-card-${order.id}`)
    expect(card).toBeInTheDocument()
    expect(screen.getByText("Ayesha")).toBeInTheDocument()
    expect(card).toHaveTextContent("Rakib")
    expect(screen.getByTestId("kanban-column-PICKED_UP")).toContainElement(card)
  })

  it("switches to rider columns, filing a parcel under its next-leg holder", async () => {
    const pickedUp = makeOrder({
      status: "PICKED_UP",
      pickupRiderId: "rider_1",
    })
    const inWarehouse = makeOrder({
      status: "IN_WAREHOUSE",
      deliveryRiderId: "rider_2",
    })
    await importPage([pickedUp, inWarehouse])

    await userEvent.click(screen.getByTestId("kanban-groupby-riders"))

    // Exactly one column each — a card in two columns would double-count the
    // board and let the same parcel be acted on from two places.
    expect(screen.getByTestId("kanban-column-rider_1")).toContainElement(
      screen.getByTestId(`kanban-card-${pickedUp.id}`),
    )
    expect(screen.getByTestId("kanban-column-rider_2")).toContainElement(
      screen.getByTestId(`kanban-card-${inWarehouse.id}`),
    )
    // Not in anyone else's column, and Unassigned is empty. `children` counts
    // the header and the body wrapper, so assert containment, not child count.
    expect(screen.getByTestId(`kanban-column-rider_1`)).not.toContainElement(
      screen.getByTestId(`kanban-card-${inWarehouse.id}`),
    )
    expect(screen.getByTestId(`kanban-column-rider_2`)).not.toContainElement(
      screen.getByTestId(`kanban-card-${pickedUp.id}`),
    )
    // Both parcels have a holder, so there is nothing to put in Unassigned and
    // the column is not rendered at all.
    expect(
      screen.queryByTestId(`kanban-column-UNASSIGNED`),
    ).not.toBeInTheDocument()
  })

  it("files a parcel with no rider under Unassigned, last", async () => {
    const order = makeOrder({ status: "IN_WAREHOUSE", deliveryRiderId: null })
    await importPage([
      order,
      makeOrder({ status: "IN_TRANSIT", deliveryRiderId: "rider_1" }),
    ])
    await userEvent.click(screen.getByTestId("kanban-groupby-riders"))
    const unassigned = screen.getByTestId(`kanban-column-UNASSIGNED`)
    expect(unassigned).toContainElement(
      screen.getByTestId(`kanban-card-${order.id}`),
    )
    const columns = screen.getAllByTestId(/^kanban-column-/)
    expect(columns[columns.length - 1]).toBe(unassigned)
  })

  it("offers Assign pickup only on an APPROVED parcel, and says who already has it", async () => {
    const unassigned = makeOrder({ status: "APPROVED", pickupRiderId: null })
    const assigned = makeOrder({ status: "APPROVED", pickupRiderId: "rider_1" })
    const pickedUp = makeOrder({
      status: "PICKED_UP",
      pickupRiderId: "rider_1",
    })
    await importPage([unassigned, assigned, pickedUp])

    const free = screen.getByTestId(`kanban-assign-pickup-${unassigned.id}`)
    expect(free).toBeEnabled()
    expect(free).toHaveTextContent("Assign pickup")

    // A covered parcel keeps the control but reports the coverage, instead of
    // losing it. Hiding the button left a card with no action at all, which
    // reads as the card failing to render its action rather than as
    // "nobody needs to assign this".
    const taken = screen.getByTestId(`kanban-assign-pickup-${assigned.id}`)
    expect(taken).toBeDisabled()
    expect(taken).toHaveTextContent("Pickup Assigned")

    // Past APPROVED the pickup has already happened rather than merely been
    // decided, so there is no action to report either way.
    expect(
      screen.queryByTestId(`kanban-assign-pickup-${pickedUp.id}`),
    ).not.toBeInTheDocument()
  })

  it("offers Receive only for PICKED_UP and Dispatch only for IN_WAREHOUSE", async () => {
    const pickedUp = makeOrder({ status: "PICKED_UP" })
    const inWarehouse = makeOrder({ status: "IN_WAREHOUSE" })
    const inTransit = makeOrder({ status: "IN_TRANSIT" })
    await importPage([pickedUp, inWarehouse, inTransit])

    expect(
      screen.getByTestId(`kanban-receive-${pickedUp.id}`),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(`kanban-dispatch-${inWarehouse.id}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(`kanban-dispatch-${inTransit.id}`),
    ).not.toBeInTheDocument()
  })

  it("never offers Cancel on a card", async () => {
    // Decision #9: cancel stays on the approval page and the admin portal. A
    // cancel button on a board would undo the PENDING-only approval split.
    await importPage([makeOrder({ status: "PICKED_UP" })])
    expect(screen.queryByText(/cancel/i)).not.toBeInTheDocument()
  })

  it("shows the auto-assign button only when a parcel is in the warehouse", async () => {
    await importPage([makeOrder({ status: "PICKED_UP" })])
    expect(screen.queryByTestId("bulk-auto-assign")).not.toBeInTheDocument()

    await importPage([
      makeOrder({ status: "PICKED_UP" }),
      makeOrder({ status: "IN_WAREHOUSE" }),
    ])
    expect(screen.getByTestId("bulk-auto-assign")).toBeInTheDocument()
  })

  it("opens the details drawer from the card code", async () => {
    const order = makeOrder({ status: "IN_TRANSIT" })
    await importPage([order])
    await userEvent.click(screen.getByTestId(`kanban-open-${order.id}`))
    expect(
      await screen.findByTestId("order-details-drawer"),
    ).toBeInTheDocument()
  })

  it("surfaces the truncation notice only when the page hit its cap", async () => {
    await importPage([makeOrder({ status: "IN_TRANSIT" })])
    expect(screen.queryByTestId("kanban-truncated")).not.toBeInTheDocument()

    await importPage([makeOrder({ status: "IN_TRANSIT" })], true)
    expect(screen.getByTestId("kanban-truncated")).toBeInTheDocument()
  })

  it("says so once when there are no parcels, alongside the empty columns", async () => {
    await importPage([])
    expect(screen.getByTestId("kanban-empty")).toHaveTextContent(
      /no ongoing parcels/i,
    )
    // The columns stay: "nothing is waiting to be received" is the answer the
    // warehouse admin came for, not five blank lanes.
    expect(screen.getAllByTestId(/^kanban-column-/)).toHaveLength(6)
  })
})

describe("ongoing board filters", () => {
  function boardCards() {
    return screen
      .queryAllByTestId(/^kanban-card-/)
      .map((el) => el.getAttribute("data-testid")?.replace("kanban-card-", ""))
  }

  /**
   * Open a Base UI Select and pick one option.
   *
   * The popup is portalled out of the trigger, so the option is found in the
   * document rather than inside the bar — addressed by testid, not by role,
   * because the option's *name* is data (a rider, a city) and the test already
   * knows exactly which one it wants.
   */
  async function pickOption(triggerId: string, optionId: string) {
    await userEvent.click(screen.getByTestId(triggerId))
    const option = await screen.findByTestId(optionId)
    expect(option).toHaveAttribute("role", "option")
    await userEvent.click(option)
  }

  it("lists every city in both city dropdowns, not just the loaded ones", async () => {
    // No parcel is in Sylhet, and it is still offered — an option list that
    // changes with the board would read as the board losing parcels.
    await importPage([makeOrder({ status: "IN_TRANSIT" })])
    for (const prefix of ["pickup-city", "delivery-city"]) {
      await userEvent.click(screen.getByTestId(`kanban-filter-${prefix}`))
      for (const city of CITIES) {
        expect(
          await screen.findByTestId(
            `kanban-filter-${prefix}-option-${city.id}`,
          ),
        ).toBeInTheDocument()
      }
      await userEvent.keyboard("{Escape}")
    }
  })

  it("lists the roster in both rider dropdowns", async () => {
    await importPage([makeOrder({ status: "IN_TRANSIT" })])
    for (const testId of [
      "kanban-filter-pickup-rider",
      "kanban-filter-delivery-rider",
    ]) {
      await userEvent.click(screen.getByTestId(testId))
      for (const rider of mockRiders) {
        expect(
          await screen.findByTestId(`${testId}-option-${rider.id}`),
        ).toHaveTextContent(rider.name)
      }
      await userEvent.keyboard("{Escape}")
    }
  })

  it("labels every field instead of leaving the boxes nameless", async () => {
    // A placeholder vanishes the moment you type — precisely when someone
    // coming back to the toolbar needs to know what they are still in.
    await importPage([makeOrder({ status: "IN_TRANSIT" })])
    const expected = [
      "Order ID",
      "Pickup Rider",
      "Delivery Rider",
      "Pickup city",
      "Delivery city",
    ]
    for (const text of expected) {
      const label = screen.getByText(text)
      expect(label).toHaveAttribute("for")
      // The label must actually point at a control that exists.
      expect(
        screen.getByTestId(label.getAttribute("for") ?? ""),
      ).toBeInTheDocument()
    }
  })

  it("shows the selection on the trigger, never the raw sentinel", async () => {
    // Base UI does not infer the label from the matching item — without a child
    // on `SelectValue` the trigger reads "any", which was a real (caught by e2e)
    // regression rather than a hypothetical.
    await importPage([makeOrder({ status: "IN_TRANSIT" })])
    for (const testId of [
      "kanban-filter-pickup-rider",
      "kanban-filter-delivery-rider",
    ]) {
      expect(screen.getByTestId(testId)).toHaveTextContent("All riders")
    }
    expect(screen.getByTestId("kanban-filter-pickup-city")).toHaveTextContent(
      "All cities",
    )
    expect(screen.getByTestId("kanban-filter-delivery-city")).toHaveTextContent(
      "All cities",
    )

    await pickOption(
      "kanban-filter-pickup-city",
      "kanban-filter-pickup-city-option-dc_2",
    )
    expect(screen.getByTestId("kanban-filter-pickup-city")).toHaveTextContent(
      "Chattogram",
    )

    // The accessible name is the *visible label* now, not an aria-label that
    // would shadow it. If the name tracked the value, a screen-reader user
    // would lose their place in the toolbar on every change.
    expect(screen.getByTestId("kanban-filter-pickup-city")).not.toHaveAttribute(
      "aria-label",
    )
    expect(screen.getByText("Pickup city")).toHaveAttribute(
      "for",
      "kanban-filter-pickup-city",
    )
  })

  it("narrows to one parcel by order id", async () => {
    const first = makeOrder({ status: "IN_TRANSIT" })
    const second = makeOrder({ status: "IN_TRANSIT" })
    await importPage([first, second])

    await userEvent.type(screen.getByTestId("kanban-filter-query"), first.id)

    expect(boardCards()).toEqual([first.id])
  })

  it("matches the order id case-insensitively and on any substring", async () => {
    const order = makeOrder({ id: "ORD-100001E", status: "IN_TRANSIT" })
    await importPage([
      order,
      makeOrder({ id: "ORD-999999E", status: "APPROVED" }),
    ])

    await userEvent.type(screen.getByTestId("kanban-filter-query"), "100001e")

    expect(boardCards()).toEqual(["ORD-100001E"])
  })

  it("narrows by pickup rider without dragging in the delivery rider", async () => {
    const beingCollected = makeOrder({
      status: "PICKED_UP",
      pickupRiderId: "rider_1",
    })
    // The other field, the other rider. Choosing Rakib as the *pickup* rider
    // must not surface this parcel just because Sadia is delivering it — the
    // whole point of two dropdowns is that these are different questions.
    const beingDelivered = makeOrder({
      status: "IN_TRANSIT",
      deliveryRiderId: "rider_2",
    })
    await importPage([beingCollected, beingDelivered])

    await pickOption(
      "kanban-filter-pickup-rider",
      "kanban-filter-pickup-rider-option-rider_1",
    )
    expect(boardCards()).toEqual([beingCollected.id])

    await userEvent.click(screen.getByTestId("kanban-filter-clear"))
    await pickOption(
      "kanban-filter-delivery-rider",
      "kanban-filter-delivery-rider-option-rider_2",
    )
    expect(boardCards()).toEqual([beingDelivered.id])
  })

  it("narrows by pickup city and by delivery city independently", async () => {
    const fromChattogram = makeOrder({
      status: "IN_TRANSIT",
      pickupCityId: "dc_2",
      deliveryCityId: "dc_1",
    })
    const toSylhet = makeOrder({
      status: "IN_TRANSIT",
      pickupCityId: "dc_1",
      deliveryCityId: "dc_3",
    })
    await importPage([fromChattogram, toSylhet])

    await pickOption(
      "kanban-filter-pickup-city",
      "kanban-filter-pickup-city-option-dc_2",
    )
    expect(boardCards()).toEqual([fromChattogram.id])

    await userEvent.click(screen.getByTestId("kanban-filter-clear"))
    await pickOption(
      "kanban-filter-delivery-city",
      "kanban-filter-delivery-city-option-dc_3",
    )
    expect(boardCards()).toEqual([toSylhet.id])
  })

  it("keeps the lane headers in step with what is shown", async () => {
    const inTransit = makeOrder({ status: "IN_TRANSIT" })
    const pickedUp = makeOrder({ status: "PICKED_UP" })
    await importPage([inTransit, pickedUp])
    expect(screen.getByTestId("kanban-count-IN_TRANSIT")).toHaveTextContent("1")

    await pickOption(
      "kanban-filter-pickup-city",
      "kanban-filter-pickup-city-option-dc_2",
    )
    // Nobody is going to Chattogram, so the lane empties rather than keeping a
    // count the board is no longer showing.
    expect(screen.getByTestId("kanban-count-IN_TRANSIT")).toHaveTextContent("0")
    expect(screen.getByTestId("kanban-count-PICKED_UP")).toHaveTextContent("0")
  })

  it("offers a way back when a filter hides every parcel", async () => {
    const order = makeOrder({ status: "IN_TRANSIT" })
    await importPage([order])
    expect(screen.queryByTestId("kanban-no-matches")).not.toBeInTheDocument()

    await userEvent.type(
      screen.getByTestId("kanban-filter-query"),
      "no-such-order",
    )

    expect(screen.getByTestId("kanban-no-matches")).toBeInTheDocument()
    // Columns stay — an empty lane is still the answer to "where is it?".
    expect(screen.getAllByTestId(/^kanban-column-/)).toHaveLength(6)
    expect(screen.queryByTestId("kanban-empty")).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId("kanban-filter-clear"))
    expect(screen.queryByTestId("kanban-no-matches")).not.toBeInTheDocument()
    expect(boardCards()).toEqual([order.id])
  })

  it("hides the filter bar when there is nothing to filter", async () => {
    await importPage([])
    // Offering filters for an empty board is clutter; there is no parcel to
    // narrow down and the empty message already says what is going on.
    expect(screen.queryByTestId("kanban-filter-query")).not.toBeInTheDocument()
  })

  it("plans auto-assign over the whole warehouse, not the filtered slice", async () => {
    // The plan reassigns riders across the hub. Narrowing the board to one
    // rider must not quietly narrow what the plan will touch, so the dialog is
    // stubbed to record the ids it was handed.
    const mine = makeOrder({
      id: "ORD-MINE",
      status: "IN_WAREHOUSE",
      deliveryRiderId: "rider_1",
    })
    const theirs = makeOrder({
      id: "ORD-THEIRS",
      status: "IN_WAREHOUSE",
      deliveryRiderId: "rider_2",
    })
    await importPage([mine, theirs])

    await pickOption(
      "kanban-filter-delivery-rider",
      "kanban-filter-delivery-rider-option-rider_1",
    )
    expect(boardCards()).toEqual(["ORD-MINE"])

    await userEvent.click(screen.getByTestId("bulk-auto-assign"))
    expect(autoAssignCalls.at(-1)).toEqual(["ORD-MINE", "ORD-THEIRS"])
  })
})
