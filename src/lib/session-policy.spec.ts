import { describe, expect, it } from "vitest"
import {
  isTwoFactorRequiredByPolicy,
  sessionBlockReason,
} from "@/lib/session-policy"

describe("sessionBlockReason", () => {
  it("allows a normal active session", () => {
    expect(
      sessionBlockReason({
        role: "MERCHANT",
        emailVerifiedAt: "2025-01-01T00:00:00Z",
      }),
    ).toBeNull()
  })

  it("blocks a banned user of any role", () => {
    expect(sessionBlockReason({ role: "RIDER", banned: true })).toBe("BANNED")
    expect(
      sessionBlockReason({
        role: "MERCHANT",
        banned: true,
        emailVerifiedAt: "x",
      }),
    ).toBe("BANNED")
  })

  it("blocks an admin who has not enrolled while the policy is on", () => {
    for (const role of ["SUPER_ADMIN", "WAREHOUSE_ADMIN"]) {
      expect(
        sessionBlockReason({
          role,
          twoFactorRequired: true,
          twoFactorEnabled: false,
        }),
      ).toBe("TWO_FACTOR_REQUIRED")
    }
  })

  it("allows an enrolled admin under the policy", () => {
    expect(
      sessionBlockReason({
        role: "SUPER_ADMIN",
        twoFactorRequired: true,
        twoFactorEnabled: true,
      }),
    ).toBeNull()
  })

  it("never forces 2FA on non-admin roles", () => {
    for (const role of ["MERCHANT", "RIDER"]) {
      expect(
        sessionBlockReason({
          role,
          twoFactorRequired: true,
          twoFactorEnabled: false,
          emailVerifiedAt: "2025-01-01T00:00:00Z",
        }),
      ).toBeNull()
    }
  })

  it("ignores 2FA state when the policy is off", () => {
    expect(
      sessionBlockReason({
        role: "SUPER_ADMIN",
        twoFactorRequired: false,
        twoFactorEnabled: false,
      }),
    ).toBeNull()
  })

  it("blocks an unverified merchant", () => {
    expect(
      sessionBlockReason({ role: "MERCHANT", emailVerifiedAt: null }),
    ).toBe("EMAIL_VERIFICATION_REQUIRED")
    expect(sessionBlockReason({ role: "MERCHANT" })).toBe(
      "EMAIL_VERIFICATION_REQUIRED",
    )
  })

  it("reports 2FA first when an admin has both problems", () => {
    expect(
      sessionBlockReason({ role: "SUPER_ADMIN", twoFactorRequired: true }),
    ).toBe("TWO_FACTOR_REQUIRED")
  })

  it("reads the policy from the environment", () => {
    expect(isTwoFactorRequiredByPolicy({ ADMIN_2FA_REQUIRED: "1" })).toBe(true)
    expect(isTwoFactorRequiredByPolicy({ ADMIN_2FA_REQUIRED: "0" })).toBe(false)
    expect(isTwoFactorRequiredByPolicy({})).toBe(false)
  })
})
