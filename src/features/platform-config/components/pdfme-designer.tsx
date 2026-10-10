"use client"

import type { Font, Schema, Template } from "@pdfme/common"
import { Designer } from "@pdfme/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  LABEL_FIELD_KEYS,
  LABEL_FIELD_LABELS,
  type LabelFieldKey,
} from "@/lib/constants"
import { loadLabelFont } from "@/lib/label/fonts"
import { labelPlugins } from "@/lib/label/plugins"
import { toast } from "@/lib/notify"

// =============================================================================
// pdfme free-canvas designer — see CONTRIBUTING §3.76.
//
// The `Designer` is imperative (it owns a DOM subtree + its own React root),
// so this wrapper owns one instance for the mount lifetime and mirrors
// template state in and out:
//   - user edits  → `onChangeTemplate` → parent state
//   - external edits (history load, size inputs) → `updateTemplate`
//
// The palette is the only add-UI pdfme doesn't ship: buttons that insert a
// pre-named element (bound field keys, static text, QR, barcode, line,
// rectangle, logo). Names follow the binding rules in `buildLabelInputs`.
// =============================================================================

type DesignerInstance = InstanceType<typeof Designer>

interface PdfmeDesignerProps {
  template: Template
  onChange: (template: Template) => void
}

/** Stagger new elements down the left edge, staying inside the page. */
function nextPosition(t: Template, height: number) {
  const page = t.basePdf as { width: number; height: number }
  const count = t.schemas?.[0]?.length ?? 0
  const y = Math.max(1, Math.min(5 + count * 7, page.height - height - 2))
  return { x: 5, y }
}

/** A unique sibling name, so the schema stays valid (pdfme requires unique names). */
function uniqueName(template: Template, base: string): string {
  const taken = new Set((template.schemas?.[0] ?? []).map((s) => s.name))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export function PdfmeDesigner({ template, onChange }: PdfmeDesignerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef<DesignerInstance | null>(null)
  const currentRef = useRef<Template>(template)
  const onChangeRef = useRef(onChange)
  const [font, setFont] = useState<Font | null>(null)

  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    loadLabelFont()
      .then((f) => {
        if (!cancelled) setFont(f)
      })
      .catch(() => {
        toast.error("Could not load the label font.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Mount once the font is ready; the instance owns the canvas + prop panel.
  useEffect(() => {
    if (!font || !hostRef.current) return
    const ui = new Designer({
      domContainer: hostRef.current,
      template: currentRef.current,
      plugins: labelPlugins,
      options: { font },
    })
    ui.onChangeTemplate((t) => {
      currentRef.current = t
      onChangeRef.current(t)
    })
    uiRef.current = ui
    return () => {
      ui.destroy()
      uiRef.current = null
    }
  }, [font])

  // Mirror external template changes (history load, size inputs) into the
  // canvas — guarded by JSON equality so an echo of our own change can't loop.
  useEffect(() => {
    const ui = uiRef.current
    if (!ui) return
    if (JSON.stringify(template) === JSON.stringify(currentRef.current)) return
    currentRef.current = template
    ui.updateTemplate(template)
  }, [template])

  const addElement = useCallback((element: Schema) => {
    const base = currentRef.current
    const next: Template = {
      ...base,
      schemas: [[...(base.schemas?.[0] ?? []), element]],
    }
    currentRef.current = next
    uiRef.current?.updateTemplate(next)
    onChangeRef.current(next)
  }, [])

  function addField(key: LabelFieldKey) {
    const base = currentRef.current
    if ((base.schemas?.[0] ?? []).some((s) => s.name === key)) {
      toast.error(`"${LABEL_FIELD_LABELS[key]}" is already on the label.`)
      return
    }
    const height = 7
    addElement({
      name: key,
      type: "text",
      position: nextPosition(base, height),
      width: 55,
      height,
      // Points, not mm (pdfme converts only width/height/position). The default
      // template's body text is 9-11pt; 4pt was sub-millimetre and unreadable on
      // a printed label. A 7mm box holds 10pt at the 1.25 line height.
      fontSize: 10,
      content: LABEL_FIELD_LABELS[key], // placeholder in the designer only
    })
  }

  function addStaticText() {
    const base = currentRef.current
    addElement({
      name: uniqueName(base, "staticText"),
      type: "text",
      readOnly: true,
      position: nextPosition(base, 7),
      width: 45,
      height: 7,
      fontSize: 10,
      content: "Static text",
    })
  }

  function addQr() {
    const base = currentRef.current
    const page = base.basePdf as { width: number; height: number }
    if ((base.schemas?.[0] ?? []).some((s) => s.name === "qr")) {
      toast.error("A QR code is already on the label.")
      return
    }
    addElement({
      name: "qr",
      type: "qrcode",
      position: { x: Math.max(1, page.width - 34), y: 5 },
      width: 30, // the scannable floor — LABEL_QR_MIN_MM in @/lib/constants
      height: 30,
    })
  }

  function addBarcode() {
    const base = currentRef.current
    addElement({
      name: uniqueName(base, "code128"),
      type: "code128",
      position: nextPosition(base, 10),
      width: 45,
      height: 10,
    })
  }

  function addLine() {
    const base = currentRef.current
    const page = base.basePdf as { width: number; height: number }
    addElement({
      name: uniqueName(base, "line"),
      type: "line",
      position: nextPosition(base, 1),
      width: Math.max(10, page.width - 10),
      height: 1,
    })
  }

  function addRectangle() {
    const base = currentRef.current
    addElement({
      name: uniqueName(base, "rectangle"),
      type: "rectangle",
      position: nextPosition(base, 20),
      width: 30,
      height: 20,
    })
  }

  function addLogo() {
    const base = currentRef.current
    if ((base.schemas?.[0] ?? []).some((s) => s.name === "logo")) {
      toast.error("The logo is already on the label.")
      return
    }
    addElement({
      name: "logo",
      type: "image",
      position: nextPosition(base, 15),
      width: 40,
      height: 15,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" data-testid="pdfme-field-palette">
        {LABEL_FIELD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
            data-testid={`pdfme-add-field-${key}`}
            onClick={() => addField(key)}
          >
            + {LABEL_FIELD_LABELS[key]}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-border" />
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-static-text"
          onClick={addStaticText}
        >
          + Static text
        </button>
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-qrcode"
          onClick={addQr}
        >
          + QR code
        </button>
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-barcode"
          onClick={addBarcode}
        >
          + Barcode
        </button>
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-line"
          onClick={addLine}
        >
          + Line
        </button>
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-rectangle"
          onClick={addRectangle}
        >
          + Rectangle
        </button>
        <button
          type="button"
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          data-testid="pdfme-add-logo"
          onClick={addLogo}
        >
          + Logo
        </button>
      </div>
      {font ? (
        <div
          ref={hostRef}
          data-testid="pdfme-designer"
          style={{
            width: "100%",
            height: "calc(100vh - 320px)",
            minHeight: 420,
          }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-md border border-dashed"
          data-testid="pdfme-designer-loading"
          style={{ height: 420 }}
        >
          Loading designer…
        </div>
      )}
    </div>
  )
}
