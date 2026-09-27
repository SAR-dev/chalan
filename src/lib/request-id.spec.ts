import { describe, expect, it } from "vitest"
import {
  getRequestId,
  isValidRequestId,
  mintRequestId,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "./request-id"

describe("request-id", () => {
  it("accepts opaque ids and rejects junk", () => {
    expect(isValidRequestId("abcd1234")).toBe(true)
    expect(isValidRequestId(mintRequestId())).toBe(true)
    expect(isValidRequestId("short")).toBe(false) // < 8 chars
    expect(isValidRequestId("has space")).toBe(false)
    expect(isValidRequestId("")).toBe(false)
    expect(isValidRequestId(null)).toBe(false)
    expect(isValidRequestId(123)).toBe(false)
  })

  it("reuses a valid inbound id, otherwise mints a fresh one", () => {
    expect(resolveRequestId("abcd1234")).toBe("abcd1234")
    const a = resolveRequestId(null)
    const b = resolveRequestId(null)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("mintRequestId returns a UUID", () => {
    expect(mintRequestId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("reads the header off a Request", () => {
    const req = new Request("http://x/y", {
      headers: { [REQUEST_ID_HEADER]: "abcd1234" },
    })
    expect(getRequestId(req)).toBe("abcd1234")
    // Absent/invalid → minted.
    expect(getRequestId(new Request("http://x/y"))).toMatch(/^[0-9a-f-]{36}$/)
    expect(getRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/)
  })
})
