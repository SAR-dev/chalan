// Reads the text back out of a pdfme-generated label PDF.
//
// A label that prints without its wording — just a QR code on an otherwise
// blank sheet — is invisible to every assertion about page size, page count or
// "the download button re-enabled itself". Those all pass. Only looking at the
// drawn text catches it, which is why this exists rather than a `toContain`
// over the raw bytes: pdfme subsets the font and stores the strings as glyph
// IDs, so the content stream never contains the words the merchant typed. The
// mapping back to readable text is the embedded font's ToUnicode CMap.
//
// Used by the PDF unit spec and available to Playwright, so a label's wording
// is asserted from the same code on both sides.

import { inflateRawSync, inflateSync } from "node:zlib"

/** Glyph id → Unicode, from a subset font's ToUnicode CMap. */
function parseCMap(parts: string[]): Map<number, string> {
  const map = new Map<number, string>()
  const cmap = parts.find(
    (p) => p.includes("beginbfchar") || p.includes("beginbfrange"),
  )
  if (!cmap) return map

  // Single-character mappings: <glyph> <unicode>
  for (const block of cmap.matchAll(/beginbfchar\s*([\s\S]*?)\s*endbfchar/g)) {
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      map.set(
        parseInt(entry[1], 16),
        String.fromCharCode(parseInt(entry[2], 16)),
      )
    }
  }

  // Contiguous runs: <low> <high> <first unicode>
  for (const block of cmap.matchAll(
    /beginbfrange\s*([\s\S]*?)\s*endbfrange/g,
  )) {
    for (const entry of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const low = parseInt(entry[1], 16)
      const high = parseInt(entry[2], 16)
      let code = parseInt(entry[3], 16)
      for (let glyph = low; glyph <= high; glyph++, code++) {
        map.set(glyph, String.fromCharCode(code))
      }
    }
  }

  return map
}

/** Every FlateDecode stream in the file, inflated. */
function inflateAll(latin: string): string[] {
  const out: string[] = []
  for (const match of latin.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const raw = Buffer.from(match[1], "latin1")
    // pdfme's producer emits zlib-wrapped streams; handle raw-deflate too so a
    // producer change does not silently blank this helper out.
    try {
      out.push(inflateSync(raw).toString("latin1"))
    } catch {
      try {
        out.push(inflateRawSync(raw).toString("latin1"))
      } catch {
        // Not an inflated stream (or corrupt) — skip it.
      }
    }
  }
  return out
}

/**
 * The strings pdfme drew on the page, in drawing order.
 *
 * Glyph ids are read as 2-byte (Identity-H) codes and mapped through the
 * subset font's ToUnicode CMap. A glyph with no mapping decodes to
 * U+FFFD rather than being dropped, so a font that fails to subset shows up as
 * replacement characters instead of vanishing text.
 */
export function extractPdfText(pdf: Uint8Array | ArrayBuffer): string[] {
  const bytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  const latin = Buffer.from(bytes).toString("latin1")
  const parts = inflateAll(latin)
  const cmap = parseCMap(parts)

  // The content stream is the inflated one that shows text; the others are
  // object dictionaries and the font itself.
  const content = parts.find((p) => /\bTj\b|\bTJ\b/.test(p))
  if (!content) return []

  const drawn: string[] = []
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
    const hex = match[1].replace(/\s+/g, "")
    let text = ""
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      text += cmap.get(parseInt(hex.slice(i, i + 4), 16)) ?? "\uFFFD"
    }
    drawn.push(text)
  }
  return drawn
}
