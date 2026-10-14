import type { Font, Template } from "@pdfme/common"
import { pdf2img } from "@pdfme/converter"
import { generateLabelPdf } from "@/lib/label/generate-pdf"

// =============================================================================
// The label as an image, for the designer's Preview tab.
//
// **This is a preview path only.** `generateLabelPdf` is the print path and
// stays vector, deliberately: pdfme emits vectors, which is what keeps the QR
// crisp. A rasterised label blurs the code and breaks scanning at the doorstep,
// so nothing here may be allowed to become the thing that prints.
//
// So the image is a raster of the *same* PDF, rather than a second description
// of the label drawn independently. That ordering is the whole point: if the
// preview were built from the template directly — SVG, DOM, canvas — it would be
// a second renderer that drifts from print the moment a field moves, and the
// preview's value is precisely that it cannot drift.
// =============================================================================

/**
 * Raster multiplier.
 *
 * 2, not 1: the preview renders at up to 560 CSS px on the long edge, and a
 * label rasterised at scale 1 lands near 565px of bitmap — visibly soft on any
 * 2x display. Scale 2 keeps the QR modules square at the size it is actually
 * viewed, which is the only thing on a parcel label that has to stay legible.
 *
 * Not higher because the generator runs on every debounce tick while the canvas
 * is being dragged: the bitmap is proportional to `scale²`, and 4 would make a
 * drag cost four times the memory for detail nobody can see at 560px.
 */
const PREVIEW_SCALE = 2

/**
 * Render the first label page to a PNG.
 *
 * A label is one page, so page 0 is the only one: a multi-page template is a
 * misconfiguration here and returning extra pages would mean the preview
 * silently showed a different sheet than the one that prints.
 */
export async function generateLabelImage(
  template: Template,
  inputs: Record<string, string>[],
  font: Font,
): Promise<Blob> {
  const pdf = await generateLabelPdf(template, inputs, font)

  // `pdf2img` wants a buffer it can transfer to the worker; a plain `Uint8Array`
  // view over the generator's output already is one.
  const pages = await pdf2img(pdf as Uint8Array, {
    scale: PREVIEW_SCALE,
    range: { start: 0, end: 1 },
  })

  const png = pages[0]
  if (!png) throw new Error("The label rasterised to no pages.")

  return new Blob([png], { type: "image/png" })
}
