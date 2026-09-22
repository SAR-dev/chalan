import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  deliveryCityCreateSchema,
  deliveryCityUpdateSchema,
  formatError,
  idsSchema,
  isValidBdPhone,
  merchantPricingSchema,
  normalizePhone,
  orderCreateSchema,
  parseBody,
  profileUpdateSchema,
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

describe("merchantPricingSchema", () => {
  it("accepts valid pricing", () => {
    const result = merchantPricingSchema.safeParse({
      baseRate: 60,
      extraRatePerKg: 20,
      freeWeightKg: 2,
      maxWeightKg: 30,
    })
    expect(result.success).toBe(true)
  })

  it("rejects freeWeightKg exceeding maxWeightKg", () => {
    const result = merchantPricingSchema.safeParse({
      baseRate: 60,
      extraRatePerKg: 20,
      freeWeightKg: 10,
      maxWeightKg: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(JSON.stringify(result.error)).toContain("freeWeightKg")
    }
  })

  it("rejects negative values", () => {
    const result = merchantPricingSchema.safeParse({
      baseRate: -1,
      extraRatePerKg: 20,
      freeWeightKg: 2,
      maxWeightKg: 30,
    })
    expect(result.success).toBe(false)
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
// orderCreateSchema — deliveryCity required
// ---------------------------------------------------------------------------

describe("orderCreateSchema — deliveryCity", () => {
  const validOrder = {
    pickupLocationId: "pl_1",
    recipientName: "John",
    recipientPhone: "01712345678",
    deliveryAddress: "Road 11, Banani",
    deliveryCity: "Dhaka",
    deliveryCityId: "city_1",
    parcelWeightKg: 1,
    productCost: 500,
  }

  it("accepts valid order with deliveryCity", () => {
    const result = orderCreateSchema.safeParse(validOrder)
    expect(result.success).toBe(true)
  })

  it("rejects order without deliveryCity", () => {
    const { deliveryCity, ...withoutCity } = validOrder
    const result = orderCreateSchema.safeParse(withoutCity)
    expect(result.success).toBe(false)
  })

  it("rejects order with empty deliveryCity", () => {
    const result = orderCreateSchema.safeParse({
      ...validOrder,
      deliveryCity: "",
    })
    expect(result.success).toBe(false)
  })
})
