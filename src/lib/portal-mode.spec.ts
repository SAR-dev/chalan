import { afterEach, describe, expect, it, vi } from "vitest"
import {
  allowedRolesFor,
  isRoleAllowed,
  isRoleAllowedIn,
  type PortalMode,
  parsePortalMode,
  portalPageAllowed,
} from "@/lib/portal-mode"

const ALL_ROLES = ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"]

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("parsePortalMode", () => {
  it("falls back to all when unset or blank", () => {
    expect(parsePortalMode(undefined)).toBe("all")
    expect(parsePortalMode("")).toBe("all")
    expect(parsePortalMode("   ")).toBe("all")
  })

  it("falls back to all for invalid values", () => {
    expect(parsePortalMode("super")).toBe("all")
    expect(parsePortalMode("merchant")).toBe("all")
    expect(parsePortalMode("admin2")).toBe("all")
  })

  it("accepts the three mode values, trimmed and case-insensitive", () => {
    expect(parsePortalMode("admin")).toBe("admin")
    expect(parsePortalMode("public")).toBe("public")
    expect(parsePortalMode("all")).toBe("all")
    expect(parsePortalMode("ADMIN")).toBe("admin")
    expect(parsePortalMode(" Public ")).toBe("public")
  })
})

describe("allowedRolesFor", () => {
  it("admin mode serves only the two admin roles", () => {
    expect(allowedRolesFor("admin")).toEqual(["SUPER_ADMIN", "WAREHOUSE_ADMIN"])
  })

  it("public mode maps to merchant + rider (public = deployment name)", () => {
    expect(allowedRolesFor("public")).toEqual(["MERCHANT", "RIDER"])
  })

  it("all mode serves every role", () => {
    expect(allowedRolesFor("all")).toEqual(ALL_ROLES)
  })
})

describe("isRoleAllowedIn", () => {
  it("maps every mode × role combination", () => {
    const expected: Record<PortalMode, Record<string, boolean>> = {
      admin: {
        SUPER_ADMIN: true,
        WAREHOUSE_ADMIN: true,
        MERCHANT: false,
        RIDER: false,
      },
      public: {
        SUPER_ADMIN: false,
        WAREHOUSE_ADMIN: false,
        MERCHANT: true,
        RIDER: true,
      },
      all: {
        SUPER_ADMIN: true,
        WAREHOUSE_ADMIN: true,
        MERCHANT: true,
        RIDER: true,
      },
    }
    for (const [mode, roles] of Object.entries(expected)) {
      for (const [role, allowed] of Object.entries(roles)) {
        expect(
          isRoleAllowedIn(role, mode as PortalMode),
          `${mode} / ${role}`,
        ).toBe(allowed)
      }
    }
  })

  it("rejects an unknown role in every mode", () => {
    for (const mode of ["admin", "public", "all"] as PortalMode[]) {
      expect(isRoleAllowedIn("SUPPORT", mode), mode).toBe(false)
    }
  })
})

describe("isRoleAllowed (env-driven)", () => {
  it("reads PORTAL_MODE from the environment when mode is omitted", () => {
    vi.stubEnv("PORTAL_MODE", "public")
    expect(isRoleAllowed("MERCHANT")).toBe(true)
    expect(isRoleAllowed("RIDER")).toBe(true)
    expect(isRoleAllowed("SUPER_ADMIN")).toBe(false)
    expect(isRoleAllowed("WAREHOUSE_ADMIN")).toBe(false)
  })

  it("treats an unset PORTAL_MODE as all", () => {
    vi.stubEnv("PORTAL_MODE", undefined)
    expect(isRoleAllowed("SUPER_ADMIN")).toBe(true)
    expect(isRoleAllowed("MERCHANT")).toBe(true)
    expect(isRoleAllowed("RIDER")).toBe(true)
    expect(isRoleAllowed("WAREHOUSE_ADMIN")).toBe(true)
  })

  it("treats an invalid PORTAL_MODE as all (defense-in-depth)", () => {
    vi.stubEnv("PORTAL_MODE", "nonsense")
    expect(isRoleAllowed("SUPER_ADMIN")).toBe(true)
    expect(isRoleAllowed("MERCHANT")).toBe(true)
  })
})

describe("portalPageAllowed", () => {
  it("serves every path in all mode", () => {
    for (const path of [
      "/dashboard",
      "/merchant",
      "/rider",
      "/warehouse",
      "/login",
      "/register",
      "/track/abc",
      "/faq",
      "/help",
      "/apply",
    ]) {
      expect(portalPageAllowed(path, "all"), path).toBe(true)
    }
  })

  it("admin mode disables merchant + rider pages only", () => {
    expect(portalPageAllowed("/merchant", "admin")).toBe(false)
    expect(portalPageAllowed("/merchant/orders", "admin")).toBe(false)
    expect(portalPageAllowed("/rider", "admin")).toBe(false)
    expect(portalPageAllowed("/rider/tasks/123", "admin")).toBe(false)

    expect(portalPageAllowed("/dashboard", "admin")).toBe(true)
    expect(portalPageAllowed("/warehouse/orders", "admin")).toBe(true)
    expect(portalPageAllowed("/login", "admin")).toBe(true)
    expect(portalPageAllowed("/register", "admin")).toBe(true)
    expect(portalPageAllowed("/track/abc", "admin")).toBe(true)
  })

  it("public mode disables dashboard + warehouse pages only", () => {
    expect(portalPageAllowed("/dashboard", "public")).toBe(false)
    expect(portalPageAllowed("/dashboard/orders", "public")).toBe(false)
    expect(portalPageAllowed("/warehouse", "public")).toBe(false)
    expect(portalPageAllowed("/warehouse/intake", "public")).toBe(false)

    expect(portalPageAllowed("/merchant/orders", "public")).toBe(true)
    expect(portalPageAllowed("/rider", "public")).toBe(true)
    expect(portalPageAllowed("/login", "public")).toBe(true)
    expect(portalPageAllowed("/register", "public")).toBe(true)
    expect(portalPageAllowed("/faq", "public")).toBe(true)
    expect(portalPageAllowed("/apply", "public")).toBe(true)
  })

  it("matches portal subtrees, not raw string prefixes", () => {
    expect(portalPageAllowed("/merchants", "admin")).toBe(true)
    expect(portalPageAllowed("/dashboard-legacy", "public")).toBe(true)
  })
})
