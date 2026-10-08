import type { Font } from "@pdfme/common"

// The font is a ~2 MB fetch; cache the in-flight promise so a print burst
// (or a designer mount) resolves it once per session.
let fontPromise: Promise<Font> | null = null

async function fetchLabelFont(): Promise<Font> {
  const res = await fetch("/fonts/NotoSansJP-Regular.woff2")
  const arrayBuffer = await res.arrayBuffer()
  return {
    NotoSansJP: {
      data: arrayBuffer,
      fallback: true,
      subset: true,
    },
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
