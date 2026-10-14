"use client"

import type { Font, Template } from "@pdfme/common"
import { useEffect, useState } from "react"
import { loadLabelFont } from "@/lib/label/fonts"
import { generateLabelImage } from "@/lib/label/generate-image"

interface LabelPreviewProps {
  template: Template
  inputs: Record<string, string>[]
  /** Test hook for the designer's Preview tab. */
  testId?: string
}

/** CSS pixels per millimetre, at the browser's 96 dpi default. */
const PX_PER_MM = 3.7795

/** Longest edge of the preview frame, so an oversized template still fits. */
const MAX_PREVIEW_PX = 560

/**
 * Debounce for regenerating the preview, in ms.
 *
 * The designer fires a change on every drag step and every keystroke. Rendering
 * is a full generate — font subsetting, then a PDF, then a raster — which is far
 * too slow to run per frame, so the preview settles a moment after the editing
 * stops.
 */
const RENDER_DEBOUNCE_MS = 250

/**
 * A plain preview of the label as it will actually print.
 *
 * This rendered through pdfme's `Viewer` before, which drew the PDF to a canvas
 * and wrapped it in a toolbar — zoom, page navigation — on a one-page label
 * where none of it applies. It also injects a large global stylesheet into the
 * page, which fights the surrounding UI.
 *
 * It then embedded the generated PDF in an `<iframe>`, which was faithful but
 * wrong for a preview: the browser draws its own PDF chrome, so the frame came
 * with scrollbars and a viewer background that broke the card it sat in, and the
 * sizing had to be guessed rather than derived from the bitmap.
 *
 * Now it is a plain `<img>` of the rasterised label. The bitmap comes from
 * `generateLabelImage`, which rasterises the *same* PDF the print path emits —
 * so this is still the real label and not an approximation, and the intrinsic
 * size of the image is what the frame is sized from.
 *
 * Printing is untouched and stays vector; see `generate-image.ts`.
 */
export function LabelPreview({ template, inputs, testId }: LabelPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const timer = setTimeout(() => {
      loadLabelFont()
        .then(async (font: Font) => {
          if (cancelled) return
          const blob = await generateLabelImage(template, inputs, font)
          if (cancelled) return
          // A fresh URL per render; the previous one is revoked on the next
          // change and on unmount so blob memory never accumulates while a
          // template is being dragged around.
          objectUrl = URL.createObjectURL(blob)
          setImageUrl(objectUrl)
          setError(null)
        })
        .catch(() => {
          if (!cancelled) setError("The preview could not be rendered.")
        })
    }, RENDER_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [template, inputs])

  // Frame the label at roughly its physical size, capped so a template scaled
  // well past the default still sits inside the card.
  const base = template.basePdf as { width?: number; height?: number }
  const widthMm = Number(base?.width) > 0 ? Number(base.width) : 100
  const heightMm = Number(base?.height) > 0 ? Number(base.height) : 150
  const scale = Math.min(1, MAX_PREVIEW_PX / (heightMm * PX_PER_MM))
  const width = Math.round(widthMm * PX_PER_MM * scale)
  const height = Math.round(heightMm * PX_PER_MM * scale)

  return (
    <div data-testid={testId} className="flex justify-center">
      {error ? (
        <p className="text-muted-foreground text-sm">{error}</p>
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={`Label preview: ${widthMm} by ${heightMm} millimetres`}
          className="bg-white rounded border shadow-sm"
          style={{ width, height, display: "block" }}
          data-testid="label-preview-image"
        />
      ) : (
        <div
          className="bg-muted rounded border"
          style={{ width, height }}
          aria-hidden
        />
      )}
    </div>
  )
}
