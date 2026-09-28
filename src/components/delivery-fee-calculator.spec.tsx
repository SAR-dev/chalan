// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeliveryFeeCalculator } from "@/components/delivery-fee-calculator"

const defaultPricing = {
  baseRate: 60,
  extraRatePerKg: 10,
  freeWeightKg: 1,
  maxWeightKg: 10,
  codFeePercentage: 1,
  cancellationFee: 20,
}

const dhaka = { id: "c_dhaka", name: "Dhaka", zoneId: "z_dhaka" }
const chattogram = { id: "c_chat", name: "Chattogram", zoneId: "z_chat" }
const faridpur = { id: "c_faridpur", name: "Faridpur", zoneId: "z_faridpur" }

const dhakaChattogramRow = {
  id: "zp_1",
  fromZoneId: "z_dhaka",
  toZoneId: "z_chat",
  baseRate: 80,
  extraRatePerKg: 12,
  freeWeightKg: 1,
  maxWeightKg: 10,
  codFeePercentage: 2,
  cancellationFee: 25,
}

function mockFetch(
  cityData: (typeof dhaka)[],
  pricingData: (typeof dhakaChattogramRow)[],
) {
  return vi.fn(async (input: string | URL | Request) => ({
    ok: true,
    json: async () =>
      String(input).includes("delivery-cities") ? cityData : pricingData,
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DeliveryFeeCalculator", () => {
  it("uses the real zone rate card when the route has one", async () => {
    vi.stubGlobal("fetch", mockFetch([dhaka, chattogram], [dhakaChattogramRow]))
    render(<DeliveryFeeCalculator defaultPricing={defaultPricing} />)

    await waitFor(() => {
      expect(screen.getAllByText("Zone-based rates").length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText("80 TK").length).toBeGreaterThan(0)
    expect(screen.getByText("COD fee (2%)")).toBeInTheDocument()
    expect(screen.getByText("Cancellation fee")).toBeInTheDocument()
  })

  it("renders an instant estimate from defaults while rates load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch,
    )
    render(<DeliveryFeeCalculator defaultPricing={defaultPricing} />)

    expect(screen.getByText(/Free up to 1 KG/)).toBeInTheDocument()
    expect(screen.getAllByText("60 TK").length).toBeGreaterThan(0)
  })

  it("falls back to default rates when the route has no zone row", async () => {
    vi.stubGlobal("fetch", mockFetch([dhaka, faridpur], []))
    render(<DeliveryFeeCalculator defaultPricing={defaultPricing} />)

    await waitFor(() => {
      expect(
        screen.getByText(/No zone pricing configured for Dhaka → Faridpur/),
      ).toBeInTheDocument()
    })
    expect(screen.getAllByText("60 TK").length).toBeGreaterThan(0)
  })
})
