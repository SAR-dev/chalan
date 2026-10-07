import { describe, expect, it } from "vitest"
import { LABEL_QR_MIN_MM, LABEL_TEMPLATE_MAX_MM } from "@/lib/constants"
import {
  clampQrSizeMm,
  LABEL_SCALE_MM,
  type LabelData,
  labelBlockKey,
  resolveLabelField,
} from "@/lib/label-layout"

const data: LabelData = {
  orderId: "ORD-100001",
  merchantName: "Acme Store",
  recipientName: "Rina Akter",
  recipientPhone: "01712345678",
  recipientAddress: "12 Gulshan Ave, Dhaka",
  destinationCity: "Dhaka",
  weightKg: 1.5,
  codAmount: 1250,
  qrValue: "a".repeat(32),
}

describe("clampQrSizeMm", () => {
  it("raises a size below the scannable floor", () => {
    expect(clampQrSizeMm(10)).toBe(LABEL_QR_MIN_MM)
  })

  it("passes a size at or above the floor through", () => {
    expect(clampQrSizeMm(45)).toBe(45)
  })

  it("caps at the template maximum", () => {
    expect(clampQrSizeMm(LABEL_TEMPLATE_MAX_MM + 500)).toBe(
      LABEL_TEMPLATE_MAX_MM,
    )
  })
})

describe("LABEL_SCALE_MM", () => {
  it("increases monotonically from xs to xl", () => {
    const sizes = [
      LABEL_SCALE_MM.xs,
      LABEL_SCALE_MM.s,
      LABEL_SCALE_MM.m,
      LABEL_SCALE_MM.l,
      LABEL_SCALE_MM.xl,
    ]
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
    }
  })
})

describe("resolveLabelField", () => {
  it("resolves every whitelisted orientation of the same order", () => {
    expect(resolveLabelField(data, "orderId")).toBe("ORD-100001")
    expect(resolveLabelField(data, "recipientName")).toBe("Rina Akter")
    expect(resolveLabelField(data, "recipientPhone")).toBe("01712345678")
    expect(resolveLabelField(data, "recipientAddress")).toBe(
      "12 Gulshan Ave, Dhaka",
    )
    expect(resolveLabelField(data, "merchantName")).toBe("Acme Store")
    expect(resolveLabelField(data, "destinationCity")).toBe("Dhaka")
  })

  it("formats weight with a kg suffix", () => {
    expect(resolveLabelField(data, "weight")).toBe("1.5 kg")
  })

  it("formats the COD amount with the currency suffix", () => {
    expect(resolveLabelField(data, "codAmount")).toBe("COD 1,250 TK")
  })

  it("renders an absent destination city as an empty string, not null", () => {
    expect(
      resolveLabelField({ ...data, destinationCity: null }, "destinationCity"),
    ).toBe("")
  })
})

describe("labelBlockKey", () => {
  it("distinguishes field blocks by their field and position", () => {
    expect(labelBlockKey({ type: "field", field: "orderId" }, 0)).toBe(
      "field-orderId-0",
    )
    expect(labelBlockKey({ type: "field", field: "weight" }, 1)).toBe(
      "field-weight-1",
    )
  })

  it("keys non-field blocks by type and position", () => {
    expect(labelBlockKey({ type: "qr" }, 2)).toBe("qr-2")
    expect(labelBlockKey({ type: "spacer" }, 3)).toBe("spacer-3")
  })
})
