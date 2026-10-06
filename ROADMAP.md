# ROADMAP

> Forward-looking only - shipped work lives in git history.
>
> **Open work:** R4 Product only. R0-R3 closed earlier, and R5 Polish is
> closed - see the ledger in git history and the decisions below.
> **SMS has been withdrawn from planning** - see Decisions.
>
> **Health:** `pnpm ci:check` green (909 files) · Unit **2385 pass** (2428
> total, 228 spec files) · coverage **55.98 / 50.30 / 44.44 / 56.87** against
> floors **50 / 45 / 40 / 52** · real-DB integration **43/43** · E2E **149
> tests / 37 files / 78 scenarios**, run locally only
> (`pnpm test:e2e`, ~8 min) by decision - CI runs quality · build · security ·
> coverage · integration jobs and nothing else · `route-auth-guard.spec.ts`
> enforces server-side auth on all 129 API route files · `pnpm build` green.
>
> The coverage floors, the spec-file count and the E2E summary in this block are
> asserted by `src/app/__tests__/docs-drift.spec.ts` and fail when they drift.
> The unit / integration / biome totals are hand-refreshed - see Guardrails.
>
> **Every change verifies with:** `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` when DB invariants
> move).
>
> **Source of this document:** a full re-audit (product · data layer ·
> operability · accessibility), re-verified 2026-10-04 against the tree after
> the TopNav / announcement read-state rework. Every entry cites a `file:line`
> that was verified by hand - re-verify before acting, and update the citation
> if the line has moved.

---

## The plan

| Priority | Items | Status |
|---|---|---|
| **P1 - High-leverage product work** | R5 · R9 · R2 · R3 | open (R1 decided · R8 shipped) |
| **P2 - Later product bets** | R4 · R6 · R7 | open |

### Dependencies

| Item | Hard dependency | Soft constraint |
|---|---|---|
| **R1** i18n decision | none | **Decided - deferred** (see Decisions). New user-facing copy in R2 / R3 / R5 / R9 / P2 goes in `src/config/content.ts`, not new inline literals |
| **R5** Invoices, printable parcel labels + barcode, admin label designer | none | label, invoice and design-tool copy follow R1's writing rule. **Blocks R9** - the label has to print before anything can scan it, which is why R5 is pulled ahead of R2/R3 |
| **R9** Parcel barcode scanning at pickup + delivery | **R5** | a scan proves possession of the parcel, never rider identity - it must not weaken the auth guard. Scanning and manual code entry are two routes to the same action, so a dead camera never blocks a delivery |
| **R2** API keys, webhooks, OpenAPI | none | docs page and error copy follow R1's writing rule. `/api/v1/orders` should accept the order's `recipientMail` |
| **R3** Notifications (in-app, preferences) | none — its R8 prerequisite is **shipped**: `recipientMail` is on the order | copy follows R1's writing rule. Shares R2's event source (`src/features/orders/transitions.ts`) - emit once, fan out to both sinks |
| **P2** items (R4 · R6 · R7) | none | copy follows R1's writing rule |

**One item blocks another:** R9 cannot start until R5 prints something scannable,
so R5 sits ahead of R2/R3 rather than last. Everything else here is ordered by
leverage and cost, not necessity — and the one other dependency this plan
carried, R3's customer-email step needing the recipient's address, is now
satisfied by the shipped `recipientMail` field.

P1 and P2 are the only groups left; earlier priorities were R5 polish work and
are closed. The open items and priority groups were renumbered in order of work
(R1-R7, P1-P2). Ids in older git history use the previous numbering:

| Now | Item | Was |
|---|---|---|
| R1 | Bangla / i18n | R4.2 |
| R2 | Merchant integration surface | R4.3 |
| R3 | Notification system | R4.1 |
| R4 | Delivery windows and time slots | R4.6 |
| R5 | Invoices, printable parcel labels and the label designer | R4.7 |
| R6 | Promotional and volume-based pricing | R4.8 |
| R7 | Reporting exports | R4.9 |

Priority groups: P1 (was P3) and P2 (was P4). The old P1 and P2 were closed
R5 polish work and have no entry, so an old reference to either means that.

R9 is new and has no earlier id: parcel barcode scanning (there was no earlier
scanning item - the old R4.4 SMS was a different thing entirely). R8 was also
new and has since shipped, so it no longer appears above; its field is
`recipientMail` on the order.

The old R4.4 (SMS) was withdrawn and has no entry; a reference to it in
history means that, not Delivery windows.

---

## How to work this roadmap

| Band | Meaning | Bar to merge |
|---|---|---|
| **R0 Correctness** | the app shows or stores wrong data today | full gate + `pnpm test:integration` if DB invariants move |
| **R1 Quality gates** | a bug could ship unnoticed | `pnpm ci:check` **plus a test that fails without the fix** |
| **R2 Accessibility** | a user cannot operate the product with AT/keyboard | axe or Lighthouse pass on the touched route |
| **R3 Platform & ops** | silent failure risk in production | `pnpm build` + deploy dry-run |
| **R4 Product** | growth / market fit | spec first, then build |
| **R5 Polish** | consistency and dead weight | `pnpm ci:check` |

**R0-R3 and R5 are closed**, so only R4 is open - in the two groups above. The
closed bands stay in the table because their bars still apply if one reopens: a
newly discovered R0-class defect jumps the queue, and nothing in R4 ships while
an R0 item is open.

**The P groups carry the order of work; ids are only identifiers.** R5 sits in
P1 ahead of R4 on purpose, and now also ahead of R2/R3 - R9 is blocked on it.
What decides where an item sits is what it blocks and what it costs to land,
not when it was written down.

**Order:** **R5** first - label generation, printing and the admin label
designer - because **R9**, parcel barcode scanning at pickup and delivery,
cannot start until there is something scannable on the parcel. Then R2 and R3,
which are independent of each other and can be reordered or run in parallel.
R1 is already decided (deferred i18n) and needs no turn in the order - it only
shapes the copy in what follows. R8 used to lead this order; it has shipped and
left the plan.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **SMS is out of scope** | Withdrawn from this roadmap (it was R4.4 in the earlier numbering). The platform sends no SMS and none is planned. The two `SMS` strings at `src/app/track/page.tsx:49` and `:205` are deliberately untouched — line 205 attributes the message to *the merchant* ("the SMS or email your merchant sent"), who may text their own customer outside the platform. Do not "fix" this copy by wiring an SMS provider; that needs a new roadmap item. |
| **R1 i18n — Bangla ships in a later phase** | Decided, so R1 is no longer open. This is *not* an English-only lock-in: the framework is simply deferred. Until that phase, all new user-facing copy goes through `src/config/content.ts` (page copy) and `src/config/table-column-labels.ts` (table headers) instead of new inline literals — that is where a future `messages/*` catalog starts, and it is the only part of this decision that constrains R2/R3/R5/P2. `lang="en"` at `src/app/layout.tsx:87`, `src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:86` stays as-is; no `next-intl`/`i18next` dependency is added now. |
| **Label templates are platform-wide, one row per size** | No per-merchant templates and no fallback chain until a merchant actually asks for one — the alternative taxes day one with a merchant picker, precedence rules and a "why is my label different" support load, for zero merchants who have requested it. *Platform-wide does not mean one row:* the thermal label and the A4 sheet are different physical sizes with different layouts, so `label_template` holds **one row per size** and `isDefault` marks the default. The per-merchant migration stays additive — a nullable `merchantId` plus a lookup that falls back to the default. |
| **The A4 sheet ships one preset; the packing slip keeps a fixed layout** | Sheet stock is a **preset list, never free dimensions** — a free-form width/height lets an admin author labels there is no paper for (the same failure class the font-size enum prevents), and the layout must match a buyable sheet. **Launch preset: 99.1 × 67.7 mm, 2×4, 8-up** — the only common A4 stock with room for a ~35mm QR plus a full address plus the COD line; 99.1 × 38.1 (14-up) crowds the address into two lines and 63.5 × 38.1 (21-up) cannot carry a scannable code with an address at all. Record **dimensions and row/column layout, never an Avery part number** — L7160/L7163/L7165 disagree across suppliers, so a part code in the schema would be a latent bug. Adding stock later is an enum value, not a redesign. The packing slip / invoice is a document rather than a stick-on, so it keeps a fixed A4 layout and stays out of the designer until a merchant asks for it. |
| **The COD amount prints as small type at the label's foot** | The label is on the *outside* of the box, so a prominent COD figure advertises cash inside and is a theft risk on a doorstep. It renders as an `xs`-scale, toggleable block at the foot — legible to the rider and the recipient for reconciliation, not from arm's length by a bystander. The amount stays authoritative in the app and on the packing slip. |
| **E2E runs locally, not in CI** | `pnpm test:e2e` (149 tests, ~8 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost - do not "helpfully" re-add an `e2e` job. The commented block in `ci.yml:170-217` stays commented; `ci-workflow.spec.ts` still validates its step ordering by stripping comment markers, so re-enabling must keep that order. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. Current measurement sits ~5-6 points above the floors; a drop toward them is a signal, not headroom. |
| **CI is quality, build, security, coverage and integration** | `.github/workflows/` holds `ci.yml` and `deploy.yml` only. Code scanning is not part of the gate - `ci.yml`'s `security` job covers `pnpm audit` plus the advisory dependency review, and nothing more. |
| **Rows per page is one persisted preference, not a per-table control** | It lives on the user row (capped by `MAX_TABLE_ROWS_PER_PAGE`), is edited in Account Settings, and `DataTable` applies it as every table's default size. A second, unpersisted control in the footer would only have disagreed with the first. Do not add a rows-per-page `<select>` back to `TableFooter`. |
| **`style-src` keeps `'unsafe-inline'`** | Investigated and rejected. ~50 React `style={{...}}` bindings need `style-src-attr 'unsafe-inline'`, and `nextjs-toploader`'s `<style>` cannot be nonced: it renders the nonce without `suppressHydrationWarning`, so server value and client render disagree and hydration breaks. The reasoning is at `src/app/layout.tsx:94-97`. The only real hardening left is splitting `style-src-elem` (nonce) from `style-src-attr`; do not "simplify" the directive away. |
| **The Docker runner keeps the full dependency tree** | Investigated and rejected. The monolith's `migrate` service runs `node_modules/.bin/tsx` out of this same image, so a `--prod` install would break migrations. A `deps-prod` stage already existed and was removed as dead work, and `dockerfile-stages.spec.ts` asserts `COPY --from=deps ...node_modules` and forbids `pnpm install --prod`. Reducing image weight means moving `tsx` into `dependencies` first, not adding a stage. |
| **`biome.json` must stay strict JSON** | Biome rejects comments in it. JSONC goes in `biome.jsonc`. Its `files.includes` scopes it to `src/`, `e2e/`, `env/`, `scripts/` and root files (`.next/**` is excluded by omission). Pinned by `biome-config.spec.ts`. |

---

# P1 - High-leverage product work

R5 leads: it is the label work R9 is blocked on. R1 was an item in this group
and is now decided (deferred i18n - see Decisions), so what survives of it is a
writing rule rather than a build: copy in R2 / R3 / R5 / R9 / P2 goes through
`config/content.ts`. R8 - recipient email - has shipped and left this group.

One dependency remains, and it is the reason for the order: R9 (barcode
scanning) cannot start until R5 prints a scannable label. R3's other
prerequisite - the recipient's address, which its customer emails need - shipped
with R8, so nothing waits on it any more.

### R1 Bangla / i18n - **decided: deferred to a later phase**

Recorded in Decisions; this section is now the rationale, not an open question.
What remains of R1 is a writing rule, not a build.

Zero i18n framework (`next-intl`, `i18next`, `useTranslation` all return 0
matches), `lang="en"` hardcoded at `src/app/layout.tsx:87`,
`src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:86`, and ~310
`aria-label=` / `placeholder=` / `title=` / `emptyMessage=` literals across
`src/app/**` and `src/features/**` alone - before counting plain JSX copy.
`src/lib/content-keywords.ts` is branding-only, not translation.

Retrofitting a catalog over ~500 string sites later is far more expensive
than standing up `messages/en.json` today with `config/content.ts` as its
first consumer. Table headers are already centralised in
`src/config/table-column-labels.ts`, and page copy in `src/config/content.ts` -
those two are the shape a catalog would take.

**Decision (recorded — R1 is closed):** *Bangla ships in a later phase.* Not an
English-only lock-in; the framework is deferred. The one thing that follows from
it is a writing rule: **new copy goes in `src/config/content.ts` and
`src/config/table-column-labels.ts`, never as a new inline literal**, so the
future catalog has a single place to start instead of ~500 scattered sites.
`lang="en"` and the empty framework stay untouched until that phase. Full detail
is in Decisions above.

### R5 Invoices, printable parcel labels and the label designer

No `invoice` or `barcode` code - the only hits are prose in `src/content/terms.md`
and the merchant help doc. The rider apply page's `rider-apply-print` button is
the only print flow in the product. Photo proof of delivery exists
(`deliveryProofRef`, set by the delivered transition, displayed on the public
track timeline), but **there is no signature capture** (the old claim that
`signature` was present was wrong - verified absent 2026-10-04) and no
scannable parcel label. Merchants need a printable packing slip and a label;
POD is covered, the label is not.

**Scope grew, and that is why this moved up the order:** R9 has nothing to scan
unless R5 prints it, so the barcode ships *as part of* the label rather than as
a later add-on.

**Ship:**

- **Label generation** - a per-order label carrying order reference, merchant,
  destination, recipient name, weight, COD amount and a **barcode**.
- **One durable code per order**, stored on the order row rather than derived at
  print time, so a reprint is still the same parcel (and a code never silently
  changes under a label that is already stuck to a box). R9 defines what it
  encodes and what it must never contain.
- **Print flows**: three templates — a single thermal label, an A4 label sheet
  for merchants without a thermal printer, and a packing slip / invoice. See
  *The three templates* below. 100x150mm thermal is the default. Reprint lives
  on the order detail page for merchant and warehouse, alongside the existing
  history view.
- **How it prints - browser print API is fine to start.** Two things to get
  right early, because retrofitting them later means reprinting every parcel:
  1. **Set the physical page size with CSS `@page`** (`size: 100mm 150mm` for
     thermal, or the browser quietly rescales to A4). A scaled barcode is a
     blurry barcode, and a blurry barcode is precisely the failure R9 is built
     to avoid - the print step is where the scan is won or lost.
  2. **Prefer generating a PDF over `window.print()`** where the merchant does
     not need to choose printer settings interactively. A PDF is a
     reprintable artifact rather than a transient dialog, it can be produced
     headless in e2e, and it does not leave a dialog the merchant has to
     dismiss. `window.print()` stays for the "print now" path.
- **Admin label designer.** Decisions closed: **platform-wide only** (no
  per-merchant templates and no fallback chain until a merchant actually asks —
  matching how the rest of `platform-config` works), **one A4 sheet preset at
  launch with the stock list kept extensible**, **the packing slip keeps a fixed
  layout and stays out of the designer**, and **the COD amount prints as small
  type at the foot of the label**, as a toggleable block, never in the main
  body.

  *Platform-wide does not mean one row.* The thermal label and the A4 sheet are
  physically different sizes with different layouts, so `label_template` holds
  **one row per size** — still platform-wide, never per-merchant — and
  `isDefault` marks the one the plain *Print* action reaches for.

#### The three templates

| Template | Physical size | Contents | Admin-designed? |
|---|---|---|---|
| **Parcel label — thermal** | 100×150mm (default) | QR + order id + recipient + merchant + weight + COD at the foot | **yes** |
| **Parcel label — A4 sheet** | 99.1 × 67.7 mm, 2×4 (**8-up**) | the same content at sheet scale | **yes** (its own layout) |
| **Packing slip / invoice** | A4, one page | order lines, merchant, totals, order ids | **no** — fixed layout |

**A 100×150mm label does not tile on A4** (210×297 — you get one and a bit), so
"multi-up" only means anything on a *smaller* stock: 99.1×38.1mm is 16-up,
105×74mm is 8-up, 63.5×38.1mm is 24-up. The sheet is therefore **not the thermal
label rescaled** — at 99.1mm the QR has far less room, the address collapses to
two lines and the COD block may not fit. Sharing one layout across both sizes
would mean a reflow engine that silently drops content, which is how a label
gets printed without its barcode.

Three consequences:

1. **The stock list is a preset, not a free dimension.** The admin picks from a
   list of buyable sheets. A free-form width/height lets someone author labels
   there is no paper for — the same failure class the font-size enum prevents.
   **Launch preset: `99.1 × 67.7 mm`, 2 × 4, 8-up.** It is the only common A4
   stock with room for a ~35mm QR *and* a full recipient address *and* the COD
   line without crowding; `99.1 × 38.1` (14-up) is more widely stocked but its
   38.1mm height forces a dense layout where the address collapses to two lines,
   and `63.5 × 38.1` (21-up) is simply too small to carry a scannable code and
   an address together. Adding another stock later is an enum value, not a
   redesign.

   *Record dimensions + row/column layout, never an Avery part number.* L7160,
   L7163 and L7165 each map to different dimensions depending on the supplier
   — verified across four sources that disagreed — so a part code in the schema
   would be a bug waiting to happen.
2. **Single-label print and sheet print are different code paths.** A single
   label is one order onto one page; a sheet is **a batch of *different*
   orders**, tiled N-up, each tile carrying *its own* order's QR. So the sheet
   needs a "select N orders → render sheet" entry point (the orders table
   already has bulk selection) rather than just a different `@page` size.
3. **The packing slip stays out of the designer.** It is a document, not a
   stick-on: nobody needs to reposition a packing slip, and folding it in would
   add a third block model to maintain for no request. Fixed A4 layout, promote
   it later if a merchant asks.

#### How the designer works

**The template is a JSON array of typed blocks — that array is the source of
truth, and everything else renders it.**

```jsonc
[
  { "type": "logo",     "width": "half" },
  { "type": "barcode",  "minWidthMm": 30, "caption": true },
  { "type": "field",    "field": "recipientName", "scale": "l", "bold": true },
  { "type": "field",    "field": "recipientAddress", "width": "full" },
  { "type": "separator" },
  { "type": "field",    "field": "codAmount", "scale": "xs" },
  { "type": "spacer",   "heightMm": 4 }
]
```

- **One renderer.** `blocks → <LabelRenderer>` renders on screen (CSS-scaled to
  fit the panel) *and* under `@media print` at the true `@page` size. Same
  component both times, so WYSIWYG is structural rather than aspirational — and
  it is why the print bullet above matters: the renderer is where the barcode's
  minimum size and quiet zone are actually enforced, whatever the admin picked.
- **Never rasterize a label.** `html2canvas` + `jsPDF` produces a bitmap, which
  blurs the barcode and breaks R9 outright. A future PDF generator must consume
  the *block array* and emit vector text — the model is the contract, the
  renderer is swappable.
- **A block list, not a drag-drop canvas.** A delivery label is a vertical
  stack; absolute positioning means collision handling, mm-precise dragging and
  resize handles for a shape that does not need them — plus drag-drop
  accessibility debt in a repo that already enforces 44px targets. Reorder with
  up/down buttons: keyboard-accessible for free.
- **Preview mirrors the tabs you already ship** in `markdown-editor.tsx`:
  **Design** (block list: add, type, per-block fields, reorder, delete) and
  **Preview** (the label at true physical size). **Publish** promotes draft →
  published and bumps `version`; printing reads only the published row.

**Schema** — a dedicated `label_template` table, not a `platform_config` entry
(that store is key/value and has no revisions):

```ts
{ id, name,
  widthMm, heightMm,                    // clamped 20–400mm — and a *preset* for
                                        // sheet stock, never a free dimension
  logoRef: text | null,                 // via src/lib/storage/*
  blocks: jsonb().$type<LabelBlock[]>(),
  version: integer,                     // bumps on publish
  publishedAt: ts | null,               // null = draft
  isDefault: boolean,                   // partial unique index → exactly one
                                        // default, across the per-size rows
  createdBy, updatedBy, createdAt, updatedAt }
```

One row per size, never per merchant — see *The three templates* above.

`$type<T>()` is the pattern `announcement.targetRoles` and `bulkCancel.orderIds`
already use; `LabelBlock` gets a Zod schema in `src/lib/validation.ts` like
every other payload. Revisions are **append a row per publish**, not an
overwrite — one insert, and the history survives.

**Stored config, not code — the rules that make that true:**

- **Field keys are a whitelist** (`recipientName`, `codAmount`, `weight`, …)
  drawn from what exists on `order`, never free text.
- **React escapes by default; never `dangerouslySetInnerHTML`.**
- **Font size is an enum** (`xs`–`xl` + bold), not free px — enough to compose a
  label, not enough to produce an unscannable one.
- **Logo uploads** go through the existing storage abstraction; validate MIME and
  size on the way in.
- **The barcode block is not freely scalable** — `minWidthMm` and the quiet zone
  are enforced by the renderer, not by the admin's discretion.

Band **R4 Product** - spec first, then build. **Blocks R9.**

### R9 Parcel barcode scanning at pickup and delivery

Riders identify parcels by eye or by typing an order reference. At the two
points where taking the wrong parcel is expensive - *starting a pickup* and
*handing one over as delivered* - the rider should scan the label and have the
app confirm it is the parcel on screen.

**Hard dependency: R5.** Nothing exists to scan until a labelled barcode
prints. Do not start this first.

**Ship:**

- **A scanner surface in the rider app**, opened at the two possession changes.
  The delivery side is unambiguous: **`delivered`**. The pickup side needs one
  decision at spec time, because there are two candidates and they are not the
  same moment - **`out-for-pickup`** is the rider *starting* the pickup leg
  (before reaching the merchant, so there is no parcel in hand to scan), while
  **`picked-up`** is where the rider actually takes possession. Scanning
  implies the label is already in front of you, so `picked-up` is the
  technically consistent choice; if "pickup starts" is meant as the leg
  beginning, the scan has to become a read-back of what was loaded rather than
  a barcode read. **Settle this in the spec before building.**
  On a match the existing transition proceeds unchanged; on a mismatch it
  refuses and names the parcel that was actually read.
- **A camera-dead path that always works.** Permission denied, no camera,
  non-secure origin, poor light, broken lens - every one falls through to
  manual code entry. The scan is an accelerator, never a gate: a rider must not
  be unable to deliver because a camera failed.
- **Offline first.** Riders work on weak connectivity, so the expected code
  travels with the order payload they already loaded and the match is decided
  on the device, sent when the connection returns. Manual entry is the offline
  route too.

#### The scanner wrapper - its own deliverable, shipped inside R9

Not an R-numbered item: it cannot ship independently, because there is nothing
to point it at until R5 prints a label, so it would carry a dependency row that
says only "depends on R5" for no gain. It is broken out here because it has its
own acceptance criteria, and because getting it wrong fails *silently* on part
of the fleet - a rider whose camera "doesn't work" reports a broken phone, not a
missing decoder.

**Decision: native first, WASM fallback, behind one interface.**

`BarcodeDetector` is Chromium-only today - Firefox has never implemented it, and
Safari has it **disabled by default** on macOS *and* iOS. On iOS no other engine
is possible, so "Safari has it off" means **no browser on iOS can scan natively
at all**. That is not a long tail; for a field workforce it is half the fleet.
MDN marks the API Limited availability (not Baseline), and Shape Detection is
not on the W3C standards track - so treat it as a fast path, not a foundation.

Native is nonetheless tried first: ~2-3x faster than ZXing, no download, works
the moment the page loads, and **requires no CSP change** - which the WASM path
does. Skipping it for the sake of one consistent path would buy uniformity at
the cost of speed, offline behaviour and a policy relaxation on most devices.

Use the **`barcode-detector` ponyfill** (wraps `zxing-wasm`): it exposes the
*same* `BarcodeDetector` API, so the app keeps **one code path** and only the
constructor is swapped. Feature-detect (`"BarcodeDetector" in globalThis`);
never sniff a user agent. Call `BarcodeDetector.getSupportedFormats()` at
runtime, since the symbology list varies by platform, and ask only for what is
actually offered.

**Acceptance criteria:**

- [ ] one wrapper module; no call site constructs a detector itself
- [ ] feature detection only - no user-agent string anywhere in the scanner
- [ ] a Chromium device takes the native path (the WASM module is not loaded)
- [ ] an iOS or Firefox device reaches the WASM path and reads a code
- [ ] the `.wasm` is self-hosted and decodes with the network offline
- [ ] CSP passes with `'wasm-unsafe-eval'` added, and nothing else loosened

**The two blockers, both already in this repo:**

1. **The CSP will block the WASM decoder.** `script-src` is
   `'self' 'nonce-…'` with no `'wasm-unsafe-eval'` (`src/proxy.ts:74`), and
   Chrome refuses WebAssembly compilation without it. The fix is the narrow
   `'wasm-unsafe-eval'` (it permits compiling `.wasm` only - it is *not*
   `'unsafe-eval'`, which would also unlock `eval()`), and it needs the same
   review as the `style-src` decision in Decisions.
2. **The `.wasm` must be self-hosted.** The `barcode-detector` ponyfill
   defaults to fetching `zxing-wasm` from a CDN, which `script-src 'self'`
   rejects - and riders need it offline anyway.

**Ruled out, so nobody re-litigates it:**

| Option | Why not |
|---|---|
| `html5-qrcode` | ships its own scanner UI that would fight ours; its `BarcodeDetector` path is experimental |
| `@zxing/browser` (pure JS) | slower than the WASM build, for no benefit |
| Commercial SDKs (Dynamsoft, Scanbot) | good, and paid for capability this does not need yet |
| WebHID / WebUSB hardware scanners | right for a warehouse floor, wrong for field riders - revisit only if that appears |

#### Symbology - QR primary, human-readable fallback

**Encode a QR**, with the order code printed beneath it as plain text.

QR reads at an angle, at distance, and through wrinkles, glare and poor light -
which is the entire condition of a parcel being handed over. Code 128 is
smaller and standard on logistics labels, but needs precise alignment and gives
up quickly on a curved or creased thermal label, where a rider is most likely to
be scanning. Code 128 may *additionally* be printed for any fixed scanner
elsewhere in the chain, but the rider's path must work on QR alone.

The human-readable line is not decoration: it is what the rider types when the
camera dies, and what a support agent reads over the phone.

**Encoding rule:** an opaque per-parcel reference only - no recipient name,
phone or address. Anyone photographing a parcel on a doorstep would otherwise
harvest personal data off the box. A scan proves possession of the *parcel*,
never the identity of the rider, so it must not be used to relax any auth guard.

**Not in scope:** NFC, merchant-side scanning, scanning on the public track
page, hardware scanners (see the table above), and any SMS. Signature capture
stays with R5.

Band **R4 Product** - spec first, then build. **Depends on R5.**

### R2 Merchant integration surface: API keys, webhooks, OpenAPI

No merchant-facing integration surface exists: `apiKey`, `api-key`,
`openapi` and `swagger` return **0** matches, and the only `webhook` hits are
the ops-only `ERROR_WEBHOOK_URL` sink (`src/lib/error-report.ts:16`,
`src/lib/env.ts:174` - POSTs unhandled 500s to an operator, nothing a merchant
can call). Merchants cannot push orders programmatically at all. This is the
single biggest barrier to onboarding anyone above small volume, and it is the
reason every merchant conversation ends in "can we integrate?".

**Ship:** `/api/v1/orders` behind API keys, signed webhooks on order state
changes (the state machine at `src/features/orders/transitions.ts` is the
event source), and a docs page generated from Zod schemas (already
centralised in `src/lib/validation.ts`).

Independent of R3. Webhooks and in-app notifications consume the same order
events, so emit each event once and fan out to both sinks rather than building
two emitters.

### R3 Notification system

No notification primitive exists: four hits for "notification" in the entire
codebase, all prose or comments (`src/app/manifest.ts:12`,
`src/app/manifest.spec.ts:13`, `src/app/apply/rider/page.tsx:279`, a seed
subject line). **Zero** SSE/WebSocket - `EventSource` and `new WebSocket`
return no matches.

Two things that landed since the last audit make the first tier *cheaper*:

- **The in-app sink already exists.** The TopNav announcement bell
  (`src/features/announcements/components/announcement-bell.tsx`) is exactly
  the surface an in-app notification stream needs - badge, link to a feed,
  mounted once per shell for every role. An in-app notification feed would
  grow *beside* announcements, not replace them: the bell currently ships no
  tray precisely so this slot stays free for R3's tray (the announcement
  link keeps its shape; the tray hosts notifications).
- **The per-user watermark pattern already exists.**
  `profile.announcementsSeenAt` (one nullable timestamp, stamped by
  `POST /api/announcements/seen`, advanced only via `GREATEST`) is the template
  for cheap per-user "what's new" state - and its *removal* of
  `announcement_read` is the other half of the lesson: per-item read receipts
  under a broadcast feature were rejected as notification machinery in
  advance. R3's `notification_read` will be the first legitimate user of
  that shape.

Email goes through a real outbox, so the transport for the first tier already
exists.

Independent of R2: webhooks and API keys are scoped there, not here. Both
consume the same order events (see R2).

**Ship in this order:**

1. In-app notifications driven by the email-outbox events (order created,
   dispatched, delivered, failed, cash submitted, payout approved) - the
   events are already emitted, only the sink is missing.
2. Per-event delivery preferences.
3. Customer-facing emails (out for delivery, delivered, delivery attempt
   failed, each with the tracking link), sent on the merchant's behalf and
   opt-in per merchant. The address it needs is already on the order
   (`recipientMail`), so nothing blocks this. Email only - SMS stays out of
   scope (see Decisions).

---

# P2 - Later product bets

Each is a standalone feature with no hard dependency on the work above; they
are last because none of them is blocking anything today.

### R4 Delivery windows and time slots

No `deliveryWindow` or `timeSlot` anywhere. For a Dhaka same-day market this
is table stakes for merchant-facing quoting.

### R6 Promotional and volume-based pricing

No `coupon`, `promo` or `subscription` logic. The pricing engine is already
sophisticated - multi-zone matrix (`delivery_zone` → `zone_pricing`),
packages with tiers, a calculator - so the commercial lever is the missing
piece, not the machinery.

### R7 Reporting exports

CSV is wired generically in the DataTable, but there is no curated report
(per-merchant performance, cash reconciliation, rider productivity) and no
scheduled email report. `delivery-performance`, `cod-settlement`, `finance`
and `earnings` dashboards all exist - they are not exportable.

---

# Guardrails - verified-clean areas (don't regress these)

**Testing & policy**

| Area | Status |
|---|---|
| **Auth on every API route** | enforced by `src/app/api/route-auth-guard.spec.ts` over all 129 route files, with a minimal allowlist it also asserts stays minimal (the spec pins a floor of 100, so this count is prose — recount when editing this row) |
| **E2E selector policy** | `data-testid` first, centralised in `e2e/selectors.ts` |
| **Docs drift** | `src/app/__tests__/docs-drift.spec.ts`, `ci-workflow.spec.ts`, `compose-cron.spec.ts` already exist - extend them rather than starting new ones |
| **E2E suite serials** | **scoped to the file**: `<fileNN><index>`, so `2901` is the first scenario in `29-sign-out.spec.ts`. File prefixes run `01`…`37` and are unique, so ids never collide, and deleting a scenario renumbers one file only — there are no retired gaps to preserve any more. `docs-drift.spec.ts` asserts uniqueness, that every serial matches its filename and runs `01…` in sequence, and the suite summary in **both** AGENTS.md (`78 scenarios across 37 files / 149 tests`) and ROADMAP.md (`149 tests / 37 files / 78 scenarios`), plus the coverage floors and ROADMAP's unit spec-file count |
| **Workflow shape** | `ci-workflow.spec.ts` and `deploy-workflow.spec.ts` (both `src/app/__tests__/`) read `ci.yml` / `deploy.yml` and pin job shape, step order and the required env union |
| **Source-level invariants** | `biome-config.spec.ts`, `p2-polish.spec.ts`, `dockerfile-stages.spec.ts`, `dependency-security.spec.ts` (all in `src/app/__tests__/`) read the source rather than rendering it - structural claims have no other way to fail |

**UI & accessibility**

| Area | Status |
|---|---|
| **App chrome has one home per concern** | one header per shell (`top-nav.tsx` replaced `mobile-header.tsx` - never stack two); sidebar = brand + nav only; identity/theme/sign-out live only in the avatar-opened RightNav panel (`right-nav.tsx`), the mobile drawer has no footer; pinned by e2e `2901`/`2902` (sign-out) and `3401` (TopNav) |
| **Nav placement is rendering-only** | `placement: "rightnav"` (Help, and Support for the self-service roles) moves *where a link renders*, never whether it exists: the item stays in `config.items`, which is what the merchant moderator grants, the shell route guard and the command palette read. `nav-config.spec.ts` pins the split, the no-loss invariant, that grantable hrefs are untouched, and that the announcements feed is never relegated to the RightNav (it is a destination, not a utility) |
| **Announcements render as markdown** | authored in Write/Preview tabs (`markdown-editor.tsx`), rendered by `src/components/markdown.tsx`, listed through `stripMarkdown()` (`src/lib/markdown.ts`) so raw syntax never reaches a one-line preview; detail lives at the shared, role-gated `/announcements/[id]` |
| **Skip link** | `src/components/skip-to-content.tsx`, rendered once at `src/app/layout.tsx:93`; `skip-link.spec.ts` asserts every `<main>` carries its `id="main-content"` target |
| **DataTable semantics** | real `<table>`/`<th>` with `scope="col"`, keyboard-focusable sort buttons, `aria-sort` on the active column |
| **Status is never colour-only** | `src/components/status-badge.tsx` always renders text; label/tone maps live in `src/lib/constants.ts` |
| **Error/loading boundaries** | `error.tsx` + `loading.tsx` + `not-found.tsx` for all four role segments plus the public routes; `DataErrorBanner` wired into all four shells |
| **Dialogs** | `FormDialog` always renders `DialogTitle` + optional `DialogDescription` - the R2 problem was call sites bypassing it, not the base component |
| **44px touch targets** | `hit-target-44` in `globals.css` + the `buttonVariants` base; `button.spec.tsx` scans for adjacent buttons whose targets would overlap |
| **Form error display** | two-layer: `FormErrors` summary as the focus target, plus the message under the control. Errors are frozen on submit, never derived per keystroke - see CONTRIBUTING "Form validation error display" |
| **In-card brand on auth screens** | `AuthCardBrand` as the first child of `CardHeader`; containment specs on every auth page |

**Data layer**

| Area | Status |
|---|---|
| **Announcement visibility + "new" state** | one predicate in `src/lib/announcements.ts` (live window + role targeting + `isNew` against the reader's watermark) feeding the active route, both feed pages and the detail page - never re-declare the live/targeting rules inline. State is one server-side column (`profile.announcementsSeenAt`, migration 0003, nullable); the badge counts rows published after it and the feed stamps it once per visit. Integration spec pins that the column stays nullable (Better Auth and signup don't know it - NOT NULL would break every signup). Never go back to per-item read rows or localStorage: `announcement_read` was built and removed (tombstone in `schema.postgres/platform.ts`) |
| **Money paths are transactional** | `db.transaction` + `SELECT ... FOR UPDATE` on every guard-then-write: `payouts/route.ts:236-242`, `payout-settlement.ts:49`, `balance/payment/route.ts:45`, `balance/payment/[txId]/confirm/route.ts:63` (read inside the tx, never before it) |
| **Trigram coverage** | 30 `gin_trgm_ops` indexes back every `ILIKE` column, including the NID search at `schema.postgres/merchants.ts:105` |
| **Pagination guards** | every table-backed list passes `defaultLimit`; `MAX_OFFSET = 100_000` (`pagination.ts:17`) and `MAX_LIMIT = 100` (`:4`) clamp hostile input |
| **Pagination totals stay exact** | `count(*)` results feeding a table's `initialTotal` are deliberately *not* cached - see `src/lib/cached-stats.ts` for the split between cached stat tiles and exact list totals |
| **Partial unique indexes as hard guarantees** | `finance.ts:98`, `packages.ts:122,166` |
| **Outbox concurrency** | `FOR UPDATE SKIP LOCKED` (`email-outbox.ts:82`) + 10-min stale-`SENDING` recovery (`STALE_SENDING_MS` at `:56`, applied at `:106`) |
| **Lock ordering** | orders → balance, documented and consistent |
| **Batching already done right in places** | `pickupLocationHubs` (`db/order-lookup.ts:71`), the bulk-endpoint pricing pre-fetch (`orders/bulk/route.ts:170-175`), `orders/counts` `FILTER` query (`:42-44`) - **these are the patterns to copy** |
| **Migration gate** | `depends_on: service_completed_successfully` on the migrate job (`docker/compose.monolith.yml:145`, `docker/compose.cluster.yml:128`) |
| **No raw SQL with user input** | the only `sql.raw` is `src/lib/db/time-sql.ts:15`, interpolating the constant `BUSINESS_TIMEZONE` |
| **One timeline definition** | `src/lib/order-timeline.ts` owns the steps, ranks and formatter; a source scan fails if the track page or the admin table declares its own copy again |

**Ops**

| Area | Status |
|---|---|
| **Docker hygiene** | non-root user, build-cache mounts, `HEALTHCHECK` on `/api/ready` (`docker/Dockerfile:71`) |
| **Cron auth** | timing-safe SHA-256 compare in `src/lib/cron-auth.ts:11-13` |
| **Read/write replica split** | `db` for writes (`db/index.ts:38`), `dbRead` for reads (`:54`) - session resolution, guards and `buildUpdate` all read through it |
| **Day-boundary rule** | `BUSINESS_TIMEZONE` + `businessToday()` (`src/lib/timezone.ts:16`) - correct wherever it is used (extend it, don't reinvent it) |
| **Static security headers** | `poweredByHeader: false` + HSTS in `next.config.mjs`, pinned by `security-headers.spec.ts`; the nonce'd CSP stays in `src/proxy.ts` |
