export function printOrDownload(
  pdf: Uint8Array,
  _filename = "label.pdf",
): void {
  const blob = new Blob([pdf as any], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const ua = navigator.userAgent
  const mobile = /iPhone|iPad|Android/i.test(ua)
  if (mobile) {
    window.open(url, "_blank")
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.src = url
  iframe.onload = () => {
    try {
      iframe.contentWindow?.print()
    } catch {
      window.open(url, "_blank")
    }
  }
  document.body.appendChild(iframe)
  setTimeout(() => {
    URL.revokeObjectURL(url)
    iframe.remove()
  }, 60_000)
}

/** The same PDF as a download — the fallback when the print dialog is blocked. */
export function downloadPdf(pdf: Uint8Array, filename = "label.pdf"): void {
  const blob = new Blob([pdf as any], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
