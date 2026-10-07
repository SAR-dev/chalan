# ROADMAP

> Forward-looking only - shipped work lives in git history.
>
> **Open work:** R4 Product only. R0-R3 closed earlier, and R5 Polish is
> closed - see the ledger in git history and the decisions below. Within that
> band, **R5 (parcel labels) has shipped** and **R9 (QR scanning)** leads next.
> **SMS has been withdrawn from planning** - see Decisions.
>
> **Health:** `pnpm ci:check` green (931 files) · Unit **2455 pass** (2498
> total, 232 spec files) · coverage **55.4 / 49.69 / 44.02 / 56.29** against
> floors **50 / 45 / 40 / 52** · real-DB integration **43/43** · E2E **152
> tests / 39 files / 80 scenarios**, run locally only
> (`pnpm test:e2e`, ~8 min) by decision - CI runs quality · build · security ·
> coverage · integration jobs and nothing else · `route-auth-guard.spec.ts`
> enforces server-side auth on all 133 API route files · `pnpm build` green.
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
| **P1 - High-leverage product work** | R9 · R2 · R3 | open (R5 shipped · R1 decided · R8 shipped) |
| **P2 - Later product bets** | R4 · R6 · R7 | open |

### Dependencies

| Item | Hard dependency | Soft constraint |
|---|---|---|
| **R1** i18n decision | none | **Decided - deferred** (see Decisions). New user-facing copy in R2 / R3 / R5 / R9 / P2 goes in `src/config/content.ts`, not new inline literals |
| **R5** Printable parcel labels + QR code, admin label designer | none | **shipped** - see git history. Was the blocker for R9; its QR encodes `order.id`, and print is browser `window.print()` only (no PDF) |
| **R9** Parcel QR-code scanning at pickup + delivery | **R5** | a scan proves possession of the parcel, never rider identity - it must not weaken the auth guard. Scanning and manual code entry are two routes to the same action, so a dead camera never blocks a delivery |
| **R2** API keys, webhooks, OpenAPI | none | docs page and error copy follow R1's writing rule. `/api/v1/orders` should accept the order's `recipientMail` |
| **R3** Notifications (in-app, preferences) | none — its R8 prerequisite is **shipped**: `recipientMail` is on the order | copy follows R1's writing rule. Shares R2's event source (`src/features/orders/transitions.ts`) - emit once, fan out to both sinks. Toast sounds use howler.js (see Decisions) |
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
| R5 | Printable parcel labels and the label designer | R4.7 |
| R6 | Promotional and volume-based pricing | R4.8 |
| R7 | Reporting exports | R4.9 |

Priority groups: P1 (was P3) and P2 (was P4). The old P1 and P2 were closed
R5 polish work and have no entry, so an old reference to either means that.

R9 is new and has no earlier id: parcel QR-code scanning (there was no earlier
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

**Order:** **R5 has shipped**, so **R9** - parcel QR-code scanning at pickup and
delivery - leads now; it was blocked on R5 only for something scannable to
exist. Then R2 and R3, which are independent of each other and can be reordered
or run in parallel. R1 is already decided (deferred i18n) and needs no turn in
the order - it only shapes the copy in what follows. R8 and R5 have shipped and
left the plan.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **SMS is out of scope** | Withdrawn from this roadmap (it was R4.4 in the earlier numbering). The platform sends no SMS and none is planned. The two `SMS` strings at `src/app/track/page.tsx:49` and `:205` are deliberately untouched — line 205 attributes the message to *the merchant* ("the SMS or email your merchant sent"), who may text their own customer outside the platform. Do not "fix" this copy by wiring an SMS provider; that needs a new roadmap item. |
| **R1 i18n — Bangla ships in a later phase** | Decided, so R1 is no longer open. This is *not* an English-only lock-in: the framework is simply deferred. Until that phase, all new user-facing copy goes through `src/config/content.ts` (page copy) and `src/config/table-column-labels.ts` (table headers) instead of new inline literals — that is where a future `messages/*` catalog starts, and it is the only part of this decision that constrains R2/R3/R5/P2. `lang="en"` at `src/app/layout.tsx:87`, `src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:86` stays as-is; no `next-intl`/`i18next` dependency is added now. |
| **The label template is platform-wide and singular** | One `label_template` row, platform-wide — never per-merchant, and never one row per paper size. The per-merchant migration stays additive if it is ever needed: a nullable `merchantId` plus a lookup that falls back to the default. Printing on non-thermal paper is a **scale** change on the same template, not a second layout (see next row). |
| **One label template, scaled to the paper** | The parcel label is a **single** platform-wide template, authored once at the 100×150mm thermal default. Printing on different paper is a **scale** change on that same template (`widthMm`/`heightMm`), not a second layout — the block stack reflows inside whatever size is set. This supersedes the earlier *A4 label sheet (8-up)* decision: the sheet preset, the multi-up "select N orders → render a sheet" flow and the fixed packing slip / invoice are all **withdrawn**, on the owner's call that one template plus a scale knob is enough. The renderer still enforces the **QR code's minimum size and quiet zone** at any scale, so shrinking the label cannot produce an unscannable code; width/height stay clamped 20–400mm. Record **dimensions, never an Avery part number** — L7160/L7163/L7165 disagree across suppliers, so a part code in the schema would be a latent bug. |
| **No PDF generation path** | The label prints with the browser's `window.print()` only. A PDF generator was considered and dropped: rasterizing (`html2canvas` + `jsPDF`) blurs the QR and breaks R9, so a PDF would need its own vector-emitting renderer to be worth doing - more surface than the need justifies. Quick-print plus reprint from the order detail page cover the "print it again" case without a stored artifact; the block array stays the contract if a PDF path is ever revisited. |
| **The COD amount prints as small type at the label's foot** | The label is on the *outside* of the box, so a prominent COD figure advertises cash inside and is a theft risk on a doorstep. It renders as an `xs`-scale, toggleable block at the foot — legible to the rider and the recipient for reconciliation, not from arm's length by a bystander. The amount stays authoritative in the app. |
| **E2E runs locally, not in CI** | `pnpm test:e2e` (152 tests, ~8 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost - do not "helpfully" re-add an `e2e` job. The commented block in `ci.yml:170-217` stays commented; `ci-workflow.spec.ts` still validates its step ordering by stripping comment markers, so re-enabling must keep that order. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. Current measurement sits ~5-6 points above the floors; a drop toward them is a signal, not headroom. |
| **CI is quality, build, security, coverage and integration** | `.github/workflows/` holds `ci.yml` and `deploy.yml` only. Code scanning is not part of the gate - `ci.yml`'s `security` job covers `pnpm audit` plus the advisory dependency review, and nothing more. |
| **Rows per page is one persisted preference, not a per-table control** | It lives on the user row (capped by `MAX_TABLE_ROWS_PER_PAGE`), is edited in Account Settings, and `DataTable` applies it as every table's default size. A second, unpersisted control in the footer would only have disagreed with the first. Do not add a rows-per-page `<select>` back to `TableFooter`. |
| **`style-src` keeps `'unsafe-inline'`** | Investigated and rejected. ~50 React `style={{...}}` bindings need `style-src-attr 'unsafe-inline'`, and `nextjs-toploader`'s `<style>` cannot be nonced: it renders the nonce without `suppressHydrationWarning`, so server value and client render disagree and hydration breaks. The reasoning is at `src/app/layout.tsx:94-97`. The only real hardening left is splitting `style-src-elem` (nonce) from `style-src-attr`; do not "simplify" the directive away. |
| **The Docker runner keeps the full dependency tree** | Investigated and rejected. The monolith's `migrate` service runs `node_modules/.bin/tsx` out of this same image, so a `--prod` install would break migrations. A `deps-prod` stage already existed and was removed as dead work, and `dockerfile-stages.spec.ts` asserts `COPY --from=deps ...node_modules` and forbids `pnpm install --prod`. Reducing image weight means moving `tsx` into `dependencies` first, not adding a stage. |
| **`biome.json` must stay strict JSON** | Biome rejects comments in it. JSONC goes in `biome.jsonc`. Its `files.includes` scopes it to `src/`, `e2e/`, `env/`, `scripts/` and root files (`.next/**` is excluded by omission). Pinned by `biome-config.spec.ts`. |
| **Notification sounds use howler.js directly** | Toast/notification sounds use `howler` (~10KB gzipped) with a thin `useHowl()` hook in `src/lib/hooks/`, not a React wrapper library. Sound assets live in `public/sounds/` as mp3 + ogg for cross-browser coverage (especially mobile Safari). The hook auto-unloads on unmount. Sound is opt-in per toast type (success/error/info) and respects the OS-level silent/mute preference where detectable. |
| **QR scanning is superadmin-configurable per scan point** | Two independent toggles — one for pickup (`picked-up`), one for delivery (`delivered`) — stored in platform config. When a toggle is off, the rider skips the scan and proceeds directly with the existing transition. Default is **on** for both. This lets the platform owner roll out scanning incrementally (e.g. enable delivery first, pickup later) or disable it for a subset of riders during a pilot without a code change. |

---

# P1 - High-leverage product work

R5 - the label work - has shipped and left this group, unblocking R9. R1 was an
item in this group and is now decided (deferred i18n - see Decisions), so what
survives of it is a writing rule rather than a build: copy in R2 / R3 / R9 / P2
goes through `config/content.ts`. R8 - recipient email - has shipped too.

The one dependency that shaped this order is now satisfied: R9 (QR-code
scanning) can start because R5 prints a scannable label. R3's prerequisite - the
recipient's address, which its customer emails need - shipped with R8, so
nothing waits on it any more.

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

### R5 Printable parcel labels and the label designer — **shipped**

Delivered (source in git history): the `label_template` table and block-array
model, the shared `<LabelRenderer>` (screen + `@media print`, QR min-size and
quiet-zone enforced), quick-print from the warehouse/superadmin tables and the
rider queues, single-label **print + reprint on the order detail page**, and the
Super-Admin Design / Preview / Publish designer. A built-in default template
means printing works before an admin publishes anything. The QR encodes
`order.id`, and print is browser `window.print()` only - no PDF.

The detail below is kept as the shipped record because R9's contract builds on
it; what was planned is now implemented.

**Shipped:**

- **Label generation** - a per-order label carrying order reference, merchant,
  destination, recipient name, **recipient phone**, weight, COD amount and a
  **QR code**. The phone is not decoration: on a COD doorstep the rider calls
  ahead, and an address alone is often not enough to find the recipient.
- **One durable code per order**, stored on the order row rather than derived at
  print time, so a reprint is still the same parcel (and a code never silently
  changes under a label that is already stuck to a box). R9 defines what it
  encodes and what it must never contain.
- **One label template, scaled to the paper.** A single thermal layout at
  100×150mm by default; printing on a different paper is a **scale** change on
  that same template (its `widthMm`/`heightMm`), not a second layout. See *One
  template, scaled to the paper* below. Reprint lives on the order detail page
  for merchant and warehouse, alongside the existing history view.
- **How it prints - the browser print API, and no PDF.** Two things to get
  right early, because retrofitting them later means reprinting every parcel:
  1. **Set the physical page size with CSS `@page`** to the template's
     configured dimensions (`size: 100mm 150mm` for the default, or the browser
     quietly rescales to A4). A scaled QR is a blurry QR, and a QR the camera
     cannot read is precisely the failure R9 is built to avoid - the print step
     is where the scan is won or lost.
  2. **`window.print()` is the shipping path; a PDF generator is not planned.**
     A PDF would need a second, vector-emitting renderer to keep the QR crisp
     (see *Never rasterize a label*), and quick-print plus reprint from the
     order detail page already covers the merchant's "print it again" need
     without an extra artifact to store and secure.
- **Admin label designer.** Decisions closed: **platform-wide only** (no
  per-merchant templates and no fallback chain until a merchant actually asks —
  matching how the rest of `platform-config` works), **one template, scaled to
  the paper rather than duplicated per stock**, and **the COD amount prints as
  small type at the foot of the label**, as a toggleable block, never in the
  main body.

  *One row, not one per size.* `label_template` holds exactly one platform-wide
  row (draft and published versions aside); `isDefault` marks the one the plain
  *Print* action reaches for.

#### One template, scaled to the paper

| Template | Physical size | Contents | Admin-designed? |
|---|---|---|---|
| **Parcel label** | 100×150mm (default) | QR + order id + recipient name + recipient phone + merchant + weight + COD at the foot | **yes** |

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
produce an unscannable code. Width/height stay clamped (20–400mm), and
dimensions — never an Avery part number, which maps to different dimensions per
supplier — remain the source of truth.

#### How the designer works

**The template is a JSON array of typed blocks — that array is the source of
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
  blurs the QR code and breaks R9 outright. The label prints from the live block
  array (HTML/CSS), so the QR stays vector-crisp; any future PDF work must
  consume the *block array* and emit vector text — the model is the contract,
  the renderer is swappable.
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
already use; `LabelBlock` gets a Zod schema in `src/lib/validation.ts` like
every other payload. Revisions are **append a row per publish**, not an
overwrite — one insert, and the history survives.

**Stored config, not code — the rules that make that true:**

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

Band **R4 Product** — shipped; unblocks R9.

### R9 Parcel QR-code scanning at pickup and delivery

Riders identify parcels by eye or by typing an order reference. At the two
points where taking the wrong parcel is expensive - *starting a pickup* and
*handing one over as delivered* - the rider should scan the label and have the
app confirm it is the parcel on screen.

**Dependency: R5 - now satisfied.** A labelled QR code prints, so this can
start.

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
  a QR read. **Settle this in the spec before building.**
  On a match the existing transition proceeds unchanged; on a mismatch it
  refuses and names the parcel that was actually read.
  **Each scan point is independently toggled by the superadmin** (see
  Decisions). When a toggle is off, the rider skips the scan and the
  transition proceeds without verification — the scan is an accelerator,
  not a gate.
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
| `qr-scanner` (nimiq) | same native-first shape, but its fallback decoder is `jsqr-es6` (a JS port of ZXing) — weaker than `zxing-wasm` on glare, blur and creases, which *is* the parcel condition; also ships its own `<video>` / overlay UI, and its npm release is old. Its one edge — no `'wasm-unsafe-eval'` change — is convenience, not capability. Kept `zxing-wasm`; revisit only if relaxing CSP becomes unacceptable |
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
| **E2E suite serials** | **scoped to the file**: `<fileNN><index>`, so `2901` is the first scenario in `29-sign-out.spec.ts`. File prefixes run `01`…`39` and are unique, so ids never collide, and deleting a scenario renumbers one file only — there are no retired gaps to preserve any more. `docs-drift.spec.ts` asserts uniqueness, that every serial matches its filename and runs `01…` in sequence, and the suite summary in **both** AGENTS.md (`80 scenarios across 39 files / 152 tests`) and ROADMAP.md (`152 tests / 39 files / 80 scenarios`), plus the coverage floors and ROADMAP's unit spec-file count |
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
