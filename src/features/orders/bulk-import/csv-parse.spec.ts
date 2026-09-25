import { describe, expect, it } from "vitest"
import {
  decodeUtf8,
  MAX_IMPORT_BYTES,
  parseImportFile,
  parseImportText,
  UTF8_ERROR,
} from "./csv-parse"
import { orderImportHeaders } from "./template"

const HEADER = orderImportHeaders.join(",")

function file(name: string, text: string) {
  const buffer = new TextEncoder().encode(text)
  return { name, size: buffer.byteLength, buffer }
}

describe("parseImportText", () => {
  it("parses a happy-path file with physical line numbers", () => {
    const result = parseImportText(
      `${HEADER}\nShop A,John,01712345678,Dhaka,Addr,1.5,1200\nShop B,Jane,01712345679,Chittagong,Addr 2,2,500`,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.__line)).toEqual([2, 3])
    expect(result.rows[0].values).toEqual({
      pickup_location: "Shop A",
      recipient_name: "John",
      recipient_phone: "01712345678",
      delivery_city: "Dhaka",
      delivery_address: "Addr",
      parcel_weight_kg: "1.5",
      product_cost: "1200",
      delivery_type: "",
      delivery_map_link: "",
      merchant_note: "",
    })
  })

  it("keeps quoted commas and newlines inside one row", () => {
    const result = parseImportText(
      `${HEADER}\n"Shop A",John,01712345678,Dhaka,"House 1, Road 1\nDhanmondi Dhaka",1.5,1200\nShop B,Jane,01712345679,Chittagong,Addr,2,500`,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].__line).toBe(2)
    expect(result.rows[0].values.delivery_address).toBe(
      "House 1, Road 1\nDhanmondi Dhaka",
    )
    expect(result.rows[1].__line).toBe(4)
  })

  it("strips a BOM before resolving headers", () => {
    const result = parseImportText(
      `\uFEFF${HEADER}\nShop A,John,01712345678,Dhaka,Addr,1,100`,
    )
    expect(result.ok).toBe(true)
  })

  it("reports missing required columns by canonical name", () => {
    const result = parseImportText("recipient_name,phone\nJohn,01712345678")
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Missing required columns"),
    })
    if (result.ok) return
    expect(result.error).toContain("pickup_location")
    expect(result.error).toContain("delivery_city")
    expect(result.error).not.toContain("recipient_name")
  })

  it("maps aliased headers to canonical columns", () => {
    const result = parseImportText(
      "Pickup,Name,Phone,City,Address,Weight,COD\nShop A,John,01712345678,Dhaka,Addr,1.5,1200",
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].values.pickup_location).toBe("Shop A")
    expect(result.rows[0].values.recipient_name).toBe("John")
    expect(result.rows[0].values.recipient_phone).toBe("01712345678")
    expect(result.rows[0].values.delivery_city).toBe("Dhaka")
    expect(result.rows[0].values.parcel_weight_kg).toBe("1.5")
    expect(result.rows[0].values.product_cost).toBe("1200")
  })

  it("auto-detects TSV from pasted spreadsheet rows", () => {
    const tsv = [
      orderImportHeaders.join("\t"),
      "Shop A\tJohn\t01712345678\tDhaka\tAddr\t1.5\t1200",
      "Shop B\tJane\t01712345679\tChittagong\tAddr 2\t2\t500",
    ].join("\n")
    const result = parseImportText(tsv)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.__line)).toEqual([2, 3])
    expect(result.rows[1].values.delivery_city).toBe("Chittagong")
  })

  it("rejects files over the 50-row limit and states the actual count", () => {
    const body = Array.from(
      { length: 51 },
      (_, i) => `Shop A,Name ${i},01712345678,Dhaka,Addr,1,100`,
    ).join("\n")
    const result = parseImportText(`${HEADER}\n${body}`)
    expect(result).toEqual({
      ok: false,
      error: "This file has 51 rows. You can import up to 50 rows at a time.",
    })
  })

  it("skips fully-empty rows but keeps physical line numbers", () => {
    const result = parseImportText(
      `${HEADER}\nShop A,John,01712345678,Dhaka,Addr,1,100\n\n   \nShop B,Jane,01712345679,Chittagong,Addr,2,500`,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.__line)).toEqual([2, 5])
  })

  it("rejects empty input", () => {
    expect(parseImportText("   \n ")).toEqual({
      ok: false,
      error: expect.stringContaining("Nothing to import"),
    })
  })

  it("rejects a header-only file", () => {
    expect(parseImportText(HEADER)).toEqual({
      ok: false,
      error: expect.stringContaining("No data rows found"),
    })
  })
})

describe("decodeUtf8", () => {
  it("decodes valid UTF-8 and strips the BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62])
    const result = decodeUtf8(bytes)
    expect(result).toEqual({ ok: true, text: "a,b" })
  })

  it("rejects bytes that are not UTF-8", () => {
    const bytes = new Uint8Array([0x61, 0xff, 0xfe, 0x62])
    expect(decodeUtf8(bytes)).toEqual({ ok: false, error: UTF8_ERROR })
  })

  it("rejects replacement characters in the decoded text", () => {
    const bytes = new TextEncoder().encode("a,\uFFFD b")
    expect(decodeUtf8(bytes)).toEqual({ ok: false, error: UTF8_ERROR })
  })
})

describe("parseImportFile", () => {
  it("parses a valid .csv file", () => {
    const result = parseImportFile(
      file("orders.csv", `${HEADER}\nShop A,John,01712345678,Dhaka,Addr,1,100`),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
  })

  it("rejects non-.csv files", () => {
    const result = parseImportFile(file("orders.xlsx", "a,b"))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(".csv")
  })

  it("rejects files over 2 MB and states both sizes", () => {
    const result = parseImportFile({
      name: "orders.csv",
      size: 3 * 1024 * 1024,
      buffer: new Uint8Array(0),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("3 MB")
    expect(result.error).toContain("2 MB")
    expect(MAX_IMPORT_BYTES).toBe(2 * 1024 * 1024)
  })

  it("surfaces the UTF-8 error for undecodable files", () => {
    const buffer = new Uint8Array([0x68, 0x69, 0xff])
    const result = parseImportFile({ name: "orders.csv", size: 3, buffer })
    expect(result).toEqual({ ok: false, error: UTF8_ERROR })
  })
})
