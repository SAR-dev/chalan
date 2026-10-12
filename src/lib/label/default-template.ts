import type { Template } from "@pdfme/common"
import {
  LABEL_DEFAULT_HEIGHT_MM,
  LABEL_DEFAULT_WIDTH_MM,
  LABEL_QR_MIN_MM,
} from "@/lib/constants"

// Default 100×150 mm thermal parcel label.
//
//   ┌──────────────────────────────┐
//   │ ■ BRAND              ORD-ID ■│  header band (white on black)
//   │ [  QR  ]  DESTINATION        │
//   │ [      ]  City (large)       │
//   │ [      ]  WEIGHT  1.5 kg     │
//   │──────────────────────────────│
//   │ DELIVER TO                   │
//   │ Recipient name               │
//   │ Phone                        │
//   │ Address (up to ~4 lines)     │
//   │──────────────────────────────│
//   │ FROM  Merchant               │
//   │ ┌──────────────────────────┐ │
//   │ │     CASH ON DELIVERY     │ │
//   │ │      COD 1,250 TK        │ │
//   │ └──────────────────────────┘ │
//   │           site url           │
//   └──────────────────────────────┘
//
// Rules this layout follows:
// - Font sizes are in POINTS (pdfme converts width/height/position from mm but
//   passes fontSize straight through). Nothing is under 7pt: smaller is
//   unreadable on a 203dpi thermal head.
// - pdfme has no bold switch. Bold fields name the bold font through
//   `fontName: "LabelSansBold"` (registered in `src/lib/label/fonts.ts`);
//   everything else uses the fallback regular font. Both fonts carry Latin and
//   Bangla.
// - Free-text fields (name, address, city) use `dynamicFontSize` so a long
//   Bangla or English value shrinks to fit instead of being clipped.
// - Black and mid-grey only — thermal printers dither colour.
// - Static captions are `readOnly`: they print their `content` and are not
//   bound to order data (see `buildLabelInputs`).
// - Every element stays inside the 4–5 mm print-safe margin and the QR keeps
//   its scannable floor (`LABEL_QR_MIN_MM`).

const BOLD = "LabelSansBold"
const CAPTION = "#555555"

export const DEFAULT_LABEL_TEMPLATE_PDFME: Template = {
  basePdf: {
    width: LABEL_DEFAULT_WIDTH_MM,
    height: LABEL_DEFAULT_HEIGHT_MM,
    padding: [0, 0, 0, 0],
  },
  schemas: [
    [
      // --- Header band -----------------------------------------------------
      {
        name: "headerBand",
        type: "rectangle",
        position: { x: 0, y: 0 },
        width: LABEL_DEFAULT_WIDTH_MM,
        height: 14,
        color: "#000000",
        borderColor: "#000000",
        borderWidth: 0,
      },
      {
        name: "siteName",
        type: "text",
        position: { x: 5, y: 3 },
        width: 50,
        height: 8,
        fontName: BOLD,
        fontSize: 14,
        fontColor: "#ffffff",
        lineHeight: 1.1,
        verticalAlignment: "middle",
        dynamicFontSize: { min: 9, max: 14, fit: "horizontal" },
      },
      {
        name: "orderId",
        type: "text",
        position: { x: 55, y: 3 },
        width: 40,
        height: 8,
        fontName: BOLD,
        fontSize: 11,
        fontColor: "#ffffff",
        alignment: "right",
        verticalAlignment: "middle",
        lineHeight: 1.1,
        dynamicFontSize: { min: 8, max: 11, fit: "horizontal" },
      },

      // --- QR + routing ------------------------------------------------------
      {
        name: "qr",
        type: "qrcode",
        position: { x: 5, y: 18 },
        width: LABEL_QR_MIN_MM + 6,
        height: LABEL_QR_MIN_MM + 6,
      },
      {
        name: "captionDestination",
        type: "text",
        readOnly: true,
        content: "DESTINATION",
        position: { x: 46, y: 18 },
        width: 49,
        height: 4,
        fontSize: 7,
        fontColor: CAPTION,
        lineHeight: 1.1,
      },
      {
        name: "destinationCity",
        type: "text",
        position: { x: 46, y: 22 },
        width: 49,
        height: 13,
        fontName: BOLD,
        fontSize: 22,
        lineHeight: 1.1,
        verticalAlignment: "middle",
        dynamicFontSize: { min: 10, max: 22, fit: "horizontal" },
      },
      {
        name: "captionWeight",
        type: "text",
        readOnly: true,
        content: "WEIGHT",
        position: { x: 46, y: 38 },
        width: 49,
        height: 4,
        fontSize: 7,
        fontColor: CAPTION,
        lineHeight: 1.1,
      },
      {
        name: "weight",
        type: "text",
        position: { x: 46, y: 42 },
        width: 49,
        height: 8,
        fontName: BOLD,
        fontSize: 14,
        lineHeight: 1.1,
        verticalAlignment: "middle",
      },

      // --- Recipient ---------------------------------------------------------
      {
        name: "separatorTop",
        type: "line",
        position: { x: 5, y: 58 },
        width: 90,
        height: 0.4,
        color: "#000000",
      },
      {
        name: "captionTo",
        type: "text",
        readOnly: true,
        content: "DELIVER TO",
        position: { x: 5, y: 60 },
        width: 90,
        height: 4,
        fontSize: 7,
        fontColor: CAPTION,
        lineHeight: 1.1,
      },
      {
        name: "recipientName",
        type: "text",
        position: { x: 5, y: 64 },
        width: 90,
        height: 8,
        fontName: BOLD,
        fontSize: 14,
        lineHeight: 1.15,
        verticalAlignment: "middle",
        dynamicFontSize: { min: 9, max: 14, fit: "horizontal" },
      },
      {
        name: "recipientPhone",
        type: "text",
        position: { x: 5, y: 72 },
        width: 90,
        height: 7,
        fontName: BOLD,
        fontSize: 13,
        lineHeight: 1.15,
        verticalAlignment: "middle",
      },
      {
        name: "recipientAddress",
        type: "text",
        position: { x: 5, y: 80 },
        width: 90,
        height: 22,
        // 22 mm ≈ 62 pt: four lines at 11 pt × 1.3. Longer addresses shrink
        // (down to 8 pt) rather than being clipped.
        fontSize: 11,
        lineHeight: 1.3,
        dynamicFontSize: { min: 8, max: 11, fit: "vertical" },
      },

      // --- Sender ------------------------------------------------------------
      {
        name: "separatorMid",
        type: "line",
        position: { x: 5, y: 104 },
        width: 90,
        height: 0.4,
        color: "#000000",
      },
      {
        name: "captionFrom",
        type: "text",
        readOnly: true,
        content: "FROM",
        position: { x: 5, y: 106 },
        width: 90,
        height: 4,
        fontSize: 7,
        fontColor: CAPTION,
        lineHeight: 1.1,
      },
      {
        name: "merchantName",
        type: "text",
        position: { x: 5, y: 110 },
        width: 90,
        height: 7,
        fontSize: 11,
        lineHeight: 1.15,
        verticalAlignment: "middle",
        dynamicFontSize: { min: 8, max: 11, fit: "horizontal" },
      },

      // --- Cash on delivery --------------------------------------------------
      {
        name: "codBox",
        type: "rectangle",
        position: { x: 5, y: 120 },
        width: 90,
        height: 20,
        color: "",
        borderColor: "#000000",
        borderWidth: 0.8,
      },
      {
        name: "captionCod",
        type: "text",
        readOnly: true,
        content: "CASH ON DELIVERY",
        position: { x: 8, y: 122 },
        width: 84,
        height: 4,
        fontSize: 7,
        fontColor: CAPTION,
        alignment: "center",
        lineHeight: 1.1,
      },
      {
        name: "codAmount",
        type: "text",
        position: { x: 8, y: 127 },
        width: 84,
        height: 11,
        fontName: BOLD,
        fontSize: 20,
        alignment: "center",
        verticalAlignment: "middle",
        lineHeight: 1.1,
        dynamicFontSize: { min: 12, max: 20, fit: "horizontal" },
      },

      // --- Footer ------------------------------------------------------------
      {
        name: "siteUrl",
        type: "text",
        position: { x: 5, y: 143 },
        width: 90,
        height: 5,
        fontSize: 7,
        fontColor: CAPTION,
        alignment: "center",
        verticalAlignment: "middle",
        lineHeight: 1.1,
      },
    ],
  ],
}
