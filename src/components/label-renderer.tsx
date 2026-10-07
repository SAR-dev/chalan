"use client"

import { QRCodeSVG } from "qrcode.react"
import {
  clampQrSizeMm,
  LABEL_SCALE_MM,
  type LabelData,
  labelBlockKey,
  resolveLabelField,
} from "@/lib/label-layout"
import type { LabelBlock } from "@/lib/validation"

// =============================================================================
// Parcel label renderer (R5)
//
// One component renders the label everywhere: the designer preview, the order
// detail print view, and (via `window.print()`) the printed label. Sizes are in
// CSS millimetres, so the screen and the printed page agree physically rather
// than approximately — which is what keeps the QR inside its scannable range.
//
// The template's block array is the source of truth; this only lays it out.
// The QR block's size is clamped to the scannable floor here, not left to the
// template author.
// =============================================================================

export interface LabelRendererProps {
  widthMm: number
  heightMm: number
  blocks: LabelBlock[]
  data: LabelData
  /** On-screen zoom; print always uses the true physical size (1). */
  scale?: number
  className?: string
  "data-testid"?: string
}

export function LabelRenderer({
  widthMm,
  heightMm,
  blocks,
  data,
  scale = 1,
  className,
  "data-testid": testId,
}: LabelRendererProps) {
  const label = (
    <div
      className={className}
      data-testid={testId}
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "2mm",
        padding: "4mm",
        overflow: "hidden",
        background: "#ffffff",
        color: "#000000",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {blocks.map((block, index) => (
        <LabelBlockView
          key={labelBlockKey(block, index)}
          block={block}
          data={data}
        />
      ))}
    </div>
  )

  if (scale === 1) return label

  return (
    <div
      style={{
        width: `${widthMm * scale}mm`,
        height: `${heightMm * scale}mm`,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {label}
      </div>
    </div>
  )
}

function LabelBlockView({
  block,
  data,
}: {
  block: LabelBlock
  data: LabelData
}) {
  switch (block.type) {
    case "logo":
      if (!data.logoUrl) return null
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.logoUrl}
          alt=""
          style={{
            width: block.width === "half" ? "50%" : "100%",
            maxHeight: "20mm",
            objectFit: "contain",
            objectPosition: "left center",
          }}
        />
      )

    case "qr": {
      const sizeMm = clampQrSizeMm(block.minSizeMm)
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1mm",
          }}
        >
          <QRCodeSVG
            value={data.qrValue}
            size={256}
            level="M"
            marginSize={4}
            title={`Parcel ${data.orderId}`}
            style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
          />
          {block.caption ? (
            <span style={{ fontSize: `${LABEL_SCALE_MM.xs}mm` }}>
              Scan to verify
            </span>
          ) : null}
        </div>
      )
    }

    case "field":
      return (
        <span
          style={{
            width: block.width === "half" ? "50%" : "100%",
            fontSize: `${LABEL_SCALE_MM[block.scale]}mm`,
            fontWeight: block.bold ? 700 : 400,
            lineHeight: 1.25,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {resolveLabelField(data, block.field)}
        </span>
      )

    case "separator":
      return (
        <span
          style={{
            width: "100%",
            borderTop: "0.3mm solid #000000",
          }}
        />
      )

    case "spacer":
      return <span style={{ height: `${block.heightMm}mm` }} />
  }
}
