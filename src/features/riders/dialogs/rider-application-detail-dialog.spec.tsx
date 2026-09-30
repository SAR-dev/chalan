// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/app/__tests__/test-utils"
import type { RiderApplication } from "@/features/riders/hooks/use-rider-applications"
import { RiderApplicationDetailDialog } from "./rider-application-detail-dialog"

const fetchMock = vi.fn()

vi.mock("@/features/riders/hooks/use-rider-applications", () => ({
  useRiderApplications: () => ({ refresh: vi.fn() }),
}))

beforeEach(() => {
  fetchMock.mockReset()
  // The dialog fetches the warehouse list on mount and the approve PATCH on
  // confirm — one stub has to answer both, and with the right shape: the
  // warehouse call is fed straight into `warehouses.find()`.
  fetchMock.mockImplementation(async (url: string) => {
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    if (String(url).includes("/warehouses")) return json([])
    return json({ ok: true })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

/** The approve PATCH, as opposed to the warehouse fetch the dialog makes. */
function approveCall(): { url: string; body: Record<string, unknown> } {
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).includes("/approve"),
  )
  if (!call) throw new Error("no approve request was made")
  const [, init] = call as [string, RequestInit]
  return { url: String(call[0]), body: JSON.parse(String(init.body)) }
}

function application(
  overrides: Partial<RiderApplication> = {},
): RiderApplication {
  return {
    id: "RID-100009E",
    name: "Test Rider",
    email: "rider@test.com",
    phone: "01700000000",
    zone: "Dhaka",
    address: "1 Road",
    nidNumber: "1234567890",
    status: "PENDING",
    isActive: false,
    taskType: "DELIVERY",
    warehouseId: "WH-1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
    vehicleType: null,
    vehiclePlate: null,
    ...overrides,
  } as unknown as RiderApplication
}

async function openApprove(
  app: ReturnType<typeof application>,
  user = userEvent.setup(),
) {
  renderPage(
    <RiderApplicationDetailDialog
      application={app}
      open
      onOpenChange={() => {}}
      onApproved={() => {}}
      onRejected={() => {}}
    />,
  )
  await user.click(screen.getByRole("button", { name: "Approve" }))
  return user
}

/**
 * The approval form must review what the applicant submitted, not ask the
 * approver to re-enter it. Two things used to be wrong and are guarded here:
 * the fields opened empty, and approving then wrote `null` over whatever the
 * applicant had sent — so approval destroyed the very data it reviewed.
 */
describe("rider approval — submitted vehicle", () => {
  it("shows the vehicle the applicant submitted, not an empty field", async () => {
    await openApprove(
      application({ vehicleType: "BIKE", vehiclePlate: "DHAKA11111" }),
    )

    expect(screen.getByTestId("approve-vehicle-type")).toBeInTheDocument()
    // Scoped to the trigger: the full option list is rendered too, so a bare
    // getByText would match both the selected value and its own list item.
    expect(screen.getByTestId("approve-vehicle-type")).toHaveTextContent(
      "Motorbike",
    )
    const plate = screen.getByTestId("approve-vehicle-plate")
    expect(plate).toHaveValue("DHAKA11111")
  })

  it("says the value came from the applicant, so review is explicit", async () => {
    await openApprove(
      application({ vehicleType: "VAN", vehiclePlate: "DHAKA22222" }),
    )
    expect(screen.getByTestId("approve-vehicle-submitted")).toBeInTheDocument()
    expect(
      screen.queryByTestId("approve-vehicle-unstated"),
    ).not.toBeInTheDocument()
  })

  it("asks the approver to supply one when the applicant stated nothing", async () => {
    await openApprove(application({ vehicleType: null, vehiclePlate: null }))
    expect(screen.getByTestId("approve-vehicle-unstated")).toBeInTheDocument()
    expect(
      screen.queryByTestId("approve-vehicle-submitted"),
    ).not.toBeInTheDocument()
  })

  it("preserves the submitted vehicle when approving", async () => {
    const user = await openApprove(
      application({ vehicleType: "BIKE", vehiclePlate: "DHAKA11111" }),
      userEvent.setup(),
    )

    await user.click(screen.getByRole("button", { name: "Confirm Approval" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const { body } = approveCall()

    // The regression this whole item exists for: the submitted value must
    // survive approval, not be overwritten by a field that opened empty.
    expect(body.vehicleType).toBe("BIKE")
    expect(body.vehiclePlate).toBe("DHAKA11111")
  })

  it("does not ask for a plate on a vehicle that has none", async () => {
    await openApprove(
      application({ vehicleType: "BICYCLE", vehiclePlate: null }),
    )
    expect(screen.getByTestId("approve-vehicle-type")).toHaveTextContent(
      "Bicycle",
    )
    // A bicycle has no registration number; prompting for one would invent a
    // requirement the applicant was never given.
    expect(
      screen.queryByTestId("approve-vehicle-plate"),
    ).not.toBeInTheDocument()
  })

  it("asks for a plate when the vehicle type requires one", async () => {
    await openApprove(application({ vehicleType: "CAR", vehiclePlate: null }))
    expect(screen.getByTestId("approve-vehicle-plate")).toBeInTheDocument()
  })
})
