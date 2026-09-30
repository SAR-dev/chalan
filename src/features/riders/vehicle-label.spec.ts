import { describe, expect, it } from "vitest"
import { hasRiderVehicle, riderVehicleLabel } from "./vehicle-label"

describe("riderVehicleLabel", () => {
  it("returns null when nothing has been declared", () => {
    // Not "" and not "On foot" — an admin scanning for who can take a van has
    // to be able to see the gap, and absence must not render as a real answer.
    expect(
      riderVehicleLabel({ vehicleType: null, vehiclePlate: null }),
    ).toBeNull()
  })

  it("joins the type label and plate", () => {
    expect(
      riderVehicleLabel({ vehicleType: "BIKE", vehiclePlate: "DHAKA-12-3456" }),
    ).toBe("Motorbike · DHAKA-12-3456")
  })

  it("renders a type with no plate as a complete answer", () => {
    // A bicycle or an on-foot rider genuinely has no registration number; an
    // empty string here would look like a rendering bug.
    expect(
      riderVehicleLabel({ vehicleType: "BICYCLE", vehiclePlate: null }),
    ).toBe("Bicycle")
  })

  it("renders a plate with no type rather than an empty string", () => {
    // Unclassified but real. Returning "" would make the column look blank and
    // indistinguishable from a field that failed to load.
    expect(
      riderVehicleLabel({ vehicleType: null, vehiclePlate: "DHAKA-99" }),
    ).toBe("DHAKA-99")
  })

  it("treats a whitespace-only plate as absent", () => {
    expect(riderVehicleLabel({ vehicleType: "CAR", vehiclePlate: "   " })).toBe(
      "Car",
    )
    expect(
      riderVehicleLabel({ vehicleType: null, vehiclePlate: "   " }),
    ).toBeNull()
  })
})

describe("hasRiderVehicle", () => {
  it("is false only when both parts are empty", () => {
    expect(hasRiderVehicle({ vehicleType: null, vehiclePlate: null })).toBe(
      false,
    )
    expect(hasRiderVehicle({ vehicleType: "FOOT", vehiclePlate: null })).toBe(
      true,
    )
    expect(hasRiderVehicle({ vehicleType: null, vehiclePlate: "X" })).toBe(true)
  })
})
