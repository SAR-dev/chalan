"use client"

import type { Font, Template } from "@pdfme/common"
import { Viewer } from "@pdfme/ui"
import { useEffect, useRef, useState } from "react"
import { loadLabelFont } from "@/lib/label/fonts"
import { labelPlugins } from "@/lib/label/plugins"

// =============================================================================
// pdfme read-only preview (PDF.md §6) — the Preview tab's pdfme counterpart to
// the DOM `LabelRenderer`. Renders `template` against sample inputs; external
// template/input changes are mirrored in via `updateTemplate`/`setInputs`,
// guarded by JSON equality so an echo can't loop.
// =============================================================================

interface PdfmeViewerProps {
  template: Template
  inputs: Record<string, string>[]
  /** Test hook for the designer's Preview tab. */
  testId?: string
}

export function PdfmeViewer({ template, inputs, testId }: PdfmeViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef<InstanceType<typeof Viewer> | null>(null)
  const [font, setFont] = useState<Font | null>(null)

  useEffect(() => {
    let cancelled = false
    loadLabelFont()
      .then((f) => {
        if (!cancelled) setFont(f)
      })
      .catch(() => {
        /* parent shows the toast; leave the panel empty */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!font || !hostRef.current) return
    const ui = new Viewer({
      domContainer: hostRef.current,
      template,
      inputs,
      plugins: labelPlugins,
      options: { font },
    })
    uiRef.current = ui
    return () => {
      ui.destroy()
      uiRef.current = null
    }
    // Mount once per font; template/input changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font])

  useEffect(() => {
    const ui = uiRef.current
    if (!ui) return
    if (JSON.stringify(template) !== JSON.stringify(ui.getTemplate())) {
      ui.updateTemplate(template)
    }
    if (JSON.stringify(inputs) !== JSON.stringify(ui.getInputs())) {
      ui.setInputs(inputs)
    }
  }, [template, inputs])

  return (
    <div
      ref={hostRef}
      data-testid={testId}
      style={{ width: "100%", minHeight: 320, overflow: "auto" }}
    />
  )
}
