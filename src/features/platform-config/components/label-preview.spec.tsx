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
// It renders a raster of the *actual* generated PDF rather than an
// approximation drawn in the DOM, so the test asserts the wiring: the label comes
// from the real generator, it is handed over as a blob URL, and that URL is
// revoked when the component unmounts so blob memory does not accumulate while a
// template is being dragged around.
// =============================================================================

const { generateLabelImageMock } = vi.hoisted(() => ({
  generateLabelImageMock: vi.fn(
    async (
      _template: unknown,
      _inputs: Record<string, string>[],
      _font: unknown,
    ): Promise<Blob> =>
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
  ),
}))

vi.mock("@/lib/label/fonts", () => ({
  loadLabelFont: vi.fn(async () => ({
    NotoSansJP: { data: new ArrayBuffer(4), fallback: true },
    LabelSansBold: { data: new ArrayBuffer(4) },
  })),
}))

vi.mock("@/lib/label/generate-image", () => ({
  generateLabelImage: generateLabelImageMock,
}))

// jsdom has no object-URL store; a map records what was created and revoked.
const created: string[] = []
const revoked: string[] = []
beforeEach(() => {
  created.length = 0
  revoked.length = 0
  generateLabelImageMock.mockClear()
  ;(URL as any).createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:fake/${created.length}`
    created.push(url)
    expect(blob.type).toBe("image/png")
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
  it("renders the label as an image with the label's aspect ratio", async () => {
    renderPreview()

    const img = await waitFor(() => {
      const el = screen.getByTestId("label-preview-image")
      // An <img>, not an <iframe>: the browser draws its own chrome around a
      // framed PDF, which is what put scrollbars and a grey viewer background
      // inside the card the preview sits in.
      expect(el.tagName).toBe("IMG")
      expect(el.getAttribute("src")).toMatch(/^blob:/)
      return el as HTMLImageElement
    })

    // 100 x 150 mm at 96 dpi, capped at 560px on the long edge.
    expect(img.style.height).toBe("560px")
    expect(img.style.width).toBe("373px")
  })

  it("describes the label for assistive tech", async () => {
    renderPreview()

    // A preview image with no alt text is announced as "image" — the one thing
    // it must not do is announce nothing at all.
    await waitFor(() =>
      expect(screen.getByTestId("label-preview-image")).toHaveAttribute(
        "alt",
        "Label preview: 100 by 150 millimetres",
      ),
    )
  })

  it("uses the real print generator, so the preview cannot drift from it", async () => {
    renderPreview()

    await waitFor(() => expect(generateLabelImageMock).toHaveBeenCalledTimes(1))
    const [template, inputs, font] = generateLabelImageMock.mock.calls[0]
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
    expect(generateLabelImageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    expect(generateLabelImageMock).toHaveBeenCalled()
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
    generateLabelImageMock.mockRejectedValueOnce(new Error("font broke"))

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

    const img = await waitFor(() => screen.getByTestId("label-preview-image"))
    // 50mm square is under the cap, so it renders at physical size.
    expect(img.style.width).toBe("189px")
    expect(img.style.height).toBe("189px")
  })
})
