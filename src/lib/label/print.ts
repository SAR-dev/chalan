/**
 * Printing a generated label.
 *
 * The awkward part is that a blob PDF navigated into an iframe is handed to the
 * browser's built-in PDF viewer, which renders in its *own* origin — so
 * `iframe.contentWindow.print()` from the page either throws or silently prints
 * nothing. The fix is to make the frame a same-origin document we control, and
 * have *it* frame the PDF, so the `print()` call runs in our origin and the
 * viewer is just content being printed.
 */

/** How long to let the embedded viewer initialise before printing. */
const VIEWER_READY_MS = 300

/** How long the frame and its blob URL outlive the print, for slow printers. */
const CLEANUP_MS = 60_000

/**
 * If the frame never reports load — a blocked blob, a browser that declines the
 * embed — the user would otherwise get no dialog and no feedback at all.
 */
const LOAD_TIMEOUT_MS = 5_000

/**
 * The bytes as something `Blob` accepts.
 *
 * Copied rather than passed through: pdfme hands back a view that can be backed
 * by a `SharedArrayBuffer`, and `Blob` rejects those — so aliasing it would fail
 * at runtime with nothing but a TypeError to explain it.
 */
function toBlobPart(pdf: Uint8Array): ArrayBuffer {
  return new Uint8Array(pdf).buffer
}

/** Hand the PDF to a tab instead. Nothing is printed; the user prints from there. */
function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener")
}

/**
 * The document the print frame renders.
 *
 * The PDF is framed with an <iframe>, never an <embed>. Both would have to be
 * allowed by the page's Content-Security-Policy, and they are different
 * directives: <embed> is plugin content governed by `object-src`, which this app
 * pins to `'none'`, while an <iframe> is governed by `frame-src`, which already
 * permits `blob:` for the designer preview. Using <embed> here silently opened
 * the print dialog onto an empty page — the browser blocked the PDF and the
 * dialog printed nothing, while Download worked because it is a plain
 * `<a download>` and never renders the document at all.
 *
 * The outer frame stays a `srcdoc` document we own, so the `print()` call below
 * runs in our origin: navigating a frame straight at a blob PDF hands it to the
 * browser's viewer, which lives in its own origin and prints unreliably.
 */
function printDocument(url: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { margin: 0 }
      html, body { margin: 0; padding: 0; background: #fff }
      iframe { display: block; width: 100%; height: 100%; border: 0 }
    </style></head><body><iframe src="${url}"></iframe></body></html>`
}

export function printOrDownload(
  pdf: Uint8Array,
  _filename = "label.pdf",
): void {
  const blob = new Blob([toBlobPart(pdf)], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)

  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.setAttribute("title", "Label print frame")
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"

  let settled = false
  const cleanup = () => {
    frame.remove()
    URL.revokeObjectURL(url)
  }

  frame.srcdoc = printDocument(url)

  frame.onload = () => {
    // The <embed> only starts loading the viewer after the frame document
    // itself reports load, so printing on `load` prints a blank page.
    setTimeout(() => {
      if (settled) return
      settled = true
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        openInNewTab(url)
      }
      // Revoked late: the print dialog is modal and outlives this call, and the
      // viewer may still be fetching when it opens.
      setTimeout(cleanup, CLEANUP_MS)
    }, VIEWER_READY_MS)
  }

  document.body.appendChild(frame)

  setTimeout(() => {
    if (settled) return
    settled = true
    openInNewTab(url)
    cleanup()
  }, LOAD_TIMEOUT_MS)
}

/** The same PDF as a download — the fallback when the print dialog is blocked. */
export function downloadPdf(pdf: Uint8Array, filename = "label.pdf"): void {
  const blob = new Blob([toBlobPart(pdf)], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
