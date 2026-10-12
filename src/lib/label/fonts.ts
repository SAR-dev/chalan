import type { Font } from "@pdfme/common"

// pdfme embeds fonts through fontkit, which cannot read WOFF2 glyph data: the
// PDF gets the text layer but empty glyphs ("only the QR shows"). Ship plain
// static TTFs (no variable fonts) in public/fonts/.
//
// Both files are Hind Siliguri (OFL), subset to Latin + Bangla. pdfme has no
// "bold" switch — a bold field must name the bold font via `fontName`.
//
// Why Hind Siliguri and not Noto Sans Bengali: pdfme's PDF embedder draws the
// glyphs fontkit shapes but drops GPOS mark offsets, so fonts that position
// Bangla marks (ra-phala, ya-phala, below-vowels) with GPOS come out garbled.
// Hind Siliguri needs almost none of that, so conjuncts print correctly.
const REGULAR_URL = "/fonts/LabelSans-Regular.ttf"
const BOLD_URL = "/fonts/LabelSans-Bold.ttf"

// Cache the in-flight promise so a print burst (or a designer mount)
// fetches the fonts once per session.
let fontPromise: Promise<Font> | null = null

async function fetchTtf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Label font request failed (${res.status})`)
  const arrayBuffer = await res.arrayBuffer()
  // TTF/OTF files start with 0x00010000 or "OTTO"; anything else (an HTML
  // error page, WOFF2 "wOF2") would silently produce a blank label.
  const magic = new DataView(arrayBuffer).getUint32(0)
  if (magic !== 0x00010000 && magic !== 0x4f54544f) {
    throw new Error("Label font is not a TTF/OTF file")
  }
  return arrayBuffer
}

async function fetchLabelFont(): Promise<Font> {
  const [regular, bold] = await Promise.all([
    fetchTtf(REGULAR_URL),
    fetchTtf(BOLD_URL),
  ])
  return {
    // Key kept as "NotoSansJP" so saved templates that name it keep working.
    NotoSansJP: { data: regular, fallback: true, subset: true },
    LabelSansBold: { data: bold, subset: true },
  }
}

export function loadLabelFont(): Promise<Font> {
  if (!fontPromise) {
    fontPromise = fetchLabelFont().catch((err) => {
      fontPromise = null // allow a retry after a transient failure
      throw err
    })
  }
  return fontPromise
}
