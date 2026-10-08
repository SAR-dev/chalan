// @vitest-environment jsdom

import type { Template } from "@pdfme/common"
import { render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PdfmeDesigner } from "@/features/platform-config/components/pdfme-designer"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"

// =============================================================================
// PdfmeDesigner smoke test (PDF.md §9). The imperative @pdfme/ui Designer is
// mocked — it owns a canvas jsdom can't paint — so what's under test is the
// wiring: mount once the font loads, palette clicks produce bound elements in
// the onChange template, and duplicate-bound-fields are refused.
// =============================================================================

const { FakeDesigner, instances } = vi.hoisted(() => {
  type Change = (t: unknown) => void
  class FakeDesigner {
    props: { domContainer: HTMLElement; template: unknown }
    cb: Change | null = null
    destroyed = false
    constructor(props: { domContainer: HTMLElement; template: unknown }) {
      this.props = props
      instances.push(this)
    }
    onChangeTemplate(cb: Change) {
      this.cb = cb
    }
    updateTemplate(t: unknown) {
      this.props.template = t
    }
    destroy() {
      this.destroyed = true
    }
  }
  const instances: InstanceType<typeof FakeDesigner>[] = []
  return { FakeDesigner, instances }
})

vi.mock("@pdfme/ui", () => ({ Designer: FakeDesigner }))

vi.mock("@/lib/label/fonts", () => ({
  loadLabelFont: vi.fn(async () => ({
    NotoSansJP: { data: new ArrayBuffer(0) },
  })),
}))

vi.mock("@/lib/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe("PdfmeDesigner", () => {
  beforeEach(() => {
    instances.length = 0
  })

  /**
   * Render and wait for the imperative instance: the canvas div commits before
   * the mount effect runs, so asserting `instances` directly races under load.
   */
  async function mount(ui?: ReactElement) {
    const view = render(
      ui ?? (
        <PdfmeDesigner
          template={DEFAULT_LABEL_TEMPLATE_PDFME}
          onChange={() => {}}
        />
      ),
    )
    await screen.findByTestId("pdfme-designer")
    await waitFor(() => expect(instances).toHaveLength(1))
    return view
  }

  it("mounts the canvas once the font is ready", async () => {
    await mount()
    expect(instances[0].props.template).toEqual(DEFAULT_LABEL_TEMPLATE_PDFME)
  })

  it("inserts a bound field element from the palette", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    await mount(
      <PdfmeDesigner
        template={DEFAULT_LABEL_TEMPLATE_PDFME}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByTestId("pdfme-add-field-siteName"))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next = onChange.mock.calls[0][0] as Template
    const added = next.schemas[0].find((s) => s.name === "siteName")
    expect(added).toMatchObject({ type: "text" })
    // The canvas instance was handed the same template synchronously.
    expect(instances[0].props.template).toEqual(next)
  })

  it("refuses a second element for an already-bound field", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // `merchantName` already exists in the default template.
    await mount(
      <PdfmeDesigner
        template={DEFAULT_LABEL_TEMPLATE_PDFME}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByTestId("pdfme-add-field-merchantName"))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("refuses a duplicate QR but adds unique static text", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    await mount(
      <PdfmeDesigner
        template={DEFAULT_LABEL_TEMPLATE_PDFME}
        onChange={onChange}
      />,
    )

    // The default already has `qr` — this must be refused, not duplicated.
    await user.click(screen.getByTestId("pdfme-add-qrcode"))
    expect(onChange).not.toHaveBeenCalled()

    // Static text uses unique naming and never clashes.
    await user.click(screen.getByTestId("pdfme-add-static-text"))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next = onChange.mock.calls[0][0] as Template
    const added = next.schemas[0].find((s) => s.name.startsWith("staticText"))
    expect(added).toMatchObject({ type: "text", readOnly: true })
  })

  it("renders the palette with every bound field key", () => {
    render(
      <PdfmeDesigner
        template={DEFAULT_LABEL_TEMPLATE_PDFME}
        onChange={() => {}}
      />,
    )
    for (const key of ["orderId", "recipientName", "codAmount", "siteUrl"]) {
      expect(screen.getByTestId(`pdfme-add-field-${key}`)).toBeTruthy()
    }
  })

  it("destroys the canvas instance on unmount", async () => {
    const { unmount } = await mount()
    unmount()
    expect(instances[0].destroyed).toBe(true)
  })
})
