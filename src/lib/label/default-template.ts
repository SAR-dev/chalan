import type { Template } from "@pdfme/common"
import {
  LABEL_DEFAULT_HEIGHT_MM,
  LABEL_DEFAULT_WIDTH_MM,
  LABEL_QR_MIN_MM,
} from "@/lib/constants"

export const DEFAULT_LABEL_TEMPLATE_PDFME: Template = {
  basePdf: {
    width: LABEL_DEFAULT_WIDTH_MM,
    height: LABEL_DEFAULT_HEIGHT_MM,
    padding: [0, 0, 0, 0],
  },
  schemas: [
    [
      {
        name: "qr",
        type: "qrcode",
        position: { x: 5, y: 5 },
        width: LABEL_QR_MIN_MM,
        height: LABEL_QR_MIN_MM,
      },
      {
        name: "orderId",
        type: "text",
        position: { x: 40, y: 5 },
        width: 55,
        height: 8,
        // Font sizes are in POINTS (pdfme converts width/height/position from mm
        // but passes fontSize straight through to pdf-lib). A 100×150 mm label
        // printed at 2.5pt is sub-millimetre text — unreadable at the counter and
        // the reason a label can look like "just a QR code" on screen. Every
        // field below stays inside its own box: line height is
        // size × lineHeight, and each height leaves room for it.
        fontSize: 10,
        fontWeight: "bold",
        lineHeight: 1.25,
      },
      {
        name: "recipientName",
        type: "text",
        position: { x: 5, y: 38 },
        width: 90,
        height: 8,
        fontSize: 11,
        fontWeight: "bold",
        lineHeight: 1.25,
      },
      {
        name: "recipientPhone",
        type: "text",
        position: { x: 5, y: 46 },
        width: 90,
        height: 6,
        fontSize: 10,
        lineHeight: 1.25,
      },
      {
        name: "recipientAddress",
        type: "text",
        position: { x: 5, y: 52 },
        width: 90,
        height: 24,
        // 24mm / (10pt × 1.25) is five wrapped lines before clipping.
        fontSize: 10,
        lineHeight: 1.25,
      },
      {
        name: "separator",
        type: "line",
        position: { x: 5, y: 78 },
        width: 90,
        height: 0.3,
      },
      {
        name: "merchantName",
        type: "text",
        position: { x: 5, y: 82 },
        width: 90,
        height: 5,
        fontSize: 9,
        lineHeight: 1.25,
      },
      {
        name: "destinationCity",
        type: "text",
        position: { x: 5, y: 88 },
        width: 45,
        height: 5,
        fontSize: 9,
        lineHeight: 1.25,
      },
      {
        name: "weight",
        type: "text",
        position: { x: 50, y: 88 },
        width: 45,
        height: 5,
        fontSize: 9,
        lineHeight: 1.25,
      },
      {
        name: "codAmount",
        type: "text",
        position: { x: 5, y: 94 },
        width: 90,
        height: 5,
        fontSize: 10,
        fontWeight: "bold",
        lineHeight: 1.25,
      },
    ],
  ],
}
