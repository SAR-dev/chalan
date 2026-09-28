import { describe, expect, it } from "vitest"
import {
  calcCodFee,
  calcDeliveryCharge,
  calcMerchantEarnings,
  formatTk,
} from "@/lib/pricing"

describe("calcDeliveryCharge", () => {
  const base = {
    baseRate: 60,
    extraRatePerKg: 20,
    freeWeightKg: 2,
    maxWeightKg: 30,
  }

  it("returns base rate only when weight is within free allowance", () => {
    const result = calcDeliveryCharge(base, 1)
    expect(result).toEqual({
      baseRate: 60,
      billableExtraKg: 0,
      extraWeightCharge: 0,
      total: 60,
      exceedsMax: false,
    })
  })

  it("charges for extra weight above free allowance", () => {
    const result = calcDeliveryCharge(base, 5)
    expect(result.billableExtraKg).toBe(3)
    expect(result.extraWeightCharge).toBe(60)
    expect(result.total).toBe(120)
    expect(result.exceedsMax).toBe(false)
  })

  it("rounds up partial extra kg", () => {
    const result = calcDeliveryCharge(base, 3.1)
    expect(result.billableExtraKg).toBe(2)
    expect(result.extraWeightCharge).toBe(40)
  })

  it("rounds the charge to paisa (2 decimals)", () => {
    const result = calcDeliveryCharge(
      {
        baseRate: 60.005,
        extraRatePerKg: 20.005,
        freeWeightKg: 0,
        maxWeightKg: 30,
      },
      1,
    )
    expect(result.extraWeightCharge).toBe(20.01)
    expect(result.total).toBe(80.02)
  })

  it("marks exceedsMax when weight exceeds max", () => {
    const result = calcDeliveryCharge(base, 31)
    expect(result.exceedsMax).toBe(true)
  })

  it("handles zero weight", () => {
    const result = calcDeliveryCharge(base, 0)
    expect(result.total).toBe(60)
    expect(result.billableExtraKg).toBe(0)
  })

  it("handles weight exactly at free allowance", () => {
    const result = calcDeliveryCharge(base, 2)
    expect(result.billableExtraKg).toBe(0)
    expect(result.total).toBe(60)
  })

  it("handles weight exactly at max", () => {
    const result = calcDeliveryCharge(base, 30)
    expect(result.exceedsMax).toBe(false)
    expect(result.billableExtraKg).toBe(28)
    expect(result.total).toBe(620)
  })
})

describe("formatTk", () => {
  it("formats whole numbers", () => {
    expect(formatTk(1234)).toBe("1,234 TK")
  })

  it("formats decimals with up to 2 places", () => {
    expect(formatTk(1234.5)).toBe("1,234.5 TK")
    expect(formatTk(1234.56)).toBe("1,234.56 TK")
    expect(formatTk(1234.567)).toBe("1,234.57 TK")
  })

  it("formats zero", () => {
    expect(formatTk(0)).toBe("0 TK")
  })
})

describe("calcCodFee", () => {
  it("calculates basic COD fee", () => {
    expect(calcCodFee(1000, 1.5)).toBe(15)
  })

  it("rounds to 2 decimal places", () => {
    expect(calcCodFee(100, 1.5)).toBe(1.5)
    expect(calcCodFee(103, 1.5)).toBe(1.55)
  })

  it("returns 0 for zero product cost", () => {
    expect(calcCodFee(0, 1.5)).toBe(0)
  })

  it("returns 0 for zero percentage", () => {
    expect(calcCodFee(1000, 0)).toBe(0)
  })

  it("handles high percentage values", () => {
    expect(calcCodFee(1000, 10)).toBe(100)
  })

  it("handles fractional results with proper rounding", () => {
    expect(calcCodFee(333, 1)).toBe(3.33)
    expect(calcCodFee(333, 2)).toBe(6.66)
  })
})

describe("calcMerchantEarnings", () => {
  it("calculates normal earnings", () => {
    expect(calcMerchantEarnings(500, 60, 7.5)).toBe(432.5)
  })

  it("rounds earnings to paisa (2 decimals)", () => {
    expect(calcMerchantEarnings(100.005, 0, 0)).toBe(100.01)
    expect(calcMerchantEarnings(100.005, 10.005, 1.005)).toBe(89)
    expect(calcMerchantEarnings(100, 10, 1)).toBe(89)
  })

  it("goes negative when the fees exceed the COD (signed net, ROADMAP B7)", () => {
    expect(calcMerchantEarnings(50, 60, 7.5)).toBe(-17.5)
  })

  it("goes negative when the COD fee exceeds the COD", () => {
    expect(calcMerchantEarnings(5, 0, 10)).toBe(-5)
  })

  it("returns full amount when no fees", () => {
    expect(calcMerchantEarnings(500, 0, 0)).toBe(500)
  })

  it("handles zero product cost", () => {
    expect(calcMerchantEarnings(0, 60, 7.5)).toBe(-67.5)
  })
})
