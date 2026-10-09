import { deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { extractPdfText } from "./pdf-text"

// =============================================================================
// extractPdfText — the reader behind "did the label actually print its words?".
//
// Built from synthetic PDFs rather than a generated label on purpose: the
// interesting cases (bfchar vs bfrange, an unmapped glyph, no text at all) are
// cheaper and clearer to construct here than to provoke through pdfme.
// =============================================================================

/** Wraps `body` in the objects a minimal PDF needs to be well-formed enough. */
function pdfWith(content: string, cmap: string): Uint8Array {
  const encoded = (s: string) =>
    `stream\n${deflateRawSync(Buffer.from(s, "latin1")).toString("latin1")}\nendstream`
  return Buffer.from(
    [
      "%PDF-1.7",
      `<< /Length 10 >>\n${encoded(content)}`,
      `<< /Length 10 >>\n${encoded(cmap)}`,
      "%%EOF",
    ].join("\n"),
    "latin1",
  )
}

const CONTENT = `<0041 0042 0043>Tj`
const CMAP_BFCHAR = `begincmap
3 beginbfchar
<0041> <0048>
<0042> <0069>
<0043> <0021>
endbfchar
endcmap`

describe("extractPdfText", () => {
  it("decodes glyph ids through the subset font's ToUnicode CMap", () => {
    expect(extractPdfText(pdfWith(CONTENT, CMAP_BFCHAR))).toEqual(["Hi!"])
  })

  it("decodes a contiguous bfrange run", () => {
    const content = `<0041 0042 0043 0044>Tj`
    const cmap = `begincmap
1 beginbfrange
<0041> <0044> <0041>
endbfrange
endcmap`

    expect(extractPdfText(pdfWith(content, cmap))).toEqual(["ABCD"])
  })

  it("keeps every drawn string, in drawing order", () => {
    const content = `<0041>Tj\n<0042>Tj`
    expect(extractPdfText(pdfWith(content, CMAP_BFCHAR))).toEqual(["H", "i"])
  })

  it("maps a glyph with no ToUnicode entry to U+FFFD instead of dropping it", () => {
    // A font that fails to subset shows up as replacement characters rather
    // than as text that silently disappears.
    const content = `<0041 00FF>Tj`
    expect(extractPdfText(pdfWith(content, CMAP_BFCHAR))).toEqual(["H\uFFFD"])
  })

  it("returns nothing for a PDF that draws no text", () => {
    // This is the reported "QR code only" label: the QR is vector paths, so
    // there is no text-showing operator to find.
    expect(
      extractPdfText(pdfWith("0 0 1 1 re f", "begincmap endcmap")),
    ).toEqual([])
  })

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const bytes = pdfWith(CONTENT, CMAP_BFCHAR)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    expect(extractPdfText(copy.buffer)).toEqual(["Hi!"])
  })
})
