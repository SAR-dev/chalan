import type { Template } from "@pdfme/common"
import {
  LABEL_QR_MIN_MM,
  LABEL_TEMPLATE_MAX_MM,
  type LabelFieldKey,
} from "@/lib/constants"
import { formatMoney } from "@/lib/format"

// =============================================================================
// Parcel label layout (R5)
//
// Pure helpers behind the pdfme label engine. Kept out of the component so the
// field resolution and QR size floor are unit-testable without a DOM.
// =============================================================================

/** The order-derived values a label can render. */
export interface LabelData {
  orderId: string
  merchantName: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  destinationCity?: string | null
  weightKg: number
  codAmount: number
  /** Opaque per-parcel code a QR encodes. R9 matches against it. */
  qrValue: string
  /** Optional logo source (storage URL) for a logo element. */
  logoUrl?: string | null
  /**
   * Platform identity from `src/config/site.ts`, surfaced as field values so
   * a label can carry the brand. Supplied by the constructor (print action or
   * designer preview), not baked into this pure module.
   */
  siteName?: string | null
  siteUrl?: string | null
}

/**
 * The shape of the single platform label template — physical size plus the
 * pdfme template. `label_template.template` stores the pdfme `Template` JSON.
 *
 * `template` is deliberately non-nullable: a published row with no template is
 * not a label we can print, so the reader (`usePublishedLabelTemplate`) swaps
 * in the built-in default rather than handing a `null` to the print path.
 */
export interface LabelTemplateStructure {
  widthMm: number
  heightMm: number
  logoRef?: string | null
  template: Template
}

/**
 * Representative order values for the designer's live preview.
 *
 * Not a real order — the designer edits a layout, not data — so the preview
 * uses one stable, obviously-fake row. Using a real order would leak a
 * customer's name and phone into a settings screen, and using empty strings
 * would make every field look broken.
 */
export const SAMPLE_LABEL_DATA: LabelData = {
  orderId: "ORD-100001",
  merchantName: "Demo Store",
  recipientName: "Ayesha Rahman",
  recipientPhone: "01712-345678",
  recipientAddress: "House 12, Road 5, Dhanmondi, Dhaka",
  destinationCity: "Dhaka",
  weightKg: 1.5,
  codAmount: 1250,
  qrValue: "ORD-100001",
}

/**
 * The QR code's printed edge, clamped to the scannable floor.
 *
 * A QR cannot ask for a code a scanner would fail to read, however the
 * template is scaled.
 */
export function clampQrSizeMm(minSizeMm: number): number {
  return Math.min(Math.max(minSizeMm, LABEL_QR_MIN_MM), LABEL_TEMPLATE_MAX_MM)
}

/** Resolve a field to the text it prints, or "" when there is no value. */
export function resolveLabelField(
  data: LabelData,
  field: LabelFieldKey,
): string {
  switch (field) {
    case "orderId":
      return data.orderId
    case "recipientName":
      return data.recipientName
    case "recipientPhone":
      return data.recipientPhone
    case "recipientAddress":
      return data.recipientAddress
    case "merchantName":
      return data.merchantName
    case "destinationCity":
      return data.destinationCity ?? ""
    case "weight":
      return `${data.weightKg} kg`
    case "codAmount":
      return `COD ${formatMoney(data.codAmount)}`
    case "siteName":
      return data.siteName ?? ""
    case "siteUrl":
      return data.siteUrl ?? ""
  }
}
