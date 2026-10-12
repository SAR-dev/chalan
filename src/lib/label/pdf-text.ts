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

/** Every FlateDecode stream in the file, inflated and keyed by object number. */
function inflateStreams(latin: string): Map<number, string> {
  const out = new Map<number, string>()
  // The gap between an object's header and its stream must not cross another
  // `endobj`, or a compactly written file attributes one object's stream to the
  // object before it — and the font dictionary then resolves to a stream that
  // does not exist.
  for (const match of latin.matchAll(
    /(\d+)\s+0\s+obj(?:(?!endobj)[\s\S]){0,300}?stream\r?\n([\s\S]*?)endstream/g,
  )) {
    const raw = Buffer.from(match[2], "latin1")
    // pdfme's producer emits zlib-wrapped streams; handle raw-deflate too so a
    // producer change does not silently blank this helper out.
    try {
      out.set(Number(match[1]), inflateSync(raw).toString("latin1"))
    } catch {
      try {
        out.set(Number(match[1]), inflateRawSync(raw).toString("latin1"))
      } catch {
        // Not an inflated stream (or corrupt) — skip it.
      }
    }
  }
  return out
}

/**
 * Glyph id → Unicode, keyed by the font resource name the content stream
 * selects with.
 *
 * A label draws in two faces — bold fields name `LabelSansBold`, the rest fall
 * back to the regular one — and pdfme subsets **per text run**, so the content
 * stream names a dozen distinct resources (`/HindSiliguri-Bold-7098480789 11
 * Tf`) for what are only two embedded fonts. Glyph ids are font-local: `0x0041`
 * is a different character in each face, so a single shared CMap decodes
 * whichever face it was not built from into garbage. That is not cosmetic —
 * this module is the only thing that can tell a label printed its wording, so a
 * wrong map means a failing assertion at best and a false pass at worst.
 *
 * Resolution is therefore indirect: resource name → font object (from the
 * page's `/Font` resource dictionary) → its `/ToUnicode` stream. Both live in
 * a compressed object stream, so the font dictionaries are read out of its
 * offset table.
 */
function cmapsByFont(
  latin: string,
  streams: Map<number, string>,
): Map<string, Map<number, string>> {
  // Font object number → object number of its ToUnicode CMap.
  const toUnicode = new Map<number, number>()

  // The object-stream *dictionary* is uncompressed and therefore absent from the
  // inflated payload, so `/N` and `/First` (which locates the payload's offset
  // table) have to be read out of the raw file.
  for (const m of latin.matchAll(
    /(\d+)\s+0\s+obj[\s\S]{0,200}?\/Type\s*\/ObjStm[\s\S]{0,160}?\/N\s+(\d+)[\s\S]{0,160}?\/First\s+(\d+)[\s\S]{0,160}?stream/g,
  )) {
    const text = streams.get(Number(m[1]))
    if (!text) continue
    const count = Number(m[2])
    const first = Number(m[3])
    // `text.slice(0, first)` is the offset table: `count` pairs of
    // (object number, byte offset into the payload).
    const table = [...text.slice(0, first).matchAll(/\d+/g)].map((m) =>
      Number(m[0]),
    )
    for (let i = 0; i < count && i * 2 + 2 < table.length; i += 1) {
      const objNum = table[i * 2]
      const start = first + table[i * 2 + 1]
      // A generous window rather than the exact next offset: `/ToUnicode` sits
      // at the tail of a font dictionary, and stopping at the next object's
      // offset truncates it off — which reads as "this font has no CMap" and
      // decodes the whole label to replacement characters. Overlapping is
      // harmless, since only the first match inside the window is used.
      const dict = text.slice(start, start + 600)
      const toUni = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(dict)
      // Only the top-level Type0 font carries /ToUnicode; its CIDFontType2
      // descendant and the FontDescriptor do not.
      if (toUni && /\/Type\s*\/Font\b/.test(dict)) {
        toUnicode.set(objNum, Number(toUni[1]))
      }
    }
  }

  /** Object number → dictionary text, for every plain (uncompressed) object. */
  function plainObjects(latin: string): Map<number, string> {
    const out = new Map<number, string>()
    for (const m of latin.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
      out.set(Number(m[1]), m[2])
    }
    return out
  }

  // Font dictionaries stored uncompressed rather than inside an object stream.
  // pdfme always compresses, but a producer that stopped would otherwise turn
  // every glyph into U+FFFD with nothing to explain it.
  //
  // Scoped per object: a regex free to run past `endobj` reads object N's
  // dictionary as reaching into object N+1's, so the *first* object in the file
  // claims the last font's /ToUnicode and no real font resolves at all.
  const objects = plainObjects(latin)
  for (const [objNum, body] of objects) {
    if (!/\/Type\s*\/Font\b/.test(body)) continue
    const toUni = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body)
    if (toUni && !toUnicode.has(objNum)) toUnicode.set(objNum, Number(toUni[1]))
  }

  // Font resource name → font object number, from every /Font resource
  // dictionary: those inside an object stream, and those on a plain page.
  const resourceToFont = new Map<string, number>()
  const readFontDict = (text: string) => {
    // The dictionary holds no nested dictionaries, so stopping at the first
    // `>>` is safe here.
    for (const m of text.matchAll(/\/Font\s*<<([\s\S]{0,8000}?)>>/g)) {
      for (const e of m[1].matchAll(/\/([^\s/]+)\s+(\d+)\s+0\s+R/g)) {
        if (!resourceToFont.has(e[1])) resourceToFont.set(e[1], Number(e[2]))
      }
    }
  }
  for (const text of streams.values()) readFontDict(text)
  for (const body of objects.values()) readFontDict(body)

  const byResource = new Map<string, Map<number, string>>()
  for (const [name, fontObj] of resourceToFont) {
    const cmapText = toUnicode.has(fontObj)
      ? streams.get(toUnicode.get(fontObj) as number)
      : undefined
    if (!cmapText) continue
    const cmap = parseCMap([cmapText])
    if (cmap.size > 0) byResource.set(name, cmap)
  }
  return byResource
}

/**
 * The strings pdfme drew on the page, in drawing order.
 *
 * Glyph ids are read as 2-byte (Identity-H) codes and mapped through the
 * *currently selected* font's ToUnicode CMap. A glyph with no mapping decodes to
 * U+FFFD rather than being dropped, so a font that fails to subset shows up as
 * replacement characters instead of vanishing text.
 */
export function extractPdfText(pdf: Uint8Array | ArrayBuffer): string[] {
  const bytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  const latin = Buffer.from(bytes).toString("latin1")
  const streams = inflateStreams(latin)
  const cmaps = cmapsByFont(latin, streams)

  // The content stream is the inflated one that shows text; the others are
  // object dictionaries and the font itself.
  const content = [...streams.values()].find((p) => /\bTj\b|\bTJ\b/.test(p))
  if (!content) return []

  const drawn: string[] = []
  // Walk the stream in order so each Tj decodes under the font its own `Tf`
  // selected, rather than under whichever font happened to be found first.
  const tokens = content.matchAll(
    /\/([^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj/g,
  )
  let cmap: Map<number, string> | undefined
  for (const token of tokens) {
    if (token[1] !== undefined) {
      cmap = cmaps.get(token[1])
      continue
    }
    const hex = token[2].replace(/\s+/g, "")
    let text = ""
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      text += cmap?.get(parseInt(hex.slice(i, i + 4), 16)) ?? "\uFFFD"
    }
    drawn.push(text)
  }
  return drawn
}
