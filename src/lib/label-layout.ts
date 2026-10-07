import {
  LABEL_DEFAULT_HEIGHT_MM,
  LABEL_DEFAULT_WIDTH_MM,
  LABEL_QR_MIN_MM,
  LABEL_TEMPLATE_MAX_MM,
  type LabelFieldKey,
  type LabelFontScale,
} from "@/lib/constants"
import { formatMoney } from "@/lib/format"
import type { LabelBlock } from "@/lib/validation"

// =============================================================================
// Parcel label layout (R5)
//
// Pure helpers behind `LabelRenderer`. Kept out of the component so the block
// semantics — field resolution, the QR size floor, the physical font scale —
// are unit-testable without a DOM, and so a future vector PDF renderer can
// consume the same block array without copying rules out of JSX.
// =============================================================================

/** The order-derived values a label block can render. */
export interface LabelData {
  orderId: string
  merchantName: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  destinationCity?: string | null
  weightKg: number
  codAmount: number
  /** Opaque per-parcel code a `qr` block encodes. R9 matches against it. */
  qrValue: string
  /** Optional logo source (storage URL) for a `logo` block. */
  logoUrl?: string | null
}

/** Font size per scale step, in millimetres — physical, so print equals screen. */
export const LABEL_SCALE_MM: Record<LabelFontScale, number> = {
  xs: 2.5,
  s: 3,
  m: 4,
  l: 5.5,
  xl: 7,
}

/**
 * The shape of the single platform label template — physical size plus the
 * ordered block stack. `label_template.blocks` stores exactly this array; the
 * fallback below is what the print action uses until an admin publishes one.
 */
export interface LabelTemplateStructure {
  widthMm: number
  heightMm: number
  blocks: LabelBlock[]
}

/**
 * The built-in fallback label.
 *
 * R5's one template is admin-authored and stored in `label_template`, but the
 * quick-print action on the order lists must work before that row exists (and if
 * it is ever cleared). This is that default: the 100×150mm label carrying the QR,
 * order reference, recipient name and phone, address, then merchant/weight/COD at
 * the foot. The designer will edit this shape; the print path only reads it.
 */
export const DEFAULT_LABEL_TEMPLATE: LabelTemplateStructure = {
  widthMm: LABEL_DEFAULT_WIDTH_MM,
  heightMm: LABEL_DEFAULT_HEIGHT_MM,
  blocks: [
    { type: "qr", minSizeMm: LABEL_QR_MIN_MM, caption: true },
    { type: "field", field: "orderId", scale: "l", bold: true, width: "full" },
    {
      type: "field",
      field: "recipientName",
      scale: "m",
      bold: true,
      width: "full",
    },
    {
      type: "field",
      field: "recipientPhone",
      scale: "m",
      bold: false,
      width: "full",
    },
    {
      type: "field",
      field: "recipientAddress",
      scale: "s",
      bold: false,
      width: "full",
    },
    { type: "separator" },
    {
      type: "field",
      field: "merchantName",
      scale: "xs",
      bold: false,
      width: "full",
    },
    {
      type: "field",
      field: "destinationCity",
      scale: "s",
      bold: false,
      width: "half",
    },
    { type: "field", field: "weight", scale: "s", bold: false, width: "half" },
    // COD prints small at the foot on purpose: the label is on the outside of
    // the box, so a large figure advertises what is inside to anyone who can see
    // the parcel. See `WORKLOG.md` → *The admin label designer*.
    {
      type: "field",
      field: "codAmount",
      scale: "xs",
      bold: true,
      width: "full",
    },
  ],
}

/**
 * Representative order values for the designer's live preview.
 *
 * Not a real order — the designer edits a layout, not data — so the preview
 * uses one stable, obviously-fake row. Using a real order would leak a
 * customer's name and phone into a settings screen, and using empty strings
 * would make every field block look broken.
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
 * `minSizeMm` may raise the size but never lower it: a `qr` block cannot ask
 * for a code a scanner would fail to read, however the template is scaled.
 */
export function clampQrSizeMm(minSizeMm: number): number {
  return Math.min(Math.max(minSizeMm, LABEL_QR_MIN_MM), LABEL_TEMPLATE_MAX_MM)
}

/** Resolve a `field` block to the text it prints, or "" when there is no value. */
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
  }
}

/** A stable React key for a block — the stored array carries no ids. */
export function labelBlockKey(
  block: Pick<LabelBlock, "type"> & { field?: string },
  index: number,
): string {
  return block.type === "field" && block.field
    ? `${block.type}-${block.field}-${index}`
    : `${block.type}-${index}`
}
