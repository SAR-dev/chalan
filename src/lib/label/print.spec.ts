// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadPdf, printOrDownload } from "./print"

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

let printSpy: ReturnType<typeof vi.fn>
let revoke: ReturnType<typeof vi.fn>
let openTab: ReturnType<typeof vi.fn>

/** jsdom never loads a frame, so `onload` is dispatched by hand. */
function fireLoad() {
  const frame = document.querySelector("iframe")
  if (!frame) throw new Error("no print frame was appended")
  frame.dispatchEvent(new Event("load"))
}

beforeEach(() => {
  vi.useFakeTimers()
  printSpy = vi.fn()
  revoke = vi.fn()
  openTab = vi.fn()
  URL.createObjectURL = vi.fn(
    () => "blob:label",
  ) as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL
  window.open = openTab as unknown as typeof window.open
  // The frame is same-origin by construction, so its window is reachable.
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    configurable: true,
    value: { print: printSpy, focus: vi.fn() },
  })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
})

describe("printOrDownload", () => {
  it("prints from a same-origin frame rather than navigating one to the PDF", () => {
    // Navigating an iframe straight to a blob PDF hands it to the browser's PDF
    // viewer, in its own origin, where `contentWindow.print()` throws or prints
    // nothing. The frame must own the document and frame the PDF itself.
    printOrDownload(PDF)

    const frame = document.querySelector("iframe")
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute("srcdoc")).toContain('<iframe src="blob:label">')
    // A src would be the broken shape: the frame would navigate to the blob.
    expect(frame?.getAttribute("src")).toBeNull()
    expect(openTab).not.toHaveBeenCalled()
  })

  it("frames the PDF rather than embedding it", () => {
    // <embed> is plugin content governed by `object-src`, which this app pins to
    // 'none'. The browser blocks it, the print dialog opens on a blank page, and
    // Download still works — so the bug looks like "print is broken" rather than
    // like a policy violation.
    printOrDownload(PDF)

    const doc = document.querySelector("iframe")?.getAttribute("srcdoc") ?? ""
    expect(doc).not.toContain("<embed")
  })

  it("hides the frame from the page and from assistive tech", () => {
    printOrDownload(PDF)
    const frame = document.querySelector("iframe")
    expect(frame?.getAttribute("aria-hidden")).toBe("true")
    expect(frame?.style.visibility).toBe("hidden")
  })

  it("prints once the embedded viewer has had time to start", async () => {
    printOrDownload(PDF)
    fireLoad()

    // Not yet: the <embed> begins loading after the frame reports load.
    vi.advanceTimersByTime(100)
    expect(printSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(openTab).not.toHaveBeenCalled()
  })

  it("keeps the frame and its blob alive across the print dialog", async () => {
    // The dialog is modal and outlives this call; revoking the URL first shows
    // the user a blank preview.
    printOrDownload(PDF)
    fireLoad()
    await vi.advanceTimersByTimeAsync(300)
    expect(revoke).not.toHaveBeenCalled()
    expect(document.querySelector("iframe")).not.toBeNull()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(revoke).toHaveBeenCalledWith("blob:label")
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("falls back to a tab when the frame never loads", async () => {
    // A blocked blob or a browser that declines the embed: without this the
    // user gets no dialog and no feedback at all.
    //
    // jsdom fires `load` on a srcdoc frame by itself, which would send this down
    // the success path — so the handler is detached to model a frame that truly
    // never reports.
    printOrDownload(PDF)
    const frame = document.querySelector("iframe")
    if (!frame) throw new Error("no print frame was appended")
    frame.onload = null

    await vi.advanceTimersByTimeAsync(5_000)

    expect(openTab).toHaveBeenCalledWith("blob:label", "_blank", "noopener")
    expect(printSpy).not.toHaveBeenCalled()
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("falls back to a tab when printing throws", async () => {
    printSpy.mockImplementation(() => {
      throw new Error("blocked")
    })
    printOrDownload(PDF)
    fireLoad()
    await vi.advanceTimersByTimeAsync(300)

    expect(openTab).toHaveBeenCalledWith("blob:label", "_blank", "noopener")
  })

  it("opens a tab only once, whichever path gets there first", async () => {
    // The load timeout and the print attempt race; a user must not get two
    // tabs from one click.
    printSpy.mockImplementation(() => {
      throw new Error("blocked")
    })
    printOrDownload(PDF)
    fireLoad()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(openTab).toHaveBeenCalledTimes(1)
  })
})

describe("downloadPdf", () => {
  it("clicks a download link and revokes the URL afterwards", async () => {
    const clicked: string[] = []
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function click(
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download)
    }

    downloadPdf(PDF, "label-ORD-1.pdf")
    expect(clicked).toEqual(["label-ORD-1.pdf"])

    await vi.advanceTimersByTimeAsync(10_000)
    expect(revoke).toHaveBeenCalledWith("blob:label")

    HTMLAnchorElement.prototype.click = realClick
  })
})
