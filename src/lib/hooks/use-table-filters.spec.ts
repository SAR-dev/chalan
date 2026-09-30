import { describe, expect, it } from "vitest"
import { buildTableUrl } from "./use-table-filters"

const BASE = "/api/orders"

/** Parse the query string back out so assertions don't depend on key order. */
function query(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1))
}

describe("buildTableUrl", () => {
  it("returns the bare base when nothing is set", () => {
    expect(buildTableUrl(BASE, {})).toBe(BASE)
  })

  it("omits null and undefined params", () => {
    expect(buildTableUrl(BASE, { q: undefined, limit: undefined })).toBe(BASE)
  })

  it("serialises the standard table params", () => {
    const url = buildTableUrl(BASE, {
      limit: 20,
      offset: 40,
      q: "bob",
      sortId: "createdAt",
      sortDir: "desc",
    })
    const sp = query(url)
    expect(url.startsWith(`${BASE}?`)).toBe(true)
    expect(sp.get("limit")).toBe("20")
    expect(sp.get("offset")).toBe("40")
    expect(sp.get("q")).toBe("bob")
    expect(sp.get("sort")).toBe("createdAt")
    expect(sp.get("sortDir")).toBe("desc")
  })

  it("keeps a zero offset (falsy but meaningful)", () => {
    expect(query(buildTableUrl(BASE, { offset: 0 })).get("offset")).toBe("0")
  })

  it("joins statuses with a comma under `status`", () => {
    const sp = query(buildTableUrl(BASE, { statuses: ["PENDING", "APPROVED"] }))
    expect(sp.get("status")).toBe("PENDING,APPROVED")
  })

  it("omits an empty statuses array", () => {
    expect(buildTableUrl(BASE, { statuses: [] })).toBe(BASE)
  })

  it("maps the date range to from/to", () => {
    const sp = query(
      buildTableUrl(BASE, { dateFrom: "2026-01-01", dateTo: "2026-01-31" }),
    )
    expect(sp.get("from")).toBe("2026-01-01")
    expect(sp.get("to")).toBe("2026-01-31")
  })

  it("passes extra keys through, joining arrays", () => {
    const sp = query(
      buildTableUrl(BASE, { warehouseId: "wh_1", ids: ["a", "b"] }),
    )
    expect(sp.get("warehouseId")).toBe("wh_1")
    expect(sp.get("ids")).toBe("a,b")
  })

  it("does not let an extra key clobber a known param", () => {
    // `limit` is handled first; the pass-through loop must skip it.
    const sp = query(buildTableUrl(BASE, { limit: 20, q: "x" }))
    expect(sp.getAll("limit")).toHaveLength(1)
    expect(sp.get("limit")).toBe("20")
  })

  it("percent-encodes values", () => {
    const url = buildTableUrl(BASE, { q: "a b&c" })
    expect(url).toContain("q=a+b%26c")
    expect(query(url).get("q")).toBe("a b&c")
  })
})
