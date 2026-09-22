import { describe, expect, it } from "vitest"
import {
  dashboardSidebarForRole,
  homeForRole,
  MERCHANT_SIDEBAR,
  RIDER_SIDEBAR,
  SUPER_ADMIN_SIDEBAR,
  WAREHOUSE_SIDEBAR,
} from "./nav-config"
import type { Role } from "./types"

describe("homeForRole", () => {
  it("returns /merchant for MERCHANT", () => {
    expect(homeForRole("MERCHANT")).toBe("/merchant")
  })

  it("returns /rider for RIDER", () => {
    expect(homeForRole("RIDER")).toBe("/rider")
  })

  it("returns /warehouse for WAREHOUSE_ADMIN", () => {
    expect(homeForRole("WAREHOUSE_ADMIN")).toBe("/warehouse")
  })

  it("returns /dashboard for SUPER_ADMIN", () => {
    expect(homeForRole("SUPER_ADMIN")).toBe("/dashboard")
  })
})

describe("dashboardSidebarForRole", () => {
  it("returns SUPER_ADMIN_SIDEBAR for all roles", () => {
    const roles: Role[] = [
      "SUPER_ADMIN",
      "WAREHOUSE_ADMIN",
      "MERCHANT",
      "RIDER",
    ]
    for (const role of roles) {
      const config = dashboardSidebarForRole(role)
      expect(config.items).toEqual(SUPER_ADMIN_SIDEBAR.items)
      expect(config.roleLabel).toBe(SUPER_ADMIN_SIDEBAR.roleLabel)
    }
  })

  it("returns SUPER_ADMIN_SIDEBAR for undefined role", () => {
    const config = dashboardSidebarForRole(undefined)
    expect(config.items).toEqual(SUPER_ADMIN_SIDEBAR.items)
  })
})

describe("SUPER_ADMIN_SIDEBAR", () => {
  it("has all expected navigation items", () => {
    const labels = SUPER_ADMIN_SIDEBAR.items.map((i) => i.label)
    expect(labels).toContain("Overview")
    expect(labels).toContain("Admins")
    expect(labels).toContain("Riders")
    expect(labels).toContain("Merchants")
    expect(labels).toContain("Rider Applications")
    expect(labels).toContain("Merchant Reviews")
    expect(labels).toContain("Orders")
    expect(labels).toContain("Warehouses")
    expect(labels).toContain("Payouts")
    expect(labels).toContain("Announcements")
    expect(labels).toContain("Inbox")
    expect(labels).toContain("Audit Logs")
    expect(labels).toContain("Email Logs")
    expect(labels).toContain("Settings")
    expect(labels).toContain("Account")
  })

  it("Overview item has exact match", () => {
    const overview = SUPER_ADMIN_SIDEBAR.items.find(
      (i) => i.label === "Overview",
    )
    expect(overview?.exact).toBe(true)
  })

  it("every item has an href starting with /dashboard", () => {
    for (const item of SUPER_ADMIN_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/dashboard/)
    }
  })
})

describe("MERCHANT_SIDEBAR", () => {
  it("has all expected navigation items", () => {
    const labels = MERCHANT_SIDEBAR.items.map((i) => i.label)
    expect(labels).toContain("Dashboard")
    expect(labels).toContain("Orders")
    expect(labels).toContain("New Order")
    expect(labels).toContain("Finance")
    expect(labels).toContain("Pricing")
    expect(labels).toContain("Business Settings")
    expect(labels).toContain("Verification")
    expect(labels).toContain("Inbox")
  })

  it("every item has an href starting with /merchant", () => {
    for (const item of MERCHANT_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/merchant/)
    }
  })
})

describe("WAREHOUSE_SIDEBAR", () => {
  it("has all expected navigation items", () => {
    const labels = WAREHOUSE_SIDEBAR.items.map((i) => i.label)
    expect(labels).toContain("Intake queue")
    expect(labels).toContain("Dispatch desk")
    expect(labels).toContain("Order progress")
    expect(labels).toContain("Riders")
    expect(labels).toContain("Exceptions")
    expect(labels).toContain("COD reconciliation")
    expect(labels).toContain("Inbox")
    expect(labels).toContain("Account")
  })

  it("every item has an href starting with /warehouse", () => {
    for (const item of WAREHOUSE_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/warehouse/)
    }
  })
})

describe("RIDER_SIDEBAR", () => {
  it("has all expected navigation items", () => {
    const labels = RIDER_SIDEBAR.items.map((i) => i.label)
    expect(labels).toContain("To-do")
    expect(labels).toContain("Pickups")
    expect(labels).toContain("Deliveries")
    expect(labels).toContain("Inbox")
    expect(labels).toContain("Account")
  })

  it("every item has an href starting with /rider", () => {
    for (const item of RIDER_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/rider/)
    }
  })
})
