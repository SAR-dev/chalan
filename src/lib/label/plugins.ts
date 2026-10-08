import { barcodes, image, line, rectangle, text } from "@pdfme/schemas"

export const labelPlugins = {
  Text: text,
  Image: image,
  Line: line,
  Rectangle: rectangle,
  QR: barcodes.qrcode,
  Code128: barcodes.code128,
} as const
