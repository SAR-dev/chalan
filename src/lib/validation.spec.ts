import { describe, expect, it } from "vitest"
import { z } from "zod"
import { merchant } from "@/lib/db/schema"
import {
  deliveryCityCreateSchema,
  deliveryCityUpdateSchema,
  formatError,
  idsSchema,
  isValidBdPhone,
  normalizePhone,
  orderCreateSchema,
  parseBody,
  profileUpdateSchema,
  riderApproveSchema,
  riderUpdateSchema,
  validateFormData,
} from "@/lib/validation"

describe("parseBody", () => {
  const requiredSchema = z.object({ name: z.string().min(1) })

  it("returns parsed data for valid JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "Content-Type": "application/json" },
    })
    const result = await parseBody(req, requiredSchema)
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ name: "test" })
  })

  it("returns error 400 when body is missing (empty object fails required schema)", async () => {
    const req = new Request("http://localhost", { method: "POST" })
    const result = await parseBody(req, requiredSchema)
    expect(result.data).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error!.status).toBe(400)
  })

  it("returns error 400 for unparseable JSON (treated as empty object)", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    })
    const result = await parseBody(req, requiredSchema)
    expect(result.data).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error!.status).toBe(400)
  })
})

describe("idsSchema", () => {
  it("accepts an array of IDs", () => {
    const result = idsSchema.safeParse({ ids: ["a", "b", "c"] })
    expect(result.success).toBe(true)
  })

  it("rejects empty array", () => {
    const result = idsSchema.safeParse({ ids: [] })
    expect(result.success).toBe(false)
  })

  it("rejects array larger than 100", () => {
    const result = idsSchema.safeParse({
      ids: Array.from({ length: 101 }, (_, i) => String(i)),
    })
    expect(result.success).toBe(false)
  })
})

// The maximum parcel weight belongs to the lane (`zone_pricing.maxWeightKg`).
// A per-merchant cap was removed because two independent limits could disagree
// and reject a valid parcel — this pins the column against coming back.
describe("merchant has no per-merchant weight limit", () => {
  it("carries no maxWeightKg column", () => {
    expect("maxWeightKg" in merchant).toBe(false)
  })
})

describe("isValidBdPhone", () => {
  it("accepts valid 01XXXXXXXXX format", () => {
    expect(isValidBdPhone("01712345678")).toBe(true)
    expect(isValidBdPhone("01812345678")).toBe(true)
    expect(isValidBdPhone("01912345678")).toBe(true)
    expect(isValidBdPhone("01612345678")).toBe(true)
  })

  it("accepts +880 format", () => {
    expect(isValidBdPhone("+8801712345678")).toBe(true)
  })

  it("accepts 880 format", () => {
    expect(isValidBdPhone("8801712345678")).toBe(true)
  })

  it("accepts phone with dashes", () => {
    expect(isValidBdPhone("017-123-45678")).toBe(true)
  })

  it("accepts phone with spaces", () => {
    expect(isValidBdPhone("017 123 45678")).toBe(true)
  })

  it("rejects too short", () => {
    expect(isValidBdPhone("0171234567")).toBe(false)
  })

  it("rejects too long", () => {
    expect(isValidBdPhone("017123456789")).toBe(false)
  })

  it("rejects non-numeric", () => {
    expect(isValidBdPhone("abcdefghij")).toBe(false)
  })

  it("rejects wrong operator code", () => {
    expect(isValidBdPhone("01112345678")).toBe(false)
    expect(isValidBdPhone("01212345678")).toBe(false)
  })
})

describe("normalizePhone", () => {
  it("normalizes +880 format", () => {
    expect(normalizePhone("+8801712345678")).toBe("01712345678")
  })

  it("normalizes 880 format", () => {
    expect(normalizePhone("8801712345678")).toBe("01712345678")
  })

  it("keeps 0 format", () => {
    expect(normalizePhone("01712345678")).toBe("01712345678")
  })

  it("adds 0 prefix for bare number", () => {
    expect(normalizePhone("1712345678")).toBe("01712345678")
  })

  it("removes dashes", () => {
    expect(normalizePhone("017-123-45678")).toBe("01712345678")
  })

  it("removes spaces", () => {
    expect(normalizePhone("017 123 45678")).toBe("01712345678")
  })
})

describe("profileUpdateSchema", () => {
  it("accepts valid phone", () => {
    const result = profileUpdateSchema.safeParse({ phone: "01712345678" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid phone", () => {
    const result = profileUpdateSchema.safeParse({ phone: "123" })
    expect(result.success).toBe(false)
  })

  it("accepts phone with name", () => {
    const result = profileUpdateSchema.safeParse({
      name: "Test",
      phone: "01712345678",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty body", () => {
    const result = profileUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe("formatError", () => {
  it("returns error message when no issues", () => {
    expect(formatError({ error: "Something failed" })).toBe("Something failed")
  })

  it("returns fallback when no error and no issues", () => {
    expect(formatError({})).toBe("Request failed.")
  })

  it("returns custom fallback", () => {
    expect(formatError({}, "Custom fallback")).toBe("Custom fallback")
  })

  it("formats issues with camelCase field path", () => {
    const result = formatError({
      issues: [{ path: ["businessName"], message: "required" }],
    })
    expect(result).toBe("Business Name: required")
  })

  it("formats multiple issues joined by period", () => {
    const result = formatError({
      issues: [
        { path: ["businessName"], message: "required" },
        { path: ["email"], message: "invalid" },
      ],
    })
    expect(result).toBe("Business Name: required. Email: invalid")
  })

  it("skips numeric path segments", () => {
    const result = formatError({
      issues: [{ path: ["items", 0, "name"], message: "required" }],
    })
    expect(result).toBe("Items name: required")
  })

  it("returns error message even when issues exist but are empty", () => {
    expect(formatError({ error: "Fallback", issues: [] })).toBe("Fallback")
  })
})

describe("validateFormData", () => {
  const schema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.email("Invalid email"),
  })

  it("returns empty object for valid data", () => {
    expect(
      validateFormData(schema, { name: "Alice", email: "a@b.com" }),
    ).toEqual({})
  })

  it("returns first error per field", () => {
    const errors = validateFormData(schema, { name: "", email: "bad" })
    expect(errors.name).toBe("Name is required")
    expect(errors.email).toBe("Invalid email")
  })

  it("returns empty object when all fields missing but optional", () => {
    const opt = z.object({ name: z.string().optional() })
    expect(validateFormData(opt, {})).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// deliveryCityCreateSchema
// ---------------------------------------------------------------------------

describe("deliveryCityCreateSchema", () => {
  it("accepts valid city", () => {
    const result = deliveryCityCreateSchema.safeParse({
      name: "Dhaka",
      zoneId: "zone_1",
      warehouseId: "wh_1",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = deliveryCityCreateSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects missing name", () => {
    const result = deliveryCityCreateSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// deliveryCityUpdateSchema
// ---------------------------------------------------------------------------

describe("deliveryCityUpdateSchema", () => {
  it("accepts partial update", () => {
    const result = deliveryCityUpdateSchema.safeParse({ isActive: false })
    expect(result.success).toBe(true)
  })

  it("accepts name update", () => {
    const result = deliveryCityUpdateSchema.safeParse({ name: "New Name" })
    expect(result.success).toBe(true)
  })

  it("accepts empty object", () => {
    const result = deliveryCityUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// orderCreateSchema — deliveryCityId required
// ---------------------------------------------------------------------------

describe("orderCreateSchema — deliveryCityId", () => {
  const validOrder = {
    pickupLocationId: "pl_1",
    recipientName: "John",
    recipientPhone: "01712345678",
    deliveryAddress: "Road 11, Banani",
    deliveryCityId: "city_1",
    parcelWeightKg: 1,
    productCost: 500,
  }

  it("accepts valid order with deliveryCityId", () => {
    const result = orderCreateSchema.safeParse(validOrder)
    expect(result.success).toBe(true)
  })

  it("rejects order without deliveryCityId", () => {
    const { deliveryCityId, ...withoutCityId } = validOrder
    const result = orderCreateSchema.safeParse(withoutCityId)
    expect(result.success).toBe(false)
  })

  it("rejects order with empty deliveryCityId", () => {
    const result = orderCreateSchema.safeParse({
      ...validOrder,
      deliveryCityId: "",
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// orderCreateSchema — itemType
// ---------------------------------------------------------------------------

describe("orderCreateSchema — itemType", () => {
  const base = {
    pickupLocationId: "pl_1",
    recipientName: "John",
    recipientPhone: "01712345678",
    deliveryAddress: "Road 11, Banani",
    deliveryCityId: "city_1",
    parcelWeightKg: 1,
    productCost: 500,
  }

  it("stays optional — an order with no contents is still a valid order", () => {
    // Not making it required is the whole reason existing CSVs keep importing.
    const result = orderCreateSchema.safeParse({ ...base })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.itemType).toBeNull()
  })

  it("normalizes blank and whitespace-only to null, not an empty string", () => {
    // "" and null are indistinguishable in the UI but not in the database, and
    // "did not say" is worth being able to tell apart from "typed nothing".
    for (const blank of ["", "   "]) {
      const result = orderCreateSchema.safeParse({ ...base, itemType: blank })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.itemType).toBeNull()
    }
  })

  it("trims a real value", () => {
    const result = orderCreateSchema.safeParse({
      ...base,
      itemType: "  Cotton saree  ",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.itemType).toBe("Cotton saree")
  })

  it("caps the length so the field cannot become free-form notes", () => {
    const result = orderCreateSchema.safeParse({
      ...base,
      itemType: "x".repeat(61),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/60 characters/)
    }
  })

  it("does not let the contents influence anything priced", () => {
    // Two orders identical except for contents must produce identical parsed
    // data apart from that field — nothing downstream reads it, so this is the
    // guard against a future edit wiring it into the fee.
    const a = orderCreateSchema.safeParse({ ...base, itemType: "Books" })
    const b = orderCreateSchema.safeParse({ ...base, itemType: "Gold chain" })
    expect(a.success && b.success).toBe(true)
    if (!a.success || !b.success) return
    const { itemType: _a, ...restA } = a.data
    const { itemType: _b, ...restB } = b.data
    expect(restA).toEqual(restB)
  })
})

// ---------------------------------------------------------------------------
// riderUpdateSchema / riderApproveSchema — vehicle
// ---------------------------------------------------------------------------

describe("rider vehicle fields", () => {
  it("normalizes a plate to upper case with no spaces", () => {
    // The same plate typed two ways is one vehicle, and an admin comparing it
    // against a photo should not have to guess which form is canonical.
    const result = riderUpdateSchema.safeParse({
      vehicleType: "BIKE",
      vehiclePlate: "  dhaka 12-3456 ",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.vehiclePlate).toBe("DHAKA12-3456")
  })

  it("clears the plate when given a blank string", () => {
    // A blank plate is a real state (a foot or bicycle rider has none), and it
    // must be sendable as a clear rather than being rejected as invalid.
    const result = riderUpdateSchema.safeParse({ vehiclePlate: "  " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.vehiclePlate).toBeNull()
  })

  it("accepts an explicit null vehicleType as 'not declared'", () => {
    const result = riderUpdateSchema.safeParse({ vehicleType: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.vehicleType).toBeNull()
  })

  it("rejects a vehicle type outside the list", () => {
    const result = riderUpdateSchema.safeParse({ vehicleType: "HELICOPTER" })
    expect(result.success).toBe(false)
  })

  it("rejects a plate over the length cap", () => {
    const result = riderUpdateSchema.safeParse({
      vehicleType: "BIKE",
      vehiclePlate: "x".repeat(21),
    })
    expect(result.success).toBe(false)
  })

  it("still rejects an update that carries no field at all", () => {
    // The empty-vehicle PATCH is a clear; a PATCH with neither is a mistake.
    const result = riderUpdateSchema.safeParse({ vehiclePlate: null })
    expect(result.success).toBe(true)
    const nothing = riderUpdateSchema.safeParse({})
    expect(nothing.success).toBe(false)
  })

  it("leaves the plate absent when the update does not mention it", () => {
    // The regression this guards: a transform on the field used to materialise
    // `vehiclePlate: null` on every parse, so renaming a rider would have wiped
    // the vehicle recorded against them. Absent must stay absent — only an
    // explicit null (or blank) is a clear.
    const result = riderUpdateSchema.safeParse({ name: "New Name" })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect("vehiclePlate" in result.data).toBe(false)
    expect("vehicleType" in result.data).toBe(false)
  })

  it("captures the vehicle at approval without requiring it", () => {
    const without = riderApproveSchema.safeParse({})
    expect(without.success).toBe(true)

    const withVehicle = riderApproveSchema.safeParse({
      taskType: "PICKUP",
      vehicleType: "VAN",
      vehiclePlate: "ba-11-1111",
    })
    expect(withVehicle.success).toBe(true)
    if (withVehicle.success) {
      expect(withVehicle.data.vehicleType).toBe("VAN")
      expect(withVehicle.data.vehiclePlate).toBe("BA-11-1111")
    }
  })
})
