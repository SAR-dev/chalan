// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { scanImage } from "@/lib/scan"
import { ScanGate } from "./scan-gate"

// The gate's whole contract sits on top of the wrapper: decode outcomes drive
// its states, so the decoder is mocked and only `scanImage`'s two resolved
// shapes (`code` / `no-code`) plus a rejection are exercised here.
vi.mock("@/lib/scan", () => ({ scanImage: vi.fn() }))

const ORDER_ID = "ORD-100042"

function renderGate(verified = false, onVerify = vi.fn()) {
  render(
    <ScanGate orderId={ORDER_ID} verified={verified} onVerify={onVerify} />,
  )
  return { onVerify }
}

function photo(name = "label.png", type = "image/png") {
  return new File(["not-really-a-qr"], name, { type })
}

beforeEach(() => {
  vi.mocked(scanImage).mockReset()
})

describe("ScanGate idle surface", () => {
  it("offers both the photo scan and manual entry", () => {
    renderGate()

    expect(screen.getByTestId("scan-gate")).toBeInTheDocument()
    expect(screen.getByTestId("scan-gate-scan")).toBeEnabled()
    expect(screen.getByTestId("scan-gate-manual")).toBeInTheDocument()
    expect(screen.queryByTestId("scan-gate-verified")).not.toBeInTheDocument()
  })

  // v1's camera surface is exactly this: the OS capture intent behind a file
  // input. No <video>, no getUserMedia — asserted by the attributes here.
  it("uses the OS camera capture intent as its only camera surface", () => {
    renderGate()

    const input = screen.getByTestId("scan-gate-file-input")
    expect(input).toHaveAttribute("type", "file")
    expect(input).toHaveAttribute("accept", "image/*")
    expect(input).toHaveAttribute("capture", "environment")
  })

  it("shows the verified check instead of the scanning UI when verified", () => {
    renderGate(true)

    expect(screen.getByTestId("scan-gate-verified")).toHaveTextContent(ORDER_ID)
    expect(screen.queryByTestId("scan-gate-scan")).not.toBeInTheDocument()
    expect(screen.queryByTestId("scan-gate-manual")).not.toBeInTheDocument()
  })
})

describe("ScanGate manual entry (always-visible fallback)", () => {
  it("verifies a typed code, forgiving case and whitespace", () => {
    const { onVerify } = renderGate()

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: `  ${ORDER_ID.toLowerCase()}  ` },
    })

    expect(onVerify).toHaveBeenCalledTimes(1)
  })

  it("stays quiet while the code is still a prefix", () => {
    renderGate()

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: "ORD-1" },
    })

    expect(
      screen.queryByTestId("scan-gate-manual-mismatch"),
    ).not.toBeInTheDocument()
  })

  it("flags a full-length wrong code without verifying", () => {
    const { onVerify } = renderGate()

    fireEvent.change(screen.getByTestId("scan-gate-manual"), {
      target: { value: "ORD-999999" },
    })

    expect(onVerify).not.toHaveBeenCalled()
    expect(screen.getByTestId("scan-gate-manual-mismatch")).toBeInTheDocument()
  })
})

describe("ScanGate photo scan", () => {
  it("verifies on a decoded match and discards the photo", async () => {
    vi.mocked(scanImage).mockResolvedValue({ kind: "code", text: ORDER_ID })
    const { onVerify } = renderGate()

    await userEvent.upload(screen.getByTestId("scan-gate-file-input"), photo())

    await waitFor(() => expect(onVerify).toHaveBeenCalledTimes(1))
    // Nothing of the capture survives a match — no state, no upload.
    expect(screen.queryByTestId("scan-gate-mismatch")).not.toBeInTheDocument()
    expect(screen.queryByTestId("scan-gate-unreadable")).not.toBeInTheDocument()
  })

  it("refuses a mismatch and names the code that was actually read", async () => {
    vi.mocked(scanImage).mockResolvedValue({
      kind: "code",
      text: "ORD-100047",
    })
    const { onVerify } = renderGate()

    await userEvent.upload(screen.getByTestId("scan-gate-file-input"), photo())

    const mismatch = await screen.findByTestId("scan-gate-mismatch")
    expect(onVerify).not.toHaveBeenCalled()
    // "Read ORD-100047 — this parcel is ORD-100042"
    expect(mismatch).toHaveTextContent("ORD-100047")
    expect(mismatch).toHaveTextContent(ORDER_ID)
  })

  it("truncates an arbitrary decoded string (a URL, another label)", async () => {
    const url = `https://example.com/${"x".repeat(200)}`
    vi.mocked(scanImage).mockResolvedValue({ kind: "code", text: url })
    renderGate()

    await userEvent.upload(screen.getByTestId("scan-gate-file-input"), photo())

    const mismatch = await screen.findByTestId("scan-gate-mismatch")
    const text = mismatch.textContent ?? ""
    // Truncated with an ellipsis, and the full decode output never appears —
    // arbitrary output must not blow up the inline hint.
    expect(text).toContain("…")
    expect(text).not.toContain(url)
    expect(text.length).toBeLessThan(120)
  })

  it("offers a retry after an unreadable photo instead of a stuck spinner", async () => {
    vi.mocked(scanImage).mockResolvedValue({ kind: "no-code" })
    const { onVerify } = renderGate()

    await userEvent.upload(screen.getByTestId("scan-gate-file-input"), photo())

    expect(
      await screen.findByTestId("scan-gate-unreadable"),
    ).toBeInTheDocument()
    expect(onVerify).not.toHaveBeenCalled()
    // Back to idle: the scan button is live again and manual entry never left.
    expect(screen.getByTestId("scan-gate-scan")).toBeEnabled()
    expect(screen.getByTestId("scan-gate-manual")).toBeInTheDocument()
  })

  // scanImage is contracted never to reject, but a future decoder (the
  // zxing-wasm escape hatch) is one mistake away — no photo path may strand
  // the rider on an eternal "decoding".
  it("survives a rejecting decoder without an eternal spinner", async () => {
    vi.mocked(scanImage).mockRejectedValue(new Error("worker exploded"))
    const { onVerify } = renderGate()

    await userEvent.upload(screen.getByTestId("scan-gate-file-input"), photo())

    expect(
      await screen.findByTestId("scan-gate-unreadable"),
    ).toBeInTheDocument()
    expect(onVerify).not.toHaveBeenCalled()
    expect(screen.getByTestId("scan-gate-scan")).toBeEnabled()
  })

  it("lets a re-pick of the same photo retry after a miss", async () => {
    vi.mocked(scanImage)
      .mockResolvedValueOnce({ kind: "no-code" })
      .mockResolvedValueOnce({ kind: "code", text: ORDER_ID })
    const { onVerify } = renderGate()
    const input = screen.getByTestId("scan-gate-file-input")

    await userEvent.upload(input, photo())
    expect(
      await screen.findByTestId("scan-gate-unreadable"),
    ).toBeInTheDocument()

    await userEvent.upload(input, photo())
    await waitFor(() => expect(onVerify).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId("scan-gate-unreadable")).not.toBeInTheDocument()
  })
})
