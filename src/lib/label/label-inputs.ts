import type { Template } from "@pdfme/common"
import type { LabelFieldKey } from "@/lib/constants"
import type { LabelData } from "@/lib/label-layout"
import { resolveLabelField } from "@/lib/label-layout"

function isLabelFieldKey(name: string): name is LabelFieldKey {
  return (
    name === "orderId" ||
    name === "recipientName" ||
    name === "recipientPhone" ||
    name === "recipientAddress" ||
    name === "merchantName" ||
    name === "destinationCity" ||
    name === "weight" ||
    name === "codAmount" ||
    name === "siteName" ||
    name === "siteUrl"
  )
}

export function buildLabelInputs(
  template: Template,
  data: LabelData,
  logoDataUri?: string,
): Record<string, string>[] {
  const input: Record<string, string> = {}
  const schema = template.schemas?.[0] ?? []
  for (const s of schema as any[]) {
    const name = String(s?.name ?? "")
    if (s?.readOnly) continue
    if (isLabelFieldKey(name)) {
      input[name] = resolveLabelField(data, name)
    } else if (s?.type === "qrcode" || name.startsWith("qr")) {
      input[name] = data.qrValue
    } else if (name === "logo") {
      input[name] = logoDataUri ?? ""
    } else {
      input[name] = (s as { content?: string })?.content ?? ""
    }
  }
  return [input]
}
