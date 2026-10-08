"use client"

import { Download, Printer } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { LabelRenderer } from "@/components/label-renderer"
import { Button } from "@/components/ui/button"
import { formLabels } from "@/config/content"
import { siteConfig } from "@/config/site"
import {
  DEFAULT_LABEL_TEMPLATE,
  type LabelData,
  type LabelTemplateStructure,
} from "@/lib/label-layout"
import { toast } from "@/lib/notify"
import type { Order } from "@/lib/types"

// =============================================================================
// Quick-print parcel label (R5)
//
// The reusable "print this parcel's label" action. It renders nowhere until
// clicked, then mounts the shared `<LabelRenderer>` into a print-only portal and
// hands the page to the browser's print dialog — so a warehouse admin or rider
// can label a parcel straight from the list they are already looking at, with no
// round trip and no second screen.
//
// The QR encodes the order reference (`order.id`): it is stored on the order,
// unique, carries no personal data, and is already present in every list payload
// the warehouse and rider tables receive — so the same parcel prints the same
// code for whoever prints it, and a reprint never silently changes it. R9 owns
// what a scan does with the value.
// =============================================================================

/** The order reference, shaped for the renderer. Exported for unit testing. */
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

/**
 * The print-only stylesheet.
 *
 * Two things matter and cannot be retrofitted without reprinting stock:
 * `@page` pins the physical sheet to the template's dimensions (otherwise the
 * browser silently rescales to A4 and blurs the QR), and the portal is the only
 * body child left visible while printing, so page chrome and the surrounding
 * table never bleed onto the label.
 */
export function labelPrintStyles(widthMm: number, heightMm: number): string {
  return `
    #parcel-label-print { display: none; }
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    @media print {
      body > *:not(#parcel-label-print) { display: none !important; }
      #parcel-label-print {
        display: block !important;
        position: absolute;
        inset: 0 auto auto 0;
      }
      #parcel-label-print * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `
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
  template = DEFAULT_LABEL_TEMPLATE,
  showLabel = false,
  variant = "ghost",
  className,
}: OrderLabelButtonProps) {
  const [printing, setPrinting] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Engine branch (PDF.md §7): pdfme templates generate a real PDF and hand it
  // to the browser; legacy block templates keep the portal + `window.print()`
  // flow untouched. A published engine always wins — the rollout flag only
  // decides the *fallback* template, never how a published one prints.
  const pdfmeTemplate =
    template.engine === "pdfme" && template.template ? template.template : null

  useEffect(() => {
    if (!printing) return
    let fallback = 0
    const onAfterPrint = () => setPrinting(false)
    window.addEventListener("afterprint", onAfterPrint)
    // Let the portal paint before opening the modal dialog, then print. The
    // timeout is a fallback for engines that never fire `afterprint`.
    const raf = window.requestAnimationFrame(() => {
      window.print()
      fallback = window.setTimeout(onAfterPrint, 4000)
    })
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(fallback)
      window.removeEventListener("afterprint", onAfterPrint)
    }
  }, [printing])

  const data = orderToLabelData(order, merchantName)
  const ariaLabel = `${formLabels.printLabel} ${order.id}`

  async function handlePdfme(mode: "print" | "download"): Promise<void> {
    if (!pdfmeTemplate || generating) return
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
      const inputs = buildLabelInputs(pdfmeTemplate, data, logoDataUri)
      const pdf = await generateLabelPdf(pdfmeTemplate, inputs, font)
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
        onClick={() => {
          if (pdfmeTemplate) void handlePdfme("print")
          else setPrinting(true)
        }}
      >
        <Printer className="size-4" />
        {showLabel ? (
          formLabels.printLabel
        ) : (
          <span className="sr-only">{formLabels.printLabel}</span>
        )}
      </Button>
      {pdfmeTemplate && (
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
      )}
      {printing &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="parcel-label-print">
            <style>
              {labelPrintStyles(template.widthMm, template.heightMm)}
            </style>
            <LabelRenderer
              widthMm={template.widthMm}
              heightMm={template.heightMm}
              blocks={template.blocks}
              data={data}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
