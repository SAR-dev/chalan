import { barcodes, image, line, rectangle, text } from "@pdfme/schemas"

/**
 * The plugin registry every label render passes to pdfme.
 *
 * Register these explicitly: in pdfme v6 `builtInPlugins` contains only `Text`,
 * so an omitted type fails at *generate* time with `"<type>" is not found in
 * plugins` — a runtime error on a print, not a build error. Keep this in step
 * with the allowed-type list in `template-schema-guard.ts`.
 */
export const labelPlugins = {
  Text: text,
  Image: image,
  Line: line,
  Rectangle: rectangle,
  QR: barcodes.qrcode,
  Code128: barcodes.code128,
} as const
