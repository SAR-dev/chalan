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

// =============================================================================
// Formula injection (P2-5)
//
// These cells come from untrusted content — recipient names, addresses, notes,
// anything a merchant typed into a CSV that was then re-exported. Opened in
// Excel, Sheets or LibreOffice, a leading = + - @ or a control character is a
// formula and executes. The cell is prefixed with an apostrophe so the
// spreadsheet renders it as text instead.
// =============================================================================

describe("toCsv formula injection", () => {
  it.each([
    ["=", "=1+1"],
    ["+", "+1"],
    ["-", "-1"],
    ["@", "@SUM(A1:A2)"],
    ["tab", "=1\t+1"],
  ])("neutralises a leading %s", (_label, cell) => {
    expect(toCsv([[cell]])).toBe(`'${cell}`)
  })

  it("neutralises a leading CR, and still quotes it per RFC 4180", () => {
    // \r is both a formula trigger and a quoting trigger, so the cell gets both
    // treatments — the apostrophe is what stops the formula executing.
    expect(toCsv([["=1\r+1"]])).toBe(`"'=1\r+1"`)
  })

  it("neutralises a leading newline too", () => {
    expect(toCsv([["=1\n+1"]])).toBe(`"'=1\n+1"`)
  })

  it("leaves ordinary text untouched", () => {
    expect(toCsv([["House 12, Road 5"]])).toBe('"House 12, Road 5"')
  })

  it("leaves numbers untouched — a value is not text", () => {
    expect(toCsv([[42]])).toBe("42")
  })

  it("only neutralises the first character, not a mid-string match", () => {
    // A hyphen inside an address must stay readable.
    expect(toCsv([["01712-345678"]])).toBe("01712-345678")
  })

  it("still quotes a neutralised cell that also contains a delimiter", () => {
    expect(toCsv([["=SUM(A1),B1"]])).toBe(`"'=SUM(A1),B1"`)
  })

  it("handles an empty cell", () => {
    expect(toCsv([[""]])).toBe("")
  })
})
