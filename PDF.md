# Label System — pdfme Design & Implementation Plan

Supersedes the flow-block baseline. Replaces the vertical block stack with a free-canvas editor built on **pdfme** (`@pdfme/ui`, `@pdfme/generator`, `@pdfme/schemas`, `@pdfme/common`). Verified by a working proof of concept (Designer, Viewer, PDF generate/print on a 100×150 mm label).

---

## 1) Goals and what changes

**Keep (unchanged guarantees)**
- **Physical mm.** Template size is in mm; the generated PDF page is exactly `widthMm × heightMm`, so a thermal printer prints at true size.
- **Typed data.** Order data still flows through `resolveLabelField` (`weight` → `"1.5 kg"`, `codAmount` → `"COD …"`, null city/site → empty).
- **Scannable QR.** Hard floor (`LABEL_QR_MIN_MM`) enforced on save and again before generation.
- **Reproducible.** Publishing appends an immutable version; every parcel can be reprinted with the label it shipped with.
- **Deterministic server contract.** One published default, one draft, audit on publish.

**Change**

| Area | Baseline | New |
|---|---|---|
| Layout model | Vertical flow, `full/half` width | Absolute x/y/w/h in mm (free canvas) |
| Source of truth | `LabelBlock[]` | pdfme `Template` JSON |
| Designer | Block list editor | pdfme `Designer` (drag, resize, snap, property panel) |
| Preview | Own `LabelRenderer` | pdfme `Viewer` with sample/real data |
| Print | Portal + `@page` + `window.print()` | `generate()` → PDF blob → print or download |
| New elements | — | Code128/other barcodes, lines, rectangles, images |

**Trade-off to accept.** Preview and print are no longer literally the same code (Viewer vs `generate()`), though pdfme designs them to match. The guarantee becomes "verified on a real printer" (see §9 acceptance checks). The "never translate to points" rule no longer applies internally, but page size is still exact mm.

---

## 2) Domain model (DB)

Table `label_template` keeps its shape. Additions:

| Field | Type | Notes |
|---|---|---|
| `engine` | `text` | `'blocks'` (legacy) or `'pdfme'`. Default `'blocks'` for existing rows; new drafts use `'pdfme'`. |
| `template` | `jsonb \| null` | pdfme `Template` (`{ basePdf, schemas }`). Required when `engine = 'pdfme'`. |

Existing columns stay: `widthMm`, `heightMm` (denormalized copy of `basePdf.width/height`, always written from the template on save), `logoRef`, `blocks` (legacy, read-only for old rows), `version`, `publishedAt`, `isDefault`, audit fields, and the partial unique index on `isDefault`.

**Legacy handling (no data migration).** Published `'blocks'` versions are immutable and reprint correctly with the old renderer, so keep `LabelRenderer` for `engine = 'blocks'` rows only. New publishes are `'pdfme'`. Remove the legacy path later, once old parcels no longer need reprinting.

Migration (Drizzle):

```sql
ALTER TABLE label_template ADD COLUMN engine text NOT NULL DEFAULT 'blocks';
ALTER TABLE label_template ADD COLUMN template jsonb;
ALTER TABLE label_template ADD CONSTRAINT label_template_engine_chk CHECK (engine IN ('blocks','pdfme'));
ALTER TABLE label_template ADD CONSTRAINT label_template_pdfme_has_template
  CHECK (engine <> 'pdfme' OR template IS NOT NULL);
```

---

## 3) Template format and field binding

A pdfme template is `{ basePdf: { width, height, padding }, schemas: [ [ ...elements ] ] }`. Use a **single page**. Each element has `name`, `type`, `position {x,y}`, `width`, `height` (all mm) plus type-specific props.

Element types enabled (plugin registry, §4): `text`, `image`, `line`, `rectangle`, `qrcode`, `code128`. Add more barcode types from `barcodes` only on request.

**Binding rule (key design decision).** An element's `name` selects its data:

1. If `name` is a `LabelFieldKey` (for example `destinationCity`, `weight`, `codAmount`), the value comes from `resolveLabelField`.
2. `name === 'qr'` (or any `qrcode` element named `qr*`) gets `data.qrValue` (the order id).
3. `name === 'logo'` gets `data.logoUrl` converted to a data URI (pdfme images need a data URI or base64).
4. Anything else is **static**: mark it `readOnly: true` in the designer and it prints its own `content`.

```ts
// src/lib/label-inputs.ts  (pure, testable without DOM)
import type { Template } from "@pdfme/common";

export function buildLabelInputs(
  template: Template,
  data: LabelData,
  logoDataUri?: string,
): Record<string, string>[] {
  const input: Record<string, string> = {};
  for (const s of template.schemas[0]) {
    if (s.readOnly) continue;                       // static: prints its own content
    if (isLabelFieldKey(s.name)) input[s.name] = resolveLabelField(s.name, data);
    else if (s.type === "qrcode") input[s.name] = data.qrValue;
    else if (s.name === "logo") input[s.name] = logoDataUri ?? "";
    else input[s.name] = (s as { content?: string }).content ?? "";
  }
  return [input];                                   // one object per page/copy
}
```

For batch printing, pass N input objects to `generate()` and you get one PDF with N pages.

---

## 4) Shared modules

```
src/lib/label/
  plugins.ts          // pdfme plugin registry
  fonts.ts            // CJK font setup (browser + server)
  template-schema.ts  // zod + pdfme checkTemplate + QR floor
  label-inputs.ts     // buildLabelInputs (above)
  generate-pdf.ts     // generate() wrapper
  print.ts            // blob print/download helper
  default-template.ts // DEFAULT_LABEL_TEMPLATE converted to pdfme
```

**plugins.ts**

```ts
import { text, image, line, rectangle, barcodes } from "@pdfme/schemas";

export const labelPlugins = {
  Text: text, Image: image, Line: line, Rectangle: rectangle,
  QR: barcodes.qrcode, Code128: barcodes.code128,
};
```

> In v6, `builtInPlugins` contains only Text. Register the others explicitly, otherwise validation fails with "`<type>` is not found in plugins".

**fonts.ts** (Japanese support is required; the default font has no CJK glyphs)

```ts
import type { Font } from "@pdfme/common";

export async function loadLabelFont(): Promise<Font> {
  const data = await fetch("/fonts/NotoSansJP-Regular.ttf").then((r) => r.arrayBuffer());
  return { NotoSansJP: { data, fallback: true, subset: true } };
}
```

Put the font under `public/fonts/` (or storage). Pass the same font to the Designer, Viewer, and `generate()` via `options: { font }`, or text will render differently across the three. On the server, read the file with `fs` instead of `fetch`. Cache the font in memory; it is several MB.

---

## 5) Validation

`src/lib/label/template-schema.ts`. Run on every create/update/publish, server side.

1. `checkTemplate(template)` from `@pdfme/common` (structural validity).
2. `basePdf` must be a blank page: `{ width, height }` ints in `[LABEL_TEMPLATE_MIN_MM, LABEL_TEMPLATE_MAX_MM]` (10–400), `padding` `[0,0,0,0]`.
3. Exactly one page (`schemas.length === 1`), at most `LABEL_MAX_ELEMENTS` elements (rename of `LABEL_MAX_BLOCKS`, keep 40).
4. Allowed `type` list only (the registry above); unique `name` per element.
5. Every element inside the page: `x ≥ 0`, `y ≥ 0`, `x + width ≤ w`, `y + height ≤ h`.
6. **QR floor:** for every `qrcode`, `width ≥ LABEL_QR_MIN_MM` and `height ≥ LABEL_QR_MIN_MM`; reject non-square (>1 mm difference).
7. Write `widthMm/heightMm` from `basePdf`, never trust client values.

Keep `clampQrSizeMm` and re-apply it in `generate-pdf.ts` before generation as a second guard.

---

## 6) Designer UI

`src/app/dashboard/label-designer/label-designer-client.tsx` keeps the Design / Preview / History tabs and the publish flow.

**Design tab**: replaces `LabelBlockEditor` with a `PdfmeDesigner` client component.

```tsx
"use client";
import { useEffect, useRef } from "react";
import { Designer } from "@pdfme/ui";
import type { Template, Font } from "@pdfme/common";
import { labelPlugins } from "@/lib/label/plugins";

export function PdfmeDesigner({ template, font, onChange }:
  { template: Template; font: Font; onChange: (t: Template) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ui = useRef<Designer | null>(null);

  useEffect(() => {
    ui.current = new Designer({
      domContainer: host.current!,
      template,
      plugins: labelPlugins,
      options: { font },
    });
    ui.current.onChangeTemplate(onChange);
    return () => ui.current?.destroy();
  }, []);                                   // mount once; push external changes via updateTemplate

  return <div ref={host} style={{ width: "100%", height: "calc(100vh - 220px)" }} />;
}
```

- Load with `next/dynamic(() => import(...), { ssr: false })`.
- Mount once; on external changes (load history version, change size) call `ui.current.updateTemplate(newTemplate)` rather than remounting.
- Debounce `onChange` (about 500 ms) before `saveDraft` (PATCH).
- **Label size** inputs (width/height) stay in the form header; on change, write them into `template.basePdf` and call `updateTemplate`.
- Ship a **field palette**: a small list of `LabelFieldKey`s the admin can add as pre-named elements, so field binding (§3) is not left to hand-typed names. Static text uses the designer's normal text element with `readOnly` on.
- **Preview tab**: `Viewer` with `inputs = buildLabelInputs(template, SAMPLE_LABEL_DATA)`. Optionally let the admin pick a real order to preview.
- **History tab**: unchanged API; loading a `'pdfme'` version copies its `template` into the editor. Legacy `'blocks'` versions are shown read-only (use the old renderer for preview; "copy into editor" is disabled, or offered as a manual rebuild).

---

## 7) Print flow

Replace the portal/`@page` path in `order-label-button.tsx`.

```ts
// generate-pdf.ts
import { generate } from "@pdfme/generator";

export async function generateLabelPdf(template, inputs, font) {
  return generate({ template, inputs, plugins: labelPlugins, options: { font } });
}

// print.ts
export function printOrDownload(pdf: Uint8Array, filename = "label.pdf") {
  const url = URL.createObjectURL(new Blob([pdf.buffer], { type: "application/pdf" }));
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (mobile) { window.open(url, "_blank"); return; }       // system viewer/share/print sheet
  const f = Object.assign(document.createElement("iframe"), { src: url });
  f.style.cssText = "position:fixed;width:0;height:0;border:0";
  f.onload = () => { try { f.contentWindow!.print(); } catch { window.open(url, "_blank"); } };
  document.body.appendChild(f);
  setTimeout(() => { URL.revokeObjectURL(url); f.remove(); }, 60_000);
}
```

Click handler: load published template (or `DEFAULT_LABEL_TEMPLATE`), fetch order, `buildLabelInputs`, `generateLabelPdf`, `printOrDownload`. Always provide a **Download PDF** action next to Print as a fallback.

**Optional server route (recommended for mobile and bulk).** `GET /api/orders/[id]/label.pdf` runs the same `buildLabelInputs` + `generate` in Node and returns `application/pdf`. A bulk route can accept many order ids and return one multi-page PDF. This gives identical output regardless of the user's browser and is the most reliable path on iOS.

---

## 8) API surface

Same endpoints as the baseline, with these changes:

- `GET /api/label-template` (public): returns `{ name, widthMm, heightMm, logoRef, engine, template, blocks, version } | null`. Print surfaces branch on `engine`.
- `GET /api/admin/label-template`, `POST`, `PATCH /[id]`, `DELETE /[id]`: unchanged contract. Create/update validate with the schema in §5. `POST` creates drafts with `engine: 'pdfme'`.
- `POST /api/admin/label-template/[id]/publish`: unchanged transaction (clear default, insert new row, `version = max + 1`, audit). It now also copies `engine` and `template`.
- New: `GET /api/orders/[id]/label.pdf` (optional, §7).

Client fallback when the endpoint returns `null`: `DEFAULT_LABEL_TEMPLATE` (now a pdfme template reproducing the current default layout).

---

## 9) Implementation steps

**Phase 1 — Foundations**
1. Install: `npm i @pdfme/ui @pdfme/generator @pdfme/schemas @pdfme/common`.
2. Add Drizzle migration (§2); regenerate types; keep `blocks` untouched.
3. Add the Noto Sans JP font to `public/fonts/`.
4. Create `src/lib/label/*` modules (§4), including `default-template.ts` that reproduces the current default label (logo, QR, fields, separator) as absolute coordinates.
5. Write `template-schema.ts` validation (§5) and wire it into create/update/publish routes. Add the `engine` and `template` columns to the Zod payloads.

**Phase 2 — Print path**
6. Implement `buildLabelInputs`, `generateLabelPdf`, `printOrDownload`.
7. Switch `order-label-button.tsx` to the new flow for `engine = 'pdfme'`; keep the old portal path for `'blocks'`.
8. (Optional) add the server PDF route.

**Phase 3 — Designer**
9. Build `PdfmeDesigner` + field palette; replace `LabelBlockEditor` in the Design tab for pdfme drafts.
10. Switch the Preview tab to `Viewer`; keep legacy preview for `'blocks'` versions.
11. Update History for mixed engines; publish copies `engine` and `template`.
12. Seed: first draft created from `DEFAULT_LABEL_TEMPLATE`.

**Phase 4 — Tests and rollout**
13. Tests (below), then enable the pdfme designer for Super Admins behind a feature flag.
14. Print a test label on each real printer model; fix offsets; publish.
15. After a retention window, remove the legacy renderer and `blocks` column.

**Tests**
- `label-inputs.spec.ts`: each field key maps through `resolveLabelField`; nulls become empty; `qr`, `logo`, static `readOnly` behaviour.
- `template-schema.spec.ts`: bounds, duplicate names, disallowed types, QR floor, non-square QR, element cap, size clamp.
- `generate-pdf.spec.ts`: output page size equals label size (for 100×150 mm expect about 283.5 × 425.2 pt, read with `pdf-lib`); multi-input produces N pages.
- Keep existing `clampQrSizeMm` tests; retain legacy renderer specs until removal.
- Component smoke test for `PdfmeDesigner` (mounts, `onChange` fires) with `next/dynamic` mocked.

**Acceptance checks (real hardware)**
- Printed 100×150 label measures 100×150 mm (ruler), no scaling.
- QR scans at the minimum size on the actual printer and stock.
- Barcode scans; Japanese text renders with no tofu boxes.
- Print works from desktop Chrome/Edge/Firefox, Android Chrome, and iOS Safari (PDF route).

---

## 10) Risks and open items

- **Printer driver scaling.** The PDF is exact, but users must pick the matching paper size and "Actual size / 100%". Document this on the print dialog help text.
- **Viewer vs PDF drift.** Compare Viewer and generated PDF for the default template (fonts, alignment, rotation) before launch.
- **Bundle size.** `@pdfme/ui` is large; load only on the designer route and the print click (dynamic import for `generate`).
- **Bundler quirks.** `@pdfme/ui` pulls in a PDF-import module (pdfium WASM). If your Next build complains about Node built-ins or `import.meta.url`, add the matching webpack/Turbopack fallbacks; the designer does not need PDF import.
- **Logo images.** pdfme needs a data URI; fetch with CORS-safe URLs (or server side) and cache the conversion.
- **Text overflow.** Fixed boxes can clip long text. Use pdfme's text auto-fit option (`dynamicFontSize`) for fields like city or site names, and cap field length in the data layer.
- **Licence/versioning.** Pin pdfme versions and review upgrades; the template JSON is the persisted contract.
- **Undecided:** whether to offer batch printing and the server PDF route in the first release.
