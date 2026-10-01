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
    expect(labels).toContain("Rider Cash")
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
    // Documented in the rider guide but had no sidebar entry; reachable only by
    // typing the URL until it was added here.
    expect(labels).toContain("Earnings")
    expect(labels).toContain("Inbox")
    expect(labels).toContain("Account")
  })

  it("every item has an href starting with /rider (or /help)", () => {
    for (const item of RIDER_SIDEBAR.items) {
      expect(item.href).toMatch(/^\/(rider|help)/)
    }
  })
})

// `RoleSidebar` (and the mobile drawer, which mirrors it) renders a group header
// whenever an item's `group` differs from the *previous* item's. An item whose
// group reappears further down therefore repeats its header mid-list, so
// contiguity is load-bearing rather than cosmetic. The first item is also
// deliberately ungrouped: it is the role's landing page.
describe("sidebar grouping", () => {
  const sidebars = [
    ["SUPER_ADMIN", SUPER_ADMIN_SIDEBAR],
    ["MERCHANT", MERCHANT_SIDEBAR],
    ["WAREHOUSE", WAREHOUSE_SIDEBAR],
    ["RIDER", RIDER_SIDEBAR],
  ] as const

  it.each(sidebars)("%s: every sidebar is grouped", (_name, config) => {
    expect(config.items[0].group).toBeUndefined()
    expect(config.items.length).toBeGreaterThan(1)
    // Everything past the landing page sits under a header.
    for (const item of config.items.slice(1)) {
      expect(item.group, `${item.label} is missing a group`).toBeTruthy()
    }
  })

  it.each(sidebars)("%s: no group is split by another", (_name, config) => {
    const seen = new Set<string>()
    let current: string | undefined

    for (const item of config.items) {
      if (item.group !== current) {
        // Re-entering a group we already left means its header would render
        // twice, so the new group must not be one we have closed.
        expect(
          seen.has(item.group ?? ""),
          `${item.group} is not contiguous`,
        ).toBe(false)
        if (current) seen.add(current)
        current = item.group
      }
    }
  })

  it.each(sidebars)(
    "%s: shared sections use the same group name",
    (_name, config) => {
      const groups = new Set(
        config.items.map((i) => i.group).filter((g): g is string => Boolean(g)),
      )
      // Money and System appear in every sidebar — part of a shared vocabulary
      // across roles rather than a per-role invention.
      expect(groups.has("Money")).toBe(true)
      expect(groups.has("System")).toBe(true)
    },
  )
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

  // Deliberately not one of the moderator grants: it is reference information
  // rather than an order-taking surface, and it reads public endpoints, meaning
  // the nav rules are its ONLY gate. The meaningful claim is that it is
  // owner-only and grouped with the rest of the merchant's business setup.
  const deliveryCitiesHref = "/merchant/delivery-cities"

  it("stays in the Business group, after the money sections", () => {
    const items = merchantVisibleNavItems(owner)
    const hrefs = items.map((i) => i.href)
    const deliveryCities = items.find((i) => i.href === deliveryCitiesHref)!

    expect(hrefs).toContain(deliveryCitiesHref)
    expect(deliveryCities.group).toBe("Business")
    // Later in the nav than Pricing, but no longer pinned directly beside it —
    // it moved with the other setup surfaces when the sidebars were grouped.
    expect(hrefs.indexOf(deliveryCitiesHref)).toBeGreaterThan(
      hrefs.indexOf("/merchant/pricing"),
    )
  })

  it("is owner-only: not grantable, and a stale grant is not enough", () => {
    const smuggled = {
      role: "MERCHANT",
      isModerator: true,
      moderatorPermissions: [deliveryCitiesHref, "/merchant/orders"],
    }
    expect(merchantGrantableNavItems().map((i) => i.href)).not.toContain(
      deliveryCitiesHref,
    )
    expect(hasNavPermission(owner, deliveryCitiesHref)).toBe(true)
    expect(hasNavPermission(smuggled, deliveryCitiesHref)).toBe(false)
    expect(merchantVisibleNavItems(smuggled).map((i) => i.href)).not.toContain(
      deliveryCitiesHref,
    )
  })
})
