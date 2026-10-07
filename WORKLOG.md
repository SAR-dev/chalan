# WORKLOG

> Working design detail for roadmap items. `ROADMAP.md` is the plan (what to
> build, in what order, and why it sits where it sits); this file carries the
> design decisions and rationale behind an item while it is being worked. It is
> forward-looking only — shipped work lives in git history, and a row here is
> removed (or trimmed to its lasting decisions) once the item lands.
>
> Entries cite `file:line` where a claim was verified by hand. Re-verify before
> acting on a citation and update it if the line has moved.

---

## R5 — Printable parcel labels and the label designer

| Field | Value |
|---|---|
| **Status** | Open — spec first, then build |
| **Priority** | P1 (ordered first in the group) |
| **Band** | R4 Product — bar to merge: *spec first, then build* |
| **Blocks** | **R9** (QR-code scanning) — nothing can scan until R5 prints a scannable label |
| **Roadmap ref** | `ROADMAP.md` → P1 → *R5 Printable parcel labels and the label designer* |
| **Recorded** | 2026-10-07 (source re-verified 2026-10-04) |
| **Also recorded in** | `ROADMAP.md` → *Decisions already made* (label template platform-wide & singular; one template scaled to the paper; COD at the foot) |

### 1. Why this item, and why it moved up

- No QR or label-printing code exists today.
- The rider apply page's `rider-apply-print` button (`src/app/apply/rider/page.tsx:221`)
  is the only print flow in the product.
- Photo proof of delivery exists — `deliveryProofRef`, set by the `delivered`
  transition and displayed on the public track timeline
  (`src/app/track/[id]/components/timeline.tsx:218`) — but **there is no
  signature capture** (the old claim that `signature` existed was wrong;
  verified absent 2026-10-04) and **no scannable parcel label**.

| Recipient-facing need today | Status |
|---|---|
| Scannable parcel label | missing — R5 |
| Print flow beyond the rider apply page | missing — R5 |
| Photo proof of delivery | present |
| Signature capture | not planned (photo POD is the proof) |

**Scope grew, and that is why R5 moved up the order.** R9 (parcel QR-code
scanning) has nothing to scan unless R5 prints it, so the QR code ships *as part
of* the label rather than as a later add-on. That hard dependency is the reason
R5 leads P1 ahead of R2/R3.

---

### Scope — what ships

- **Label generation** — a per-order label carrying order reference, merchant,
  destination, recipient name, **recipient phone**, weight, COD amount and a
  **QR code**.
- **One durable code per order**, stored on the order row rather than derived at
  print time, so a reprint is still the same parcel (and a code never silently
  changes under a label that is already stuck to a box). R9 defines what it
  encodes and what it must never contain.
- **One label template, scaled to the paper** — a single thermal layout at
  100×150mm by default; printing on a different paper is a **scale** change on
  that same template, not a second layout. **Reprint lives on the order detail
  page** for merchant and warehouse, alongside the existing history view.
- **Admin label designer** — a platform-wide designer for that one template.

**Recipient phone is on the label on purpose.** `recipientPhone` already exists
on the order row (`src/lib/db/schema.postgres/orders.ts:124`, next to
`recipientName`). On a COD doorstep the rider calls ahead, and an address alone
is frequently not enough to find the recipient — so the phone is a first-class
label field, not an afterthought.

---

### One template, scaled to the paper

| Template | Physical size | Contents | Admin-designed? |
|---|---|---|---|
| **Parcel label** | 100×150 mm (default) | QR + order id + recipient name + recipient phone + merchant + weight + COD at the foot | **yes** |

The label is a **single** admin-authored template. To print onto different paper
you change its **scale** — the `widthMm`/`heightMm` on the same template —
rather than maintain a second, separately laid out sheet; the block stack
reflows inside whatever size is set.

This supersedes the earlier *A4 label sheet (8-up)* decision. The sheet preset,
the multi-up "select N orders → render a sheet" flow and the fixed packing slip
/ invoice are all **withdrawn**, on the owner's call that one template plus a
scale knob is enough. (A 100×150mm label does not tile on A4 anyway — you get
one and a bit — so the sheet was never this layout at a different `@page` size,
but maintaining a second layout is not worth it.)

**The guardrail that survives:** the renderer still enforces the QR code's
**minimum size and quiet zone** at any scale, so shrinking the label cannot
produce an unscannable code. Width/height stay clamped (20–400 mm), and
dimensions — never an Avery part number, which maps to different dimensions per
supplier — remain the source of truth.

---

### Print pipeline

Browser print API is fine to start. Two things must be right early, because
retrofitting them later means reprinting every parcel:

1. **Set the physical page size with CSS `@page`** to the template's configured
   dimensions (`size: 100mm 150mm` for the default, or the browser quietly
   rescales to A4). A scaled QR is a blurry QR, and a QR the camera cannot read
   is precisely the failure R9 is built to avoid — **the print step is where the
   scan is won or lost.**
2. **Prefer generating a PDF over `window.print()`** where the merchant does not
   need to choose printer settings interactively. A PDF is a reprintable artifact
   rather than a transient dialog, it can be produced headless in e2e, and it
   does not leave a dialog the merchant has to dismiss. `window.print()` stays
   for the "print now" path.

---

### The admin label designer

**Platform-wide only.** No per-merchant templates and no fallback chain until a
merchant actually asks — matching how the rest of `platform-config` works. The
alternative taxes day one with a merchant picker, precedence rules and a "why is
my label different" support load, for zero merchants who have requested it. The
per-merchant migration stays additive if it is ever needed: a nullable
`merchantId` plus a lookup that falls back to the default.

**One row, not one per size.** `label_template` holds exactly one platform-wide
row (draft and published versions aside); `isDefault` marks the one the plain
*Print* action reaches for.

**The COD amount prints as small type at the foot of the label**, as a
toggleable block, never in the main body. The amount stays authoritative in the
app. Rationale: the label is on the outside of the box, so a large COD figure
advertises what is inside to anyone who can see the parcel — an `xs`-scale block
is legible to the rider and recipient for reconciliation but not from arm's
length.

**No invoice / packing slip.** Withdrawn from R5 entirely — the owner does not
need the document.

---

### The block model — the source of truth

**The template is a JSON array of typed blocks. That array is the source of
truth, and everything else renders it.**

```jsonc
[
  { "type": "logo",     "width": "half" },
  { "type": "qr",       "minSizeMm": 30, "caption": true },
  { "type": "field",    "field": "recipientName", "scale": "l", "bold": true },
  { "type": "field",    "field": "recipientPhone", "scale": "m" },
  { "type": "field",    "field": "recipientAddress", "width": "full" },
  { "type": "separator" },
  { "type": "field",    "field": "codAmount", "scale": "xs" },
  { "type": "spacer",   "heightMm": 4 }
]
```

- **One renderer.** `blocks → <LabelRenderer>` renders on screen (CSS-scaled to
  fit the panel) *and* under `@media print` at the true `@page` size. Same
  component both times, so WYSIWYG is structural rather than aspirational — and
  it is why the print bullet above matters: the renderer is where the QR code's
  minimum size and quiet zone are actually enforced, whatever the admin picked.
- **Never rasterize a label.** `html2canvas` + `jsPDF` produces a bitmap, which
  blurs the QR code and breaks R9 outright. A future PDF generator must consume
  the *block array* and emit vector text — **the model is the contract, the
  renderer is swappable.**
- **A block list, not a drag-drop canvas.** A delivery label is a vertical stack;
  absolute positioning means collision handling, mm-precise dragging and resize
  handles for a shape that does not need them — plus drag-drop accessibility debt
  in a repo that already enforces 44 px targets. Reorder with up/down buttons:
  keyboard-accessible for free.
- **Preview mirrors the tabs already shipped** in
  `src/features/announcements/components/markdown-editor.tsx`:
  - **Design** — block list: add, type, per-block fields, reorder, delete.
  - **Preview** — the label at true physical size.
  - **Publish** promotes draft → published and bumps `version`; printing reads
    **only the published row**.

---

### Schema

A dedicated `label_template` table, **not** a `platform_config` entry (that
store is key/value and has no revisions):

```ts
{ id, name,
  widthMm, heightMm,                    // the "scale": clamped 20–400mm and
                                        // applied to the single template
  logoRef: text | null,                 // via src/lib/storage/*
  blocks: jsonb().$type<LabelBlock[]>(),
  version: integer,                     // bumps on publish
  publishedAt: ts | null,               // null = draft
  isDefault: boolean,                   // partial unique index → exactly one
                                        // default, for the platform
  createdBy, updatedBy, createdAt, updatedAt }
```

One row, never per merchant — see *One template, scaled to the paper* above.

`$type<T>()` is the pattern `announcement.targetRoles` and `bulkCancel.orderIds`
already use; `LabelBlock` gets a Zod schema in `src/lib/validation.ts` like every
other payload. **Revisions are append a row per publish**, not an overwrite — one
insert, and the history survives.

---

### Stored config, not code — the rules that make that true

- **Field keys are a whitelist** (`recipientName`, `recipientPhone`,
  `recipientAddress`, `codAmount`, `weight`, …) drawn from what exists on
  `order`, never free text.
- **React escapes by default; never `dangerouslySetInnerHTML`.**
- **Font size is an enum** (`xs`–`xl` + bold), not free px — enough to compose a
  label, not enough to produce an unscannable one.
- **Logo uploads** go through the existing storage abstraction; validate MIME and
  size on the way in.
- **The QR block is not freely scalable** — `minSizeMm` and the quiet zone are
  enforced by the renderer, not by the admin's discretion.

---

### Ruled out (so nobody re-litigates it)

| Option | Why not |
|---|---|
| `html2canvas` + `jsPDF` (rasterize the label) | produces a bitmap → blurry QR → breaks R9 outright |
| A second A4 layout / 8-up sheet | withdrawn: the owner chose one template + a scale knob over maintaining a second layout |
| Packing slip / invoice | withdrawn from R5 entirely — not needed |
| Per-merchant templates + fallback chain | day-one picker + precedence + support load for zero requesters |
| Drag-drop canvas / absolute positioning | collision handling, mm dragging, resize handles, drag-drop accessibility debt — for a vertical stack |
| Avery part numbers in the schema | L7160/L7163/L7165 map to different dimensions per supplier |

---

### Dependencies and boundaries

- **R5 → R9:** R9 does not start until R5 prints a scannable label. The QR code
  ships *inside* R5, not as an R9 add-on.
- **One durable code per order** (stored, not derived at print time) is the R5
  half of R9's need: a reprint must still be the same parcel. R9 owns what the
  code encodes and what it must never contain (opaque per-parcel reference, no
  personal data).
- **Copy** in the label and design tool follows R1's writing rule — new
  user-facing strings go in `src/config/content.ts` (and
  `src/config/table-column-labels.ts` for headers), never as new inline
  literals.
- **Not in scope for R5:** SMS (withdrawn), signature capture beyond the existing
  photo POD, and any scanning surface (that is R9).

---

### Acceptance criteria / checklist

Design (this document):

- [x] One template with physical size and contents, incl. recipient phone
- [x] Scaled to the paper; the withdrawn sheet / invoice recorded
- [x] Block-array model, one renderer, no rasterization
- [x] Designer shape (Design / Preview / Publish) and `label_template` schema
- [x] Platform-wide, single row, QR code
- [x] COD as a small foot block

Build:

- [x] `label_template` table + `LabelBlock` Zod schema in `src/lib/validation.ts`
- [x] Per-order code for the QR — `order.id` (unique, no PII, already in every list payload)
- [x] `LabelRenderer` block layout with QR min-size/quiet-zone enforcement (screen + `@media print`)
- [x] `@page` sized from the template's configured dimensions (100×150 mm default)
- [x] Quick-print + reprint from the order tables (warehouse, superadmin) and rider queues
- [ ] Single-label print + reprint on the order detail page
- [x] Admin designer (Design/Preview/Publish) with append-only versions and API routes
- [ ] PDF generation path (vector, consumes the block array) alongside `window.print()`
- [x] Tests: unit for the block schema/renderer guards, e2e for the print + designer flows

### Build progress (2026-10-07)

Landed (uncommitted):

- **Schema + migration.** `label_template` (`src/lib/db/schema.postgres/labels.ts`,
  barrel-exported), one partial-unique `isDefault` row, `jsonb blocks`,
  `version`/`publishedAt` for append-only publishing. Generated
  `drizzle/postgres/0002_flat_deadpool.sql` (journal + snapshot updated).
- **Block model.** `LabelBlock` discriminated union + `labelTemplateCreateSchema`
  / `labelTemplateUpdateSchema` in `src/lib/validation.ts`; enums and the 20–400 mm
  clamp live in `src/lib/constants.ts` (`LABEL_*`). `LabelTemplate` in
  `src/lib/types.ts`.
- **Renderer core.** Pure `src/lib/label-layout.ts` (`resolveLabelField`,
  `clampQrSizeMm`, mm font scale) and `src/components/label-renderer.tsx`
  (renders the block stack at true physical size; QR drawn with `QRCodeSVG`,
  `marginSize: 4` quiet zone, `level: "M"`, edge clamped to `LABEL_QR_MIN_MM`).
- **Tests.** `src/lib/label-layout.spec.ts` + label cases in
  `src/lib/validation.spec.ts`.

Still open after that first slice: the quick-print action, the designer, the
vector PDF path, the API routes, e2e.

### Print action + designer — landed (2026-10-07)

Second slice, closing the build out except for the order-detail entry point and
the PDF path:

- **Quick-print action.** `src/features/orders/components/order-label-button.tsx`
  — a reusable button that mounts the shared `<LabelRenderer>` into a print-only
  portal and hands the page to `window.print()`. `labelPrintStyles()` pins
  `@page` to the template's mm dimensions and hides every other body child while
  printing, so page chrome and the surrounding table never bleed onto the label.
  Exposed as a table column via `orderLabelColumn()` and wired onto the
  warehouse order queue, the Ongoing board, the two rider queues, and the
  superadmin order table; each surface reads the published template through
  `usePublishedLabelTemplate()` so a quick-print matches what the designer
  published.
- **QR value.** `order.id` — see *Durable per-order code* below.
- **Designer.** `src/app/dashboard/label-designer/` (Super-Admin gate) with
  Design / Preview / History tabs, backed by
  `useLabelTemplates()` (`saveDraft` / `publish` / `discardDraft`).
  `saveDraft` returns the saved id so Publish always ships the on-screen draft,
  never an older version. The editor seeds once from `draft ?? published` behind
  a null-`form` sentinel, so a background revalidation cannot clobber typed
  edits.
- **API.** Public read `GET /api/label-template` (published block layout only —
  no PII; allowlisted in `route-auth-guard.spec.ts`) plus the authenticated
  `admin/label-template` create/update/read, `[id]` update/delete, and
  `[id]/publish` append-only publish. `401` (no session) and `403` (wrong role)
  are distinct.
- **Tests.** `src/features/orders/components/order-table-columns.spec.tsx`,
  `src/features/platform-config/components/label-block-editor.spec.tsx`,
  `src/app/api/admin/label-template/label-template.spec.ts`, and e2e
  `e2e/specs/38-print-label.spec.ts` + `e2e/specs/39-label-designer.spec.ts`.

### Durable per-order code — decided (2026-10-07)

R5 does **not** add a column. The code the label's QR encodes is `order.id`
(`orders.ts`): already stored on the order row, already unique, carries no
personal data, and already present in every list payload the warehouse and rider
tables receive — so the same parcel prints the same code for whoever prints it,
and a reprint never silently changes it. R9 owns what a scan does with the
value.

---

## R9 — QR-code reading (the scanner wrapper)

Quick decision record; the full design lives in `ROADMAP.md` → R9.

**Engine: native `BarcodeDetector` first, `barcode-detector` ponyfill (wraps
`zxing-wasm`) fallback**, behind one wrapper module. Feature-detect
(`"BarcodeDetector" in globalThis`), never UA-sniff. Self-host the `.wasm` (the
ponyfill defaults to a CDN, which `script-src 'self'` rejects) and add the narrow
`'wasm-unsafe-eval'` to CSP — not `'unsafe-eval'`.

**`qr-scanner` (nimiq) — considered and rejected (2026-10-07).** It has the same
native-first shape (it uses `BarcodeDetector` when present), but its fallback
decoder is `jsqr-es6` — a pure-JS fork of jsQR, itself a JS port of ZXing — which
is **weaker than `zxing-wasm` on glare, blur and creases**, exactly the parcel
condition that justifies QR in the first place. It also ships its own `<video>`
and scan-region overlays (the reason `html5-qrcode` was ruled out), and its npm
release is ~3 years old against `zxing-wasm`'s active cadence. Its one real
advantage — no `'wasm-unsafe-eval'` CSP change — is a convenience, not a
capability. **Keep `zxing-wasm`; revisit `qr-scanner` only if relaxing CSP becomes
unacceptable.**