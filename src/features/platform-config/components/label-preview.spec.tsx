// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LabelPreview } from "@/features/platform-config/components/label-preview"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { buildLabelInputs } from "@/lib/label/label-inputs"
import { SAMPLE_LABEL_DATA } from "@/lib/label-layout"

// =============================================================================
// LabelPreview — the designer's plain preview.
//
// It renders the *actual* generated PDF in a frame rather than an approximation
// drawn in the DOM, so the test asserts the wiring: the PDF comes from the real
// generator, it is handed over as a blob URL, and that URL is revoked when the
// component unmounts so blob memory does not accumulate while a template is
// being dragged around.
// =============================================================================

const { generateLabelPdfMock } = vi.hoisted(() => ({
  generateLabelPdfMock: vi.fn(
    async (
      _template: unknown,
      _inputs: Record<string, string>[],
      _font: unknown,
    ): Promise<Uint8Array> => new Uint8Array([37, 80, 68, 70, 45]),
  ),
}))

vi.mock("@/lib/label/fonts", () => ({
  loadLabelFont: vi.fn(async () => ({
    NotoSansJP: { data: new ArrayBuffer(4), fallback: true },
    LabelSansBold: { data: new ArrayBuffer(4) },
  })),
}))

vi.mock("@/lib/label/generate-pdf", () => ({
  generateLabelPdf: generateLabelPdfMock,
}))

// jsdom has no object-URL store; a map records what was created and revoked.
const created: string[] = []
const revoked: string[] = []
beforeEach(() => {
  created.length = 0
  revoked.length = 0
  generateLabelPdfMock.mockClear()
  ;(URL as any).createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:fake/${created.length}`
    created.push(url)
    expect(blob.type).toBe("application/pdf")
    return url
  })
  ;(URL as any).revokeObjectURL = vi.fn((url: string) => revoked.push(url))
})

afterEach(() => {
  vi.useRealTimers()
})

function renderPreview() {
  return render(
    <LabelPreview
      template={DEFAULT_LABEL_TEMPLATE_PDFME}
      inputs={buildLabelInputs(DEFAULT_LABEL_TEMPLATE_PDFME, SAMPLE_LABEL_DATA)}
      testId="label-preview"
    />,
  )
}

describe("LabelPreview", () => {
  it("renders the generated PDF in a frame with the label's aspect ratio", async () => {
    renderPreview()

    const frame = await waitFor(() => {
      const el = screen.getByTitle("Label preview")
      expect(el.tagName).toBe("IFRAME")
      expect(el.getAttribute("src")).toMatch(/^blob:/)
      return el as HTMLIFrameElement
    })

    // 100 x 150 mm at 96 dpi, capped at 560px on the long edge.
    expect(frame.style.height).toBe("560px")
    expect(frame.style.width).toBe("373px")
  })

  it("uses the real print generator, so the preview cannot drift from it", async () => {
    renderPreview()

    await waitFor(() => expect(generateLabelPdfMock).toHaveBeenCalledTimes(1))
    const [template, inputs, font] = generateLabelPdfMock.mock.calls[0]
    expect(template).toBe(DEFAULT_LABEL_TEMPLATE_PDFME)
    expect(inputs[0]).toMatchObject({
      recipientName: SAMPLE_LABEL_DATA.recipientName,
    })
    expect(font).toBeDefined()
  })

  it("keeps the test hook on a wrapper so the tab can poll for a rendered child", async () => {
    const { container } = renderPreview()

    await waitFor(() => {
      const host = container.querySelector("[data-testid='label-preview']")
      expect(host).not.toBeNull()
      expect(host?.childElementCount).toBeGreaterThan(0)
    })
  })

  it("debounces renders so dragging the canvas does not generate per frame", async () => {
    vi.useFakeTimers()
    const { rerender } = renderPreview()

    rerender(
      <LabelPreview
        template={JSON.parse(JSON.stringify(DEFAULT_LABEL_TEMPLATE_PDFME))}
        inputs={buildLabelInputs(
          DEFAULT_LABEL_TEMPLATE_PDFME,
          SAMPLE_LABEL_DATA,
        )}
        testId="label-preview"
      />,
    )
    // A change arrived inside the debounce window, so nothing has been built yet.
    expect(generateLabelPdfMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    expect(generateLabelPdfMock).toHaveBeenCalled()
  })

  it("revokes the object URL on unmount", async () => {
    const { unmount } = renderPreview()
    await waitFor(() => expect(created).toHaveLength(1))

    unmount()

    expect(revoked).toEqual(created)
  })

  it("replaces the previous URL rather than leaking one per change", async () => {
    const { rerender } = renderPreview()
    await waitFor(() => expect(created).toHaveLength(1))
    const first = created[0]

    rerender(
      <LabelPreview
        template={JSON.parse(JSON.stringify(DEFAULT_LABEL_TEMPLATE_PDFME))}
        inputs={buildLabelInputs(DEFAULT_LABEL_TEMPLATE_PDFME, {
          ...SAMPLE_LABEL_DATA,
          orderId: "ORD-OTHER",
        })}
        testId="label-preview"
      />,
    )

    await waitFor(() => expect(created.length).toBeGreaterThan(1))
    expect(revoked).toContain(first)
  })

  it("reports a failure instead of showing an empty frame", async () => {
    generateLabelPdfMock.mockRejectedValueOnce(new Error("font broke"))

    renderPreview()

    await waitFor(() =>
      expect(
        screen.getByText("The preview could not be rendered."),
      ).toBeInTheDocument(),
    )
  })

  it("sizes the frame from the template's own dimensions", async () => {
    const scaled = structuredClone(DEFAULT_LABEL_TEMPLATE_PDFME)
    ;(scaled.basePdf as { width: number; height: number }).width = 50
    ;(scaled.basePdf as { width: number; height: number }).height = 50

    render(
      <LabelPreview
        template={scaled}
        inputs={buildLabelInputs(scaled, SAMPLE_LABEL_DATA)}
        testId="label-preview"
      />,
    )

    const frame = await waitFor(() => screen.getByTitle("Label preview"))
    // 50mm square is under the cap, so it renders at physical size.
    expect(frame.style.width).toBe("189px")
    expect(frame.style.height).toBe("189px")
  })
})
