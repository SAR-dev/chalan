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
  rightNavItems,
  SUPER_ADMIN_SIDEBAR,
  sidebarVisibleItems,
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
    expect(labels).toContain("Announcements")
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
    expect(labels).toContain("Overview")
    expect(labels).toContain("Order approval")
    expect(labels).toContain("Ongoing")
    expect(labels).toContain("Completed")
    expect(labels).toContain("Riders")
    expect(labels).toContain("Exceptions")
    expect(labels).toContain("COD Settlement")
    expect(labels).toContain("Rider Cash")
    expect(labels).toContain("Announcements")
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
    expect(labels).toContain("Cash collections")
    expect(labels).toContain("Announcements")
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

  // RoleSidebar and the mobile drawer render sidebarVisibleItems(), not the
  // raw array — contiguity has to hold on what is actually rendered, or a
  // rightnav-placed item could split a group and double its header.
  it.each(sidebars)(
    "%s: the rendered (non-rightnav) view keeps groups contiguous",
    (_name, config) => {
      const seen = new Set<string>()
      let current: string | undefined
      for (const item of sidebarVisibleItems(config.items)) {
        if (item.group !== current) {
          expect(
            seen.has(item.group ?? ""),
            `${item.group} is not contiguous after the rightnav filter`,
          ).toBe(false)
          if (current) seen.add(current)
          current = item.group
        }
      }
    },
  )
})

// The placement split: utility links (Help, and Support for the self-service
// roles) leave the sidebar for the RightNav account panel. The announcements
// feed is deliberately NOT one of them — it is a board you read, not a
// utility, so it stays in the sidebar (and the TopNav bell links to it
// directly). The items stay in `items` either way — grants, the route guard,
// and the command palette read the raw array — so these two helpers are the
// only rendering contract.
describe("rightnav placement", () => {
  it.each([
    ["SUPER_ADMIN", SUPER_ADMIN_SIDEBAR],
    ["MERCHANT", MERCHANT_SIDEBAR],
    ["WAREHOUSE", WAREHOUSE_SIDEBAR],
    ["RIDER", RIDER_SIDEBAR],
  ] as const)("%s: Help moves to the rightnav", (_name, config) => {
    const moved = rightNavItems(config.items).map((i) => i.label)
    expect(moved).toContain("Help")
    // …and is gone from the sidebar view.
    expect(sidebarVisibleItems(config.items).map((i) => i.label)).not.toContain(
      "Help",
    )
  })

  it("Support moves for self-service roles but stays a sidebar queue for admins", () => {
    for (const config of [MERCHANT_SIDEBAR, WAREHOUSE_SIDEBAR, RIDER_SIDEBAR]) {
      expect(rightNavItems(config.items).map((i) => i.label)).toContain(
        "Support",
      )
      expect(
        sidebarVisibleItems(config.items).map((i) => i.label),
      ).not.toContain("Support")
    }
    // The admin view is an operational ticket queue they work daily, not a
    // "get help" link — it stays one click away in the sidebar.
    expect(
      sidebarVisibleItems(SUPER_ADMIN_SIDEBAR.items).map((i) => i.label),
    ).toContain("Support")
    expect(
      rightNavItems(SUPER_ADMIN_SIDEBAR.items).map((i) => i.label),
    ).not.toContain("Support")
  })

  it("the announcements feed stays a sidebar destination, never a rightnav link", () => {
    // It is a board you read, not a utility — and admin's feed entry is
    // retired outright (the manage page owns the slot; the bell links to the
    // feed directly).
    for (const config of [MERCHANT_SIDEBAR, WAREHOUSE_SIDEBAR, RIDER_SIDEBAR]) {
      const sidebarLabels = sidebarVisibleItems(config.items).map(
        (i) => i.label,
      )
      expect(sidebarLabels).toContain("Announcements")
      expect(rightNavItems(config.items).map((i) => i.label)).not.toContain(
        "Announcements",
      )
    }
    const adminLabels = SUPER_ADMIN_SIDEBAR.items.map((i) => i.label)
    expect(adminLabels).toContain("Announcements") // the manage page
    expect(SUPER_ADMIN_SIDEBAR.items.map((i) => i.href)).not.toContain(
      "/dashboard/announcements-inbox",
    ) // feed entry retired
  })

  it("the split never loses or duplicates an item", () => {
    for (const config of [
      SUPER_ADMIN_SIDEBAR,
      MERCHANT_SIDEBAR,
      WAREHOUSE_SIDEBAR,
      RIDER_SIDEBAR,
    ]) {
      const total = config.items.length
      expect(
        sidebarVisibleItems(config.items).length +
          rightNavItems(config.items).length,
      ).toBe(total)
    }
  })

  it("placement changes rendering only — grantable hrefs are untouched", () => {
    // merchantGrantableNavItems reads the raw array, so moving Support to
    // the rightnav must not revoke an existing moderator grant — and the
    // announcements feed grant stays too, even though admin retired its own
    // feed entry (merchant's is unaffected).
    const grantable = merchantGrantableNavItems().map((i) => i.href)
    expect(grantable).toContain("/merchant/support")
    expect(grantable).toContain("/merchant/announcements")
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

describe("merchant moderator nav grants", () => {
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
