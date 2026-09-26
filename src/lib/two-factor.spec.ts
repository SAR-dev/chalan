import { describe, expect, it } from "vitest"
import {
  isAdminRole,
  totpSecretFromUri,
  twoFactorAccountPath,
  twoFactorEnforcementPath,
} from "./two-factor"

describe("isAdminRole", () => {
  it("accepts both admin roles", () => {
    expect(isAdminRole("SUPER_ADMIN")).toBe(true)
    expect(isAdminRole("WAREHOUSE_ADMIN")).toBe(true)
  })

  it("rejects every other role", () => {
    expect(isAdminRole("MERCHANT")).toBe(false)
    expect(isAdminRole("RIDER")).toBe(false)
    expect(isAdminRole(null)).toBe(false)
    expect(isAdminRole(undefined)).toBe(false)
  })
})

describe("twoFactorAccountPath", () => {
  it("maps each admin role to its own account page", () => {
    expect(twoFactorAccountPath("SUPER_ADMIN")).toBe("/dashboard/account")
    expect(twoFactorAccountPath("WAREHOUSE_ADMIN")).toBe("/warehouse/account")
  })

  it("returns null for non-admin roles", () => {
    expect(twoFactorAccountPath("MERCHANT")).toBeNull()
    expect(twoFactorAccountPath(undefined)).toBeNull()
  })
})

describe("twoFactorEnforcementPath", () => {
  const admin = {
    role: "SUPER_ADMIN",
    twoFactorEnabled: false,
    twoFactorRequired: true,
    pathname: "/dashboard/orders",
  }

  it("does nothing when the requirement is off (default)", () => {
    expect(
      twoFactorEnforcementPath({ ...admin, twoFactorRequired: false }),
    ).toBeNull()
    expect(
      twoFactorEnforcementPath({ ...admin, twoFactorRequired: undefined }),
    ).toBeNull()
    expect(
      twoFactorEnforcementPath({ ...admin, twoFactorRequired: null }),
    ).toBeNull()
  })

  it("redirects an unenrolled admin when the requirement is on", () => {
    expect(twoFactorEnforcementPath(admin)).toBe("/dashboard/account?setup=2fa")
  })

  it("redirects a warehouse admin to the warehouse account page", () => {
    expect(
      twoFactorEnforcementPath({
        ...admin,
        role: "WAREHOUSE_ADMIN",
        pathname: "/warehouse/dispatch",
      }),
    ).toBe("/warehouse/account?setup=2fa")
  })

  it("leaves enrolled admins alone", () => {
    expect(
      twoFactorEnforcementPath({ ...admin, twoFactorEnabled: true }),
    ).toBeNull()
  })

  it("never redirects non-admin roles", () => {
    expect(twoFactorEnforcementPath({ ...admin, role: "MERCHANT" })).toBeNull()
  })

  it("stays on the account page instead of looping", () => {
    expect(
      twoFactorEnforcementPath({ ...admin, pathname: "/dashboard/account" }),
    ).toBeNull()
  })
})

describe("totpSecretFromUri", () => {
  it("extracts the secret from an otpauth URI", () => {
    expect(
      totpSecretFromUri(
        "otpauth://totp/Jhor%20Express:admin1%40email.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Jhor%20Express&digits=6&period=30",
      ),
    ).toBe("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP")
  })

  it("falls back to a regex when URL parsing fails", () => {
    expect(totpSecretFromUri("not a url?secret=ABCDEF234567")).toBe(
      "ABCDEF234567",
    )
  })

  it("returns null when there is no secret", () => {
    expect(totpSecretFromUri("otpauth://totp/Example:user")).toBeNull()
  })
})
