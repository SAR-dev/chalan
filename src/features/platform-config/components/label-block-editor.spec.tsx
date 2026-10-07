// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LABEL_TEXT_DEFAULT } from "@/lib/constants"
import type { LabelBlock } from "@/lib/validation"
import { LabelBlockEditor } from "./label-block-editor"

// The editor is controlled: every assertion is on the array handed back to the
// parent, not on internal state.

describe("LabelBlockEditor", () => {
  it("appends a block of the chosen type", () => {
    const onChange = vi.fn()
    render(<LabelBlockEditor blocks={[]} onChange={onChange} />)

    fireEvent.click(screen.getByTestId("label-add-qr"))

    expect(onChange).toHaveBeenCalledWith([
      { type: "qr", minSizeMm: 30, caption: true },
    ])
  })

  it("appends a custom-text block with a default body", () => {
    const onChange = vi.fn()
    render(<LabelBlockEditor blocks={[]} onChange={onChange} />)

    fireEvent.click(screen.getByTestId("label-add-text"))

    expect(onChange).toHaveBeenCalledWith([
      {
        type: "text",
        text: LABEL_TEXT_DEFAULT,
        scale: "m",
        bold: false,
        width: "full",
      },
    ])
  })

  it("edits a custom-text block's body", () => {
    const onChange = vi.fn()
    render(
      <LabelBlockEditor
        blocks={[
          {
            type: "text",
            text: "Old",
            scale: "m",
            bold: false,
            width: "full",
          },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByTestId("label-text-0"), {
      target: { value: "This side up" },
    })

    expect(onChange).toHaveBeenCalledWith([
      {
        type: "text",
        text: "This side up",
        scale: "m",
        bold: false,
        width: "full",
      },
    ])
  })

  it("clamps a brand icon's height to the allowed range", () => {
    const onChange = vi.fn()
    render(
      <LabelBlockEditor
        blocks={[{ type: "icon", heightMm: 12, width: "full" }]}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByTestId("label-icon-height-0"), {
      target: { value: "999" },
    })

    expect(onChange).toHaveBeenCalledWith([
      { type: "icon", heightMm: 40, width: "full" },
    ])
  })

  it("removes the block at the given index", () => {
    const onChange = vi.fn()
    const blocks: LabelBlock[] = [
      { type: "separator" },
      { type: "spacer", heightMm: 4 },
    ]
    render(<LabelBlockEditor blocks={blocks} onChange={onChange} />)

    fireEvent.click(screen.getByTestId("label-block-remove-0"))

    expect(onChange).toHaveBeenCalledWith([{ type: "spacer", heightMm: 4 }])
  })

  it("moves a block up", () => {
    const onChange = vi.fn()
    const blocks: LabelBlock[] = [
      { type: "separator" },
      { type: "spacer", heightMm: 4 },
    ]
    render(<LabelBlockEditor blocks={blocks} onChange={onChange} />)

    fireEvent.click(screen.getByTestId("label-block-up-1"))

    expect(onChange).toHaveBeenCalledWith([
      { type: "spacer", heightMm: 4 },
      { type: "separator" },
    ])
  })

  it("clamps a spacer's height to the allowed range", () => {
    const onChange = vi.fn()
    render(
      <LabelBlockEditor
        blocks={[{ type: "spacer", heightMm: 4 }]}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByTestId("label-spacer-height-0"), {
      target: { value: "999" },
    })

    expect(onChange).toHaveBeenCalledWith([{ type: "spacer", heightMm: 40 }])
  })
})
