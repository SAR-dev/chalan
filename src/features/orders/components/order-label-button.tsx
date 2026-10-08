"use client"

import { Download, Printer } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { formLabels } from "@/config/content"
import { siteConfig } from "@/config/site"
import {
  LABEL_DEFAULT_HEIGHT_MM,
  LABEL_DEFAULT_WIDTH_MM,
} from "@/lib/constants"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import type { LabelData, LabelTemplateStructure } from "@/lib/label-layout"
import { toast } from "@/lib/notify"
import type { Order } from "@/lib/types"

// =============================================================================
// Quick-print parcel label (R5)
//
// The reusable "print this parcel's label" action. It generates a vector PDF
// through the pdfme engine and hands it to the browser's print dialog — so a
// warehouse admin or rider can label a parcel straight from the list they are
// already looking at, with no round trip and no second screen.
//
// The QR encodes the order reference (`order.id`): it is stored on the order,
// unique, carries no personal data, and is already present in every list payload
// the warehouse and rider tables receive — so the same parcel prints the same
// code for whoever prints it, and a reprint never silently changes it. R9 owns
// what a scan does with the value.
// =============================================================================

/** The order reference, shaped for the label. Exported for unit testing. */
export function orderToLabelData(
  order: Order,
  merchantName: string,
): LabelData {
  return {
    orderId: order.id,
    merchantName,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    recipientAddress: [order.deliveryCity, order.deliveryAddress]
      .filter(Boolean)
      .join(", "),
    destinationCity: order.deliveryCity ?? "",
    weightKg: order.parcelWeightKg,
    codAmount: order.productCost,
    qrValue: order.id,
    siteName: siteConfig.name,
    siteUrl: siteConfig.siteUrl,
  }
}

export interface OrderLabelButtonProps {
  order: Order
  /** Merchant business name; the caller already resolves it for other columns. */
  merchantName?: string
  /** The published template, when the designer has one. Falls back to the built-in. */
  template?: LabelTemplateStructure
  /** Render the label text beside the icon (board cards) instead of icon-only (tables). */
  showLabel?: boolean
  variant?: "ghost" | "outline"
  className?: string
}

export function OrderLabelButton({
  order,
  merchantName = "",
  template = {
    widthMm: LABEL_DEFAULT_WIDTH_MM,
    heightMm: LABEL_DEFAULT_HEIGHT_MM,
    logoRef: null,
    template: DEFAULT_LABEL_TEMPLATE_PDFME,
  },
  showLabel = false,
  variant = "ghost",
  className,
}: OrderLabelButtonProps) {
  const [generating, setGenerating] = useState(false)

  const data = orderToLabelData(order, merchantName)
  const ariaLabel = `${formLabels.printLabel} ${order.id}`

  async function handlePdfme(mode: "print" | "download"): Promise<void> {
    if (generating) return
    setGenerating(true)
    try {
      // Dynamic imports: the PDF engine (and its font machinery) loads only on
      // the click that needs it, never into every list that shows the button.
      const [
        { generateLabelPdf },
        { buildLabelInputs },
        { loadLabelFont },
        { printOrDownload, downloadPdf },
        { fetchLogoDataUri },
      ] = await Promise.all([
        import("@/lib/label/generate-pdf"),
        import("@/lib/label/label-inputs"),
        import("@/lib/label/fonts"),
        import("@/lib/label/print"),
        import("@/lib/label/logo"),
      ])
      const [font, logoDataUri] = await Promise.all([
        loadLabelFont(),
        template.logoRef ? fetchLogoDataUri(template.logoRef) : undefined,
      ])
      const inputs = buildLabelInputs(template.template, data, logoDataUri)
      const pdf = await generateLabelPdf(template.template, inputs, font)
      if (mode === "download") {
        downloadPdf(pdf, `label-${order.id}.pdf`)
      } else {
        printOrDownload(pdf, `label-${order.id}.pdf`)
      }
    } catch {
      toast.error("Could not generate the label PDF. Try Download instead.")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={showLabel ? "sm" : "icon"}
        className={showLabel ? className : `size-8 ${className ?? ""}`.trim()}
        aria-label={ariaLabel}
        title={formLabels.printLabel}
        data-testid={`order-label-${order.id}`}
        disabled={generating}
        onClick={() => void handlePdfme("print")}
      >
        <Printer className="size-4" />
        {showLabel ? (
          formLabels.printLabel
        ) : (
          <span className="sr-only">{formLabels.printLabel}</span>
        )}
      </Button>
      <Button
        variant={variant}
        size="icon"
        className={`size-8 ${className ?? ""}`.trim()}
        aria-label={`Download label for ${order.id}`}
        title="Download label PDF"
        data-testid={`order-label-download-${order.id}`}
        disabled={generating}
        onClick={() => void handlePdfme("download")}
      >
        <Download className="size-4" />
      </Button>
    </>
  )
}
