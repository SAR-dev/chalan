import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  deliveryCityCreateSchema,
  deliveryCityUpdateSchema,
  formatError,
  idsSchema,
  isValidBdPhone,
  merchantBrandingSchema,
  merchantWeightLimitSchema,
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

describe("merchantWeightLimitSchema", () => {
  it("accepts a positive weight", () => {
    const result = merchantWeightLimitSchema.safeParse({ maxWeightKg: 30 })
    expect(result.success).toBe(true)
  })

  it("rejects zero or negative weight", () => {
    expect(
      merchantWeightLimitSchema.safeParse({ maxWeightKg: 0 }).success,
    ).toBe(false)
    expect(
      merchantWeightLimitSchema.safeParse({ maxWeightKg: -1 }).success,
    ).toBe(false)
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
// merchantBrandingSchema
// ---------------------------------------------------------------------------

describe("merchantBrandingSchema", () => {
  it("accepts valid hex color", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: "#f97316" })
    expect(result.success).toBe(true)
  })

  it("accepts null values", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: null })
    expect(result.success).toBe(true)
  })

  it("accepts all fields", () => {
    const result = merchantBrandingSchema.safeParse({
      brandColor: "#10b981",
      hidePlatformBranding: true,
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty object (all optional)", () => {
    const result = merchantBrandingSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects invalid hex without #", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: "f97316" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid hex too short", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: "#fff" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid hex too long", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: "#1234567" })
    expect(result.success).toBe(false)
  })

  it("accepts all valid preset colors", () => {
    const presets = [
      "#f97316",
      "#2563eb",
      "#10b981",
      "#8b5cf6",
      "#ef4444",
      "#06b6d4",
    ]
    for (const color of presets) {
      const result = merchantBrandingSchema.safeParse({ brandColor: color })
      expect(result.success).toBe(true)
    }
  })

  it("accepts uppercase hex", () => {
    const result = merchantBrandingSchema.safeParse({ brandColor: "#F97316" })
    expect(result.success).toBe(true)
  })
})
