import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { validateEnv } from "@/lib/env"

const REQUIRED_VARS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "LOCAL_UPLOADS_DIR",
]

const OPTIONAL_VARS = [
  "NEXT_PUBLIC_ENV",
  "STORAGE_PROVIDER",
  "PORTAL_MODE",
  "DATABASE_URL_READ_ONLY",
  "AUDIT_LOG_RETENTION_DAYS",
  "EMAIL_LOG_RETENTION_DAYS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_BUCKET",
  "SUPABASE_PUBLIC_URL",
  "SMTP_SECRET_KEY",
]

function allKeys() {
  return [...REQUIRED_VARS, ...OPTIONAL_VARS]
}

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v
  }
}

function clearEnv() {
  for (const k of allKeys()) {
    delete process.env[k]
  }
}

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: "postgres://localhost/mydb",
    BETTER_AUTH_SECRET: "a".repeat(32),
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    CRON_SECRET: "cron-secret",
    LOCAL_UPLOADS_DIR: "/uploads",
    NEXT_PUBLIC_ENV: "development",
    STORAGE_PROVIDER: "local",
  }
}

describe("validateEnv", () => {
  beforeEach(() => {
    clearEnv()
  })

  afterEach(() => {
    clearEnv()
  })

  it("passes when all required vars are set", () => {
    setEnv(baseEnv())
    expect(validateEnv()).toBeUndefined()
  })

  it("throws when DATABASE_URL is missing", () => {
    setEnv({ ...baseEnv(), DATABASE_URL: "" })
    expect(() => validateEnv()).toThrow("DATABASE_URL")
  })

  it("throws when BETTER_AUTH_SECRET is too short", () => {
    setEnv({ ...baseEnv(), BETTER_AUTH_SECRET: "short" })
    expect(() => validateEnv()).toThrow("at least 32 characters")
  })

  it("throws when NEXT_PUBLIC_ENV is invalid", () => {
    setEnv({ ...baseEnv(), NEXT_PUBLIC_ENV: "staging" })
    expect(() => validateEnv()).toThrow(
      'Must be one of: "development", "production"',
    )
  })

  it("validates STORAGE_PROVIDER=r2 requires R2 vars", () => {
    setEnv({ ...baseEnv(), STORAGE_PROVIDER: "r2" })
    expect(() => validateEnv()).toThrow("R2_ACCOUNT_ID")
  })

  it("validates STORAGE_PROVIDER=supabase requires Supabase vars", () => {
    setEnv({ ...baseEnv(), STORAGE_PROVIDER: "supabase" })
    expect(() => validateEnv()).toThrow("SUPABASE_URL")
  })

  it("accepts AUDIT_LOG_RETENTION_DAYS when valid", () => {
    setEnv({ ...baseEnv(), AUDIT_LOG_RETENTION_DAYS: "90" })
    expect(validateEnv()).toBeUndefined()
  })

  it("rejects non-positive AUDIT_LOG_RETENTION_DAYS", () => {
    setEnv({ ...baseEnv(), AUDIT_LOG_RETENTION_DAYS: "0" })
    expect(() => validateEnv()).toThrow("Must be a positive integer")
  })

  it("accepts DATABASE_URL_READ_ONLY when set", () => {
    setEnv({
      ...baseEnv(),
      DATABASE_URL_READ_ONLY: "postgres://readonly/mydb",
    })
    expect(validateEnv()).toBeUndefined()
  })

  it("accepts a valid SMTP_SECRET_KEY", () => {
    setEnv({ ...baseEnv(), SMTP_SECRET_KEY: "a".repeat(64) })
    expect(validateEnv()).toBeUndefined()
  })

  it("rejects a malformed SMTP_SECRET_KEY in any env", () => {
    setEnv({ ...baseEnv(), SMTP_SECRET_KEY: "not-hex-secret" })
    expect(() => validateEnv()).toThrow("SMTP_SECRET_KEY")
  })

  it("accepts every valid PORTAL_MODE value", () => {
    for (const mode of ["admin", "public", "all"]) {
      setEnv({ ...baseEnv(), PORTAL_MODE: mode })
      expect(validateEnv()).toBeUndefined()
    }
  })

  it("rejects an invalid PORTAL_MODE", () => {
    setEnv({ ...baseEnv(), PORTAL_MODE: "merchant" })
    expect(() => validateEnv()).toThrow("PORTAL_MODE")
  })

  it("requires SMTP_SECRET_KEY when NEXT_PUBLIC_ENV=production", () => {
    setEnv({ ...baseEnv(), NEXT_PUBLIC_ENV: "production" })
    expect(() => validateEnv()).toThrow("SMTP_SECRET_KEY")
  })

  it("accepts a valid SMTP_SECRET_KEY in production", () => {
    setEnv({
      ...baseEnv(),
      NEXT_PUBLIC_ENV: "production",
      SMTP_SECRET_KEY: "b".repeat(64),
    })
    expect(validateEnv()).toBeUndefined()
  })
})
