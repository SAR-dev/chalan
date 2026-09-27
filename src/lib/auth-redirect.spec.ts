import { describe, expect, it } from "vitest"
import { loginPathWithNext, safeNextPath } from "./auth-redirect"

describe("safeNextPath", () => {
  it("accepts same-site absolute paths", () => {
    expect(safeNextPath("/merchant/orders")).toBe("/merchant/orders")
    expect(safeNextPath("/dashboard/audit-logs?tab=all")).toBe(
      "/dashboard/audit-logs?tab=all",
    )
  })

  it("rejects missing or non-path values", () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath("")).toBeNull()
    expect(safeNextPath("merchant/orders")).toBeNull()
    expect(safeNextPath("https://evil.example")).toBeNull()
  })

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNextPath("//evil.example")).toBeNull()
    expect(safeNextPath("/\\evil.example")).toBeNull()
  })

  it("rejects login and api loops", () => {
    expect(safeNextPath("/login")).toBeNull()
    expect(safeNextPath("/login?next=/x")).toBeNull()
    expect(safeNextPath("/LOGIN/x")).toBeNull()
    expect(safeNextPath("/api/orders")).toBeNull()
  })
})

describe("loginPathWithNext", () => {
  it("appends an encoded next param", () => {
    expect(loginPathWithNext("/merchant/orders")).toBe(
      "/login?next=%2Fmerchant%2Forders",
    )
    expect(loginPathWithNext("/dashboard/audit-logs?tab=all")).toBe(
      "/login?next=%2Fdashboard%2Faudit-logs%3Ftab%3Dall",
    )
  })

  it("falls back to a plain login URL for invalid paths", () => {
    expect(loginPathWithNext(null)).toBe("/login")
    expect(loginPathWithNext("//evil.example")).toBe("/login")
    expect(loginPathWithNext("/login")).toBe("/login")
  })
})
