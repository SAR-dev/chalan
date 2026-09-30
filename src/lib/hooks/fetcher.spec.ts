import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, jsonFetcher, RESOURCE_KEYS, swrOptions } from "./fetcher"

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError("test")
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("test")
  })

  it("is an instance of ApiError", () => {
    const err = new ApiError("fail")
    expect(err).toBeInstanceOf(ApiError)
  })
})

describe("RESOURCE_KEYS", () => {
  it("contains resource keys", () => {
    // Every entry must be a real, paginated endpoint the aggregator can probe.
    expect(RESOURCE_KEYS).toHaveLength(9)
    expect(RESOURCE_KEYS).not.toContain("/api/security-config")
  })

  it("all start with /api/", () => {
    for (const key of RESOURCE_KEYS) {
      expect(key).toMatch(/^\/api\//)
    }
  })

  it("includes expected endpoints", () => {
    expect(RESOURCE_KEYS).toContain("/api/team")
    expect(RESOURCE_KEYS).toContain("/api/merchants")
    expect(RESOURCE_KEYS).toContain("/api/orders")
    expect(RESOURCE_KEYS).toContain("/api/payouts")
    expect(RESOURCE_KEYS).toContain("/api/riders")
    expect(RESOURCE_KEYS).toContain("/api/warehouses")
    expect(RESOURCE_KEYS).toContain("/api/audit-logs")
    expect(RESOURCE_KEYS).toContain("/api/email-logs")
  })
})

describe("jsonFetcher", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("returns parsed JSON on 2xx response", async () => {
    const mockData = { id: 1, name: "test" }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    })

    const result = await jsonFetcher("/api/test")
    expect(result).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", {
      cache: "no-store",
    })
  })

  it("throws on non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })

    await expect(jsonFetcher("/api/missing")).rejects.toThrow(
      "Request to /api/missing failed with status 404",
    )
  })

  it("throws on 500 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })

    await expect(jsonFetcher("/api/error")).rejects.toThrow("status 500")
  })
})

describe("swrOptions", () => {
  it("disables revalidateOnFocus", () => {
    expect(swrOptions.revalidateOnFocus).toBe(false)
  })

  it("enables revalidateOnReconnect", () => {
    expect(swrOptions.revalidateOnReconnect).toBe(true)
  })

  it("sets dedupingInterval to 2000", () => {
    expect(swrOptions.dedupingInterval).toBe(2000)
  })
})
