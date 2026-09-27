import { describe, expect, it } from "vitest"
import {
  bestForeground,
  brandThemeVars,
  contrastRatio,
  isValidHexColor,
  lowContrastSides,
  relativeLuminance,
} from "@/lib/brand-color"

describe("isValidHexColor", () => {
  it("accepts 6-digit hex colors", () => {
    expect(isValidHexColor("#f97316")).toBe(true)
    expect(isValidHexColor("#FFFFFF")).toBe(true)
  })

  it("accepts 3-digit hex colors (trimmed)", () => {
    expect(isValidHexColor("#fff")).toBe(true)
    expect(isValidHexColor("  #abc  ")).toBe(true)
  })

  it("rejects invalid values", () => {
    expect(isValidHexColor("f97316")).toBe(false)
    expect(isValidHexColor("#ffff")).toBe(false)
    expect(isValidHexColor("#1234567")).toBe(false)
    expect(isValidHexColor("red")).toBe(false)
    expect(isValidHexColor("")).toBe(false)
    expect(isValidHexColor("#gggggg")).toBe(false)
  })
})

describe("relativeLuminance", () => {
  it("returns 1 for white and 0 for black", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5)
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5)
  })

  it("computes mid-range luminance", () => {
    const l = relativeLuminance("#f97316")
    expect(l).toBeGreaterThan(0.3)
    expect(l).toBeLessThan(0.35)
  })

  it("expands 3-digit hex", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5)
    expect(relativeLuminance("#000")).toBeCloseTo(0, 5)
  })

  it("returns NaN for invalid input", () => {
    expect(relativeLuminance("nope")).toBeNaN()
  })
})

describe("contrastRatio", () => {
  it("white on black is 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2)
  })

  it("is symmetric", () => {
    expect(contrastRatio("#f97316", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#f97316"),
      5,
    )
  })

  it("returns NaN for invalid input", () => {
    expect(contrastRatio("#ffffff", "oops")).toBeNaN()
  })
})

describe("bestForeground", () => {
  it("pairs black with light colors", () => {
    expect(bestForeground("#f97316")).toBe("#000000")
    expect(bestForeground("#ffffff")).toBe("#000000")
  })

  it("pairs white with dark colors", () => {
    expect(bestForeground("#2563eb")).toBe("#ffffff")
    expect(bestForeground("#000000")).toBe("#ffffff")
  })

  it("falls back to white for invalid input", () => {
    expect(bestForeground("not-a-color")).toBe("#ffffff")
  })

  it("always achieves at least the 4.58:1 pairing floor", () => {
    for (const color of ["#f97316", "#2563eb", "#8a8a8a", "#06b6d4"]) {
      expect(
        contrastRatio(color, bestForeground(color)),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("lowContrastSides", () => {
  it("flags warm colors on light backgrounds", () => {
    expect(lowContrastSides("#f97316")).toEqual(["light"])
  })

  it("flags dark colors on dark backgrounds", () => {
    expect(lowContrastSides("#2563eb")).toEqual(["dark"])
  })

  it("flags mid-luminance colors on both sides", () => {
    expect(lowContrastSides("#808080")).toEqual(["light", "dark"])
  })

  it("returns [] for invalid input", () => {
    expect(lowContrastSides("nope")).toEqual([])
  })
})

describe("brandThemeVars", () => {
  it("maps a valid color to theme variables with contrast-safe foreground", () => {
    const vars = brandThemeVars("#2563EB")
    expect(vars).toEqual({
      "--primary": "#2563eb",
      "--primary-foreground": "#ffffff",
      "--ring": "#2563eb",
      "--sidebar-primary": "#2563eb",
      "--sidebar-primary-foreground": "#ffffff",
      "--sidebar-ring": "#2563eb",
    })
  })

  it("returns undefined for invalid colors so callers keep theme defaults", () => {
    expect(brandThemeVars("orange")).toBeUndefined()
    expect(brandThemeVars("#12345")).toBeUndefined()
    expect(brandThemeVars("")).toBeUndefined()
  })
})
