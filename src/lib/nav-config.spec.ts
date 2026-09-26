import { describe, expect, it } from "vitest"
import {
  dashboardSidebarForRole,
  hasNavPermission,
  homeForRole,
  isNavItemActive,
  MERCHANT_SIDEBAR,
  merchantGrantableNavItems,
  merchantVisibleNavItems,
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
    expect(labels).toContain("Users")
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

  it("every item has an href starting with /dashboard (or /help)", () => {
    for (const item of SUPER_ADMIN_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/(dashboard|help)/)
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

  it("every item has an href starting with /merchant (or /help)", () => {
    for (const item of MERCHANT_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/(merchant|help)/)
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
    expect(labels).toContain("COD Settlement")
    expect(labels).toContain("Inbox")
    expect(labels).toContain("Account")
  })

  it("every item has an href starting with /warehouse (or /help)", () => {
    for (const item of WAREHOUSE_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/(warehouse|help)/)
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

  it("every item has an href starting with /rider (or /help)", () => {
    for (const item of RIDER_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/(rider|help)/)
    }
  })
})

describe("isNavItemActive", () => {
  const newOrder = MERCHANT_SIDEBAR.items.find((i) => i.label === "New Order")!

  it("New Order also activates for the import page", () => {
    expect(newOrder.activePaths).toContain("/merchant/orders/import")
    expect(isNavItemActive(newOrder, "/merchant/orders/new")).toBe(true)
    expect(isNavItemActive(newOrder, "/merchant/orders/import")).toBe(true)
    expect(isNavItemActive(newOrder, "/merchant/orders")).toBe(false)
    expect(isNavItemActive(newOrder, "/merchant/finance")).toBe(false)
  })

  it("matches exact items only on their own path", () => {
    const pricing = MERCHANT_SIDEBAR.items.find((i) => i.label === "Pricing")!
    expect(pricing.exact).toBe(true)
    expect(isNavItemActive(pricing, "/merchant/pricing")).toBe(true)
    expect(isNavItemActive(pricing, "/merchant/pricing/edit")).toBe(false)
  })

  it("matches non-exact items by prefix", () => {
    expect(isNavItemActive(newOrder, "/merchant/orders/new/anything")).toBe(
      true,
    )
  })
})

describe("merchant moderator nav grants (ROADMAP 5.2)", () => {
  const owner = { role: "MERCHANT", isModerator: false }
  const moderatorOrdersOnly = {
    role: "MERCHANT",
    isModerator: true,
    moderatorPermissions: ["/merchant/orders"],
  }

  it("grantable items exclude Settings and always-on sections", () => {
    const hrefs = merchantGrantableNavItems().map((i) => i.href)
    expect(hrefs).not.toContain("/merchant/settings")
    expect(hrefs).not.toContain("/merchant")
    expect(hrefs).not.toContain("/merchant/account")
    expect(hrefs).not.toContain("/help")
    expect(hrefs).toContain("/merchant/orders")
    expect(hrefs).toContain("/merchant/finance")
  })

  it("owner sees the full sidebar", () => {
    expect(merchantVisibleNavItems(owner)).toEqual(MERCHANT_SIDEBAR.items)
    expect(merchantVisibleNavItems({ role: "MERCHANT" })).toEqual(
      MERCHANT_SIDEBAR.items,
    )
    expect(merchantVisibleNavItems(null)).toEqual(MERCHANT_SIDEBAR.items)
  })

  it("moderator sees granted items plus always-on entries", () => {
    const labels = merchantVisibleNavItems(moderatorOrdersOnly).map(
      (i) => i.label,
    )
    expect(labels).toContain("Orders")
    expect(labels).toContain("Dashboard")
    expect(labels).toContain("Account")
    expect(labels).toContain("Help")
    expect(labels).not.toContain("Finance")
    expect(labels).not.toContain("Business Settings")
    expect(labels).not.toContain("New Order")
  })

  it("hasNavPermission: owner and non-merchant roles always pass", () => {
    expect(hasNavPermission(owner, "/merchant/settings")).toBe(true)
    expect(hasNavPermission(owner, "/merchant/finance")).toBe(true)
    expect(hasNavPermission({ role: "SUPER_ADMIN" }, "/merchant/finance")).toBe(
      true,
    )
    expect(hasNavPermission({ role: "WAREHOUSE_ADMIN" }, "/x")).toBe(true)
    expect(hasNavPermission(undefined, "/x")).toBe(false)
  })

  it("hasNavPermission: moderators only pass granted hrefs", () => {
    expect(hasNavPermission(moderatorOrdersOnly, "/merchant/orders")).toBe(true)
    expect(hasNavPermission(moderatorOrdersOnly, "/merchant/finance")).toBe(
      false,
    )
    expect(hasNavPermission(moderatorOrdersOnly, "/merchant")).toBe(false)
  })

  it("hasNavPermission: Settings never passes for a moderator", () => {
    const smuggled = {
      role: "MERCHANT",
      isModerator: true,
      moderatorPermissions: ["/merchant/settings", "/merchant/orders"],
    }
    expect(hasNavPermission(smuggled, "/merchant/settings")).toBe(false)
    expect(hasNavPermission(smuggled, "/merchant/orders")).toBe(true)
  })
})
