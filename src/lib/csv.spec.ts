import { describe, expect, it } from "vitest"
import { toCsv } from "@/lib/csv"

describe("toCsv", () => {
  it("converts rows to CSV text", () => {
    const rows = [
      ["a", "b", "c"],
      [1, 2, 3],
    ]
    expect(toCsv(rows)).toBe("a,b,c\r\n1,2,3")
  })

  it("prepends headers when provided", () => {
    const rows = [["Alice", 30]]
    const result = toCsv(rows, ["Name", "Age"])
    expect(result).toBe("Name,Age\r\nAlice,30")
  })

  it("handles empty rows", () => {
    expect(toCsv([])).toBe("")
  })

  it("quotes cells containing commas", () => {
    const rows = [["hello, world"]]
    expect(toCsv(rows)).toBe('"hello, world"')
  })

  it("doubles embedded quotes per RFC 4180", () => {
    const rows = [['say "hi"']]
    expect(toCsv(rows)).toBe('"say ""hi"""')
  })

  it("quotes cells containing newlines", () => {
    const rows = [["line1\nline2"]]
    expect(toCsv(rows)).toBe('"line1\nline2"')
  })

  it("converts null and undefined to empty strings", () => {
    const rows = [[null, undefined, ""]]
    expect(toCsv(rows)).toBe(",,")
  })

  it("handles mixed types", () => {
    const rows = [["text", 42, null]]
    expect(toCsv(rows)).toBe("text,42,")
  })

  it("handles headers with special characters", () => {
    const rows = [["a"]]
    const result = toCsv(rows, ["Col,1"])
    expect(result).toBe('"Col,1"\r\na')
  })
})
