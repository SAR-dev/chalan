import type { Font, Template } from "@pdfme/common"
import { generate } from "@pdfme/generator"
import { LABEL_QR_MIN_MM } from "@/lib/constants"
import { clampQrSizeMm } from "@/lib/label-layout"
import { labelPlugins } from "./plugins"

export async function generateLabelPdf(
  template: Template,
  inputs: Record<string, string>[],
  font: Font,
): Promise<Uint8Array> {
  const t = JSON.parse(JSON.stringify(template)) as Template
  const schema = t.schemas?.[0] ?? []
  for (const s of schema as any[]) {
    if (s?.type === "qrcode") {
      const size = Number(s?.width ?? 0)
      if (!Number.isNaN(size)) {
        const cl = clampQrSizeMm(size)
        if (cl < LABEL_QR_MIN_MM) {
          s.width = LABEL_QR_MIN_MM
          s.height = LABEL_QR_MIN_MM
        } else {
          s.width = cl
          s.height = cl
        }
      }
    }
  }
  const pdf = await generate({
    template: t,
    inputs,
    plugins: labelPlugins,
    options: { font },
  })
  return pdf
}
