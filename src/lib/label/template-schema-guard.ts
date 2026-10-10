import type { Template } from "@pdfme/common"
import { checkTemplate } from "@pdfme/common"
import {
  LABEL_MAX_ELEMENTS,
  LABEL_QR_MIN_MM,
  LABEL_TEMPLATE_MAX_MM,
  LABEL_TEMPLATE_MIN_MM,
} from "@/lib/constants"

/**
 * The single gate every label template passes to become live.
 *
 * Called on create, update and publish, so no row can reach the table that the
 * print path cannot generate. The QR floor here is re-applied in
 * `generate-pdf.ts` as a second guard — shrinking the label must never produce
 * a code a camera cannot read.
 */
export function validatePdfmeTemplate(t: Template): boolean {
  try {
    checkTemplate(t)
    if (!t.basePdf || typeof t.basePdf !== "object") return false
    const bp: any = t.basePdf
    const w = Number(bp.width)
    const h = Number(bp.height)
    const p = Array.isArray(bp.padding) ? bp.padding : [0, 0, 0, 0]
    if (
      ![w, h].every(
        (n) =>
          Number.isInteger(n) &&
          n >= LABEL_TEMPLATE_MIN_MM &&
          n <= LABEL_TEMPLATE_MAX_MM,
      )
    )
      return false
    if (p.some((n: any) => Number.isFinite(n) && n > 5)) return false
    const schemas = t.schemas ?? []
    if (schemas.length !== 1) return false
    const elements = schemas[0] ?? []
    if (elements.length > LABEL_MAX_ELEMENTS) return false
    const allowed = new Set([
      "text",
      "image",
      "line",
      "rectangle",
      "qrcode",
      "code128",
    ])
    const names = new Set<string>()
    for (const el of elements as any[]) {
      const type = String(el?.type ?? "")
      if (!allowed.has(type)) return false
      const name = String(el?.name ?? "")
      if (name === "") return false
      if (names.has(name)) return false
      names.add(name)
      const x = Number(el?.position?.x)
      const y = Number(el?.position?.y)
      const ew = Number(el?.width)
      const eh = Number(el?.height)
      if ([x, y, ew, eh].some((n) => !Number.isFinite(n) || n < 0)) return false
      if (x + ew > w + 1e-3 || y + eh > h + 1e-3) return false
      if (type === "qrcode") {
        if (ew < LABEL_QR_MIN_MM || eh < LABEL_QR_MIN_MM) return false
        if (Math.abs(ew - eh) > 1) return false
      }
    }
    return true
  } catch {
    return false
  }
}
