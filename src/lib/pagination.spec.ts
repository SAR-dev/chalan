import { type Column } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  MAX_LIMIT,
  paginateResponse,
  parseDateRange,
  parsePagination,
  parseSort,
  parseStatusFilter,
} from "@/lib/pagination"

describe("parsePagination", () => {
  it("parses limit and offset", () => {
    const req = new Request("http://localhost?limit=10&offset=20")
    expect(parsePagination(req)).toEqual({ limit: 10, offset: 20 })
  })

  it("caps limit at MAX_LIMIT", () => {
    const req = new Request(`http://localhost?limit=${MAX_LIMIT + 1}&offset=0`)
    expect(parsePagination(req)).toEqual({ limit: MAX_LIMIT, offset: 0 })
  })

  it("returns undefined for invalid params", () => {
    const req = new Request("http://localhost?limit=-1&offset=-5")
    expect(parsePagination(req)).toEqual({
      limit: undefined,
      offset: undefined,
    })
  })

  it("returns undefined for non-numeric params", () => {
    const req = new Request("http://localhost?limit=abc&offset=xyz")
    expect(parsePagination(req)).toEqual({
      limit: undefined,
      offset: undefined,
    })
  })

  it("returns undefined when params missing", () => {
    const req = new Request("http://localhost")
    expect(parsePagination(req)).toEqual({
      limit: undefined,
      offset: undefined,
    })
  })
})

describe("parseStatusFilter", () => {
  it("parses single status", () => {
    const req = new Request("http://localhost?status=active")
    expect(parseStatusFilter(req)).toEqual(["ACTIVE"])
  })

  it("parses comma-separated statuses", () => {
    const req = new Request("http://localhost?status=active,pending")
    expect(parseStatusFilter(req)).toEqual(["ACTIVE", "PENDING"])
  })

  it("deduplicates statuses", () => {
    const req = new Request("http://localhost?status=active,active")
    expect(parseStatusFilter(req)).toEqual(["ACTIVE"])
  })

  it("returns empty array when param missing", () => {
    const req = new Request("http://localhost")
    expect(parseStatusFilter(req)).toEqual([])
  })

  it("drops statuses not in the allowed whitelist", () => {
    const req = new Request("http://localhost?status=active,bogus,PENDING")
    expect(parseStatusFilter(req, ["ACTIVE", "PENDING"])).toEqual([
      "ACTIVE",
      "PENDING",
    ])
  })
})

describe("parseDateRange", () => {
  it("parses valid from and to", () => {
    const req = new Request("http://localhost?from=2025-01-01&to=2025-01-15")
    const result = parseDateRange(req)
    expect(result).not.toBeNull()
    expect(result!.from.toISOString()).toContain("2025-01-01")
    expect(result!.to.toISOString()).toContain("2025-01-15")
    expect(result!.to.getHours()).toBe(23)
    expect(result!.to.getMinutes()).toBe(59)
    expect(result!.to.getSeconds()).toBe(59)
  })

  it("returns null when param missing", () => {
    const req = new Request("http://localhost")
    expect(parseDateRange(req)).toBeNull()
  })

  it("returns null on invalid date", () => {
    const req = new Request("http://localhost?from=not-a-date&to=2025-01-15")
    expect(parseDateRange(req)).toBeNull()
  })
})

describe("paginateResponse", () => {
  it("wraps data with total, limit, offset", () => {
    expect(paginateResponse(["a", "b"], 100, 10, 0)).toEqual({
      data: ["a", "b"],
      total: 100,
      limit: 10,
      offset: 0,
    })
  })

  it("works without limit and offset", () => {
    expect(paginateResponse([], 0)).toEqual({ data: [], total: 0 })
  })
})

describe("parseSort", () => {
  const mockColumn = { name: "createdAt" } as unknown as Column
  const columnMap: Record<string, Column> = { createdAt: mockColumn }

  it("returns sort when valid", () => {
    const req = new Request("http://localhost?sort=createdAt&sortDir=desc")
    const result = parseSort(req, columnMap)
    expect(result).not.toBeNull()
    expect(result!.direction).toBe("desc")
  })

  it("defaults to asc when sortDir missing", () => {
    const req = new Request("http://localhost?sort=createdAt")
    const result = parseSort(req, columnMap)
    expect(result).not.toBeNull()
    expect(result!.direction).toBe("asc")
  })

  it("returns null for unknown column", () => {
    const req = new Request("http://localhost?sort=unknown")
    expect(parseSort(req, columnMap)).toBeNull()
  })

  it("returns null when sort param missing", () => {
    const req = new Request("http://localhost")
    expect(parseSort(req, columnMap)).toBeNull()
  })
})
