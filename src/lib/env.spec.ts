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
  "UPLOAD_SWEEP_MIN_AGE_HOURS",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "SMTP_SECRET_KEY",
  "NEXT_PUBLIC_BASE_URL",
  "TRUSTED_PROXY_HOPS",
  "NEXT_MODE",
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

  it("rejects an unknown STORAGE_PROVIDER", () => {
    setEnv({ ...baseEnv(), STORAGE_PROVIDER: "supabase" })
    expect(() => validateEnv()).toThrow('Must be one of: "local", "r2"')
  })

  it("accepts AUDIT_LOG_RETENTION_DAYS when valid", () => {
    setEnv({ ...baseEnv(), AUDIT_LOG_RETENTION_DAYS: "90" })
    expect(validateEnv()).toBeUndefined()
  })

  it("rejects non-positive AUDIT_LOG_RETENTION_DAYS", () => {
    setEnv({ ...baseEnv(), AUDIT_LOG_RETENTION_DAYS: "0" })
    expect(() => validateEnv()).toThrow("Must be a positive integer")
  })

  it("accepts UPLOAD_SWEEP_MIN_AGE_HOURS when valid", () => {
    setEnv({ ...baseEnv(), UPLOAD_SWEEP_MIN_AGE_HOURS: "48" })
    expect(validateEnv()).toBeUndefined()
  })

  it("rejects non-positive UPLOAD_SWEEP_MIN_AGE_HOURS", () => {
    setEnv({ ...baseEnv(), UPLOAD_SWEEP_MIN_AGE_HOURS: "0" })
    expect(() => validateEnv()).toThrow("Must be a positive number (hours)")
  })

  it("rejects a non-numeric UPLOAD_SWEEP_MIN_AGE_HOURS", () => {
    setEnv({ ...baseEnv(), UPLOAD_SWEEP_MIN_AGE_HOURS: "soon" })
    expect(() => validateEnv()).toThrow("Must be a positive number (hours)")
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

  it("accepts NEXT_MODE off", () => {
    for (const value of ["false", "0"]) {
      setEnv({ ...baseEnv(), NEXT_MODE: value })
      expect(validateEnv()).toBeUndefined()
    }
  })

  it("accepts NEXT_MODE on in development", () => {
    for (const value of ["true", "1"]) {
      setEnv({ ...baseEnv(), NEXT_MODE: value })
      expect(validateEnv()).toBeUndefined()
    }
  })

  it("rejects an unparseable NEXT_MODE", () => {
    setEnv({ ...baseEnv(), NEXT_MODE: "trst" })
    expect(() => validateEnv()).toThrow("NEXT_MODE")
  })

  it("rejects NEXT_MODE in production — it would publish seed credentials", () => {
    setEnv({
      ...baseEnv(),
      NEXT_PUBLIC_ENV: "production",
      SMTP_SECRET_KEY: "b".repeat(64),
      NEXT_MODE: "true",
    })
    expect(() => validateEnv()).toThrow("NEXT_MODE")
  })

  it("accepts NEXT_MODE=false in production", () => {
    setEnv({
      ...baseEnv(),
      NEXT_PUBLIC_ENV: "production",
      SMTP_SECRET_KEY: "b".repeat(64),
      NEXT_MODE: "false",
    })
    expect(validateEnv()).toBeUndefined()
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

  it("accepts a sane TRUSTED_PROXY_HOPS value", () => {
    for (const hops of ["0", "1", "2"]) {
      setEnv({ ...baseEnv(), TRUSTED_PROXY_HOPS: hops })
      expect(validateEnv()).toBeUndefined()
    }
  })

  it("rejects a non-numeric or negative TRUSTED_PROXY_HOPS", () => {
    for (const hops of ["nginx", "-1", "1.5", "99"]) {
      setEnv({ ...baseEnv(), TRUSTED_PROXY_HOPS: hops })
      expect(() => validateEnv(), hops).toThrow("TRUSTED_PROXY_HOPS")
    }
  })

  it("accepts an absolute NEXT_PUBLIC_BASE_URL", () => {
    setEnv({ ...baseEnv(), NEXT_PUBLIC_BASE_URL: "https://api.example.com" })
    expect(validateEnv()).toBeUndefined()
  })

  it("rejects a malformed NEXT_PUBLIC_BASE_URL", () => {
    for (const value of ["not-a-url", "ftp://example.com"]) {
      setEnv({ ...baseEnv(), NEXT_PUBLIC_BASE_URL: value })
      expect(() => validateEnv(), value).toThrow("NEXT_PUBLIC_BASE_URL")
    }
  })
})
