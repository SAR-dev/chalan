# TODO — Mobile responsiveness

> **Status: implemented.** All P0s and the rider P1s shipped. Three entries are
> deliberately not fully done, each marked inline:
>
> - **R7** — not done: contradicts the documented R9 two-step decision.
> - **R8** — addressed by the `TabsList` primitive fix rather than a per-page
>   restructure; the toolbar still wraps to two rows on a phone, which is
>   inherent and acceptable.
> - **General 6** — only the dropdown-item height changed. The checkboxes and
>   switches are native controls and were left alone.
> - **General 10** — deferred: every one is decorative, with no action behind it.
>
> The list is kept as the record of what was found, so the `file:line`
> citations are the audit's, not current line numbers.

Findings from an audit of the four role shells (dashboard, warehouse, rider,
merchant) plus the public pages. Every entry cites a `file:line` that was
verified by hand — re-check before acting, and update the citation if the line
has moved.

**The rider surface is the priority.** Riders are the only role that is
phone-first: they work one-handed, outdoors, sometimes in gloves. Everything in
the **Rider pages** section below outranks the general findings — a cramped
merchant table is an annoyance, a cramped delivery action is a failed delivery.

**How to verify a change:** `pnpm dev`, then Chrome DevTools at **375×812**
(iPhone) and **320×568** (small phone). The smallest supported width is 320px —
that is the floor `e2e/specs/28-toast-responsive.spec.ts` already guards.

**Severity key**

| Tag | Meaning |
|---|---|
| **P0** | Content overflows, is cut off, or is unusable on a phone |
| **P1** | Usable but cramped — inputs too small to type in, targets too small to hit |
| **P2** | Hardening, consistency, and regression guards |

---

## What is already right — do not "fix" these

These were checked and are correct. Changing them risks regressing real work.

- **Viewport meta** — Next.js emits `width=device-width, initial-scale=1`
  (verified in the built HTML). The `viewport` export at `src/app/layout.tsx:66`
  does not need to restate it.
- **Sidebar → drawer below `md`** — `src/components/navigation/role-sidebar.tsx:39`
  is `hidden … md:flex`, and `src/components/navigation/top-nav.tsx:82-157`
  supplies the `Sheet side="left"` drawer. That is the right pattern.
- **Dialog width** — `src/components/ui/dialog.tsx:55` is
  `w-full max-w-[calc(100%-2rem)] … sm:max-w-sm`, so a dialog is ≤328px on a
  360px phone and only widens from 640px up. `SIZE_CLASS` in
  `src/components/form-dialog.tsx:20-25` is `sm:`-prefixed for the same reason.
- **Dialog footer** — `src/components/ui/dialog.tsx:106` is
  `flex-col-reverse … sm:flex-row`, so buttons stack full-width on a phone.
- **DataTable horizontal scroll** — `src/components/data-table/index.tsx:674-676`
  wraps in `overflow-x-auto`, and pinned columns use real CSS
  `position: sticky` (`:211-300`), which works on touch. The strategy is
  scroll, not reflow — that is a deliberate choice, not a bug.
- **Pagination** — `src/components/data-table/pagination.tsx:58` stacks
  (`flex-col … sm:flex-row`) and the `gap-3` spacing is deliberately
  hit-area-aware (see the comment at `:72-77`).
- **`hit-target-44`** — applied to every `<Button>` (`src/components/ui/button.tsx:11`)
  and enforced by `src/components/ui/button.spec.tsx`, including a static
  analysis that no two adjacent square buttons' 44px targets overlap.
- **Truncated cells** — `src/components/data-table/cells.tsx:20,43,47` use
  `truncate` plus a native `title=`, which works on focus as well as hover.
- **Public form grids collapse** — `src/app/apply/rider/page.tsx:419,557`,
  `src/app/register/page.tsx:313`, `src/app/track/page.tsx:135`.
- **Charts** — `src/components/charts/*` use `ResponsiveContainer width="100%"`
  with no fixed widths.
- **Rider shell** — `src/app/rider/rider-shell.tsx:56-62` hides the sidebar
  below `md` and gives the content column its own `overflow-y-auto`.
- **Rider tables keep actions reachable** — `src/app/rider/pickup/page.tsx:196`
  and `src/app/rider/delivery/page.tsx` mark the actions column `sticky: true`,
  so the primary action never scrolls out of reach.
- **Scan flow is defensive** — `src/lib/scan.ts` dynamic-imports, never throws,
  and returns `{ kind: "no-code" }`; `scan-gate.tsx:147-156` uses a hidden
  `capture="environment"` input, and manual entry is always offered.
- **Upload affordances on touch** — `src/components/image-upload.tsx:96-121`
  uses `pointer-coarse:opacity-100` so the replace/remove buttons are visible
  without hover.

---

## Rider pages (phone-first — do these first)

### R1 [P0] — the queue action cluster overflows a 320px screen

`src/app/rider/page.tsx:260` — `<div className="flex items-center gap-1 shrink-0">`
(pickup rows `:260-299`, delivery rows `:350-382`).

Each row packs **up to four controls** into that cluster: a map-pin `Button`
(`:262`), the primary action (`:273`/`:285`), and `OrderLabelButton`, which
renders **two** `size="icon"` buttons of its own
(`src/features/orders/components/order-label-button.tsx:123-151`). That is
roughly 32 + 80 + 32 + 32 ≈ **176px** of fixed-width controls before gaps, so on
a 320px screen the `min-w-0` info column is squeezed to ~140px and the primary
action label truncates.

**Fix:** stack on mobile — `flex-col gap-2 sm:flex-row sm:items-center` on the
row, with the primary action full-width. Drop the **download** icon from the
rider queue (print is enough) and move the map pin beside the address rather
than into the action cluster.

### R2 [P1] — the primary action is 28px tall

`src/app/rider/page.tsx:262,273,285,355,365,371` — all `size="sm"`, which is
`h-7` (28px) per `src/components/ui/button.tsx:30`.

`hit-target-44` widens the *hit* area, but the painted button is 28px with
12.8px text — hard to read in sunlight and easy to miss. This is the single most
important tap on the page ("Picked up", "Start", "Record").

**Fix:** `size="default"` (32px) or a dedicated taller mobile size, with
`text-sm` labels.

### R3 [P1] — critical text is 12px

| File:line | Content |
|---|---|
| `src/app/rider/page.tsx:237,324` | order id, `font-mono text-xs` |
| `src/app/rider/page.tsx:245` | phone + address row, `text-xs` |
| `src/app/rider/delivery/page.tsx:35` | `PhoneLink`, `text-xs` |
| `src/app/rider/delivery/page.tsx:140` | destination address, `text-xs` |
| `src/features/riders/components/run-sheet-card.tsx:27,55,59` | destination, order id, zone |
| `src/features/orders/components/scan-gate.tsx:178` | the manual-code `Label` |

Riders read these aloud to merchants and recipients, and tap the phone number to
call. 12px is below the readable minimum outdoors.

**Fix:** `text-sm` (14px) for order id, phone, destination and the manual-code
label. Also give the address `min-w-0 truncate`/`break-words` — `:245` and
`delivery/page.tsx:140` have no overflow guard.

### R4 [P1] — the pickup and delivery tables hide their own data

`src/app/rider/pickup/page.tsx:104-199` (7 columns) and
`src/app/rider/delivery/page.tsx` (9 columns). Only `order` is pinned
(`pickup/page.tsx:261`) and `actions` is sticky.

On a 320px screen the rider must scroll horizontally to read the merchant,
address and COD — the information they need *before* deciding to tap the
primary action.

**Fix:** hide low-priority columns below `sm` with `headClassName`/`cellClassName`
`"hidden sm:table-cell"` (the pattern already exists at
`src/features/riders/components/rider-table-columns.tsx:48`), keeping order,
destination and action. Or collapse to a card list on mobile.

### R5 [P1] — account tabs overflow

`src/features/account/components/account-settings.tsx:398` — a `<TabsList>` with
five triggers (Profile, Preferences, Security, Two-factor, Sessions) and no
scroll or wrap handling. At 320px they clip.

**Fix:** `overflow-x-auto` + `flex-nowrap` on the `TabsList`, or a `<Select>`
below `sm`.

### R6 [P1] — the scan button is 28px

`src/features/orders/components/scan-gate.tsx:133` — `size="sm"` on the button
that opens the camera. It sits in a `flex items-center justify-between` header
row competing with the "Scan the parcel label" heading.

This is the rider's critical path. **Fix:** `size="default"`, or full-width
below the heading on mobile.

### R7 [P1] — NOT DONE: the scan gate hides all order context until verified

**Deliberately left as-is.** This contradicts the R9 two-step decision, which is
documented in the code at `out-for-delivery-dialog.tsx:76-77`: *"while a scan is
required the body is just the gate — the parcel details wait for the label to be
verified"*, and in the R9 spec as *"the validation, not a wall, comes first"*.
Reversing it is a product decision, not a layout fix. The order id is already
visible in the dialog title, so a rider is not fully blind. Revisit only with an
explicit decision.

`src/features/orders/dialogs/out-for-delivery-dialog.tsx:69-98` — when
`warehouseScanRequired` is on, the body renders *only* the `ScanGate`. The
recipient, phone and destination are withheld until the scan matches.

A rider whose camera fails, or whose label is damaged, sees no order context at
all while deciding whether to use manual entry — and manual entry is exactly the
moment they need to confirm they have the right parcel.

**Fix:** show read-only order context above the gate; keep the confirm step
withheld until a match (the two-step contract stays), but the *identification*
should be visible.

### R8 [P1] — ADDRESSED IN THE PRIMITIVE: support toolbar crowds the top

`src/features/support/components/support-page-client.tsx:274-281` — four status tabs plus the search
input plus the filter button. The toolbar is `flex flex-wrap`
(`src/components/data-table/toolbar.tsx:46`) so it wraps, but at 320px it
consumes 2–3 rows and pushes the table off-screen.

**Fix:** done in the primitive instead — `TabsList` now carries
`max-w-full overflow-x-auto` (`src/components/ui/tabs.tsx`), so the tabs scroll
rather than clip. The toolbar still wraps to two rows on a 320px screen; that is
inherent to four tabs plus a search plus a filter and is acceptable.

### R9 [P2] — label actions double up in the queue

`src/features/orders/components/order-label-button.tsx:123-151` renders print
**and** download as two `size="icon"` buttons. In the rider queue both appear
per row, contributing to R1.

**Fix:** print-only on rider pages; download stays on the order detail page.

### R10 [P2] — `gap-1` makes 44px hit areas overlap

`src/app/rider/page.tsx:260` — the action cluster uses `gap-1` (4px). Two
adjacent 28px buttons 4px apart have 44px-tall hit areas that overlap by 4px, so
a tap near the edge of one can land on the other. `pagination.tsx:72-77`
documents this exact hazard and uses `gap-3`.

**Fix:** `gap-3` in the rider action clusters.

### R11 [P2] — `min-h-screen` on the rider shell

`src/app/rider/rider-shell.tsx:56` (and `:47`) — `min-h-screen` is `100vh`,
which on mobile browsers includes the address-bar area, so the footer sits
behind the URL bar and the page double-scrolls.

**Fix:** `min-h-dvh`.

### R12 [P2] — raw `<button>`s miss `hit-target-44`

The utility is baked into the `Button` cva, so these are under 44px:

| File:line | Element |
|---|---|
| `src/app/rider/page.tsx:237,324` | order-id button |
| `src/app/rider/pickup/page.tsx:108-117`, `delivery/page.tsx:103-112` | order-id button in the table |
| `src/features/riders/components/run-sheet-card.tsx:84-90` | "Try again" |
| `src/components/data-table/index.tsx:752-774` | sort header |
| `src/features/orders/dialogs/delivery-attempt-dialog.tsx:148-173` | Delivered/Failed toggles |

**Fix:** convert to `<Button>`, or add `hit-target-44` plus padding.

### R13 [P2] — small-input and small-text leftovers

- `src/features/orders/dialogs/pickup-confirm-dialog.tsx:148-155` — the weight
  `<Input type="number">` has no `inputMode="decimal"`, so a rider gets the full
  keyboard instead of the numeric pad.
- `src/features/orders/components/scan-gate.tsx:160,169` — mismatch and
  unreadable messages at `text-xs`.
- `src/app/rider/cash/page.tsx:128,148,168` — stat-card hints at `text-xs`.
- `src/features/orders/components/order-details-content.tsx:65` — section label at
  `text-[11px]`.
- `src/features/riders/components/run-sheet-card.tsx:49` — `w-5` sequence column
  is tight past 9 stops.

### R14 [P2] — no rider test runs at a mobile viewport

`src/app/rider/rider.spec.tsx` renders at the jsdom default, and
`playwright.config.ts:38-43` defines a single desktop `chromium` project. The
rider specs (`30-rider-vehicle`, `32-rider-cash`, `36-rider-pickup-flow`) never
set a viewport — so the highest-stakes mobile surface in the app has **zero**
mobile coverage, and R1–R6 could regress unnoticed.

**Fix:** add a `"mobile"` Playwright project (`devices["Pixel 5"]` or a 320px
viewport with `hasTouch: true`) and run the rider specs on it.

---

## General — P0 (breaks on a phone)

### 1. `/rates` forces a 720px-wide matrix

`src/app/rates/page.tsx:115` — `className="w-full min-w-[720px] border-collapse text-sm"`

The rate card is a zone × zone matrix with a `sticky left-0` first column
(`:121,144`). On a 320–375px phone the user has to scroll a 720px table
horizontally while the sticky column eats another ~100px, so only ~200px of the
matrix is ever visible at once. This is a **public** page a merchant may open on
a phone.

**Fix:** below `sm`, render the matrix as a stacked list (one block per origin
zone, its destinations listed beneath) instead of a table. Failing that, drop
`min-w-[720px]` to something the columns can actually fit and let the zone names
wrap.

### 2. Multi-column grids inside phone dialogs

| File:line | Code |
|---|---|
| `src/features/orders/dialogs/delivery-attempt-dialog.tsx:148` | `grid grid-cols-2 gap-3` |
| `src/features/orders/dialogs/failed-delivery-dialog.tsx:139` | `grid grid-cols-2 gap-3` |
| `src/features/platform-config/dialogs/create-mail-config-dialog.tsx:84` | `grid grid-cols-3 gap-4` |
| `src/features/platform-config/dialogs/create-mail-config-dialog.tsx:113` | `grid grid-cols-2 gap-4` |
| `src/features/platform-config/dialogs/create-mail-config-dialog.tsx:137` | `grid grid-cols-2 gap-4` |

These sit inside `FormDialog` / `DialogContent`, which is capped at ~328px on a
phone. `grid-cols-2` leaves each column ~150px and `grid-cols-3` leaves ~100px —
narrower than the inputs inside them, so text is clipped as you type.

**Fix:** collapse below `sm` — `grid-cols-1 sm:grid-cols-2` and
`grid-cols-1 sm:grid-cols-3`.

### 3. `whitespace-nowrap` on every table header and cell

`src/components/ui/table.tsx:78` (`TableHead`) and `:91` (`TableCell`) both
hardcode `whitespace-nowrap`.

Any long value — an email, an order id, a long city name — cannot wrap, so it
sets the column's width and forces the whole table to scroll further. Every
table inherits this; a single wide cell makes every row wide.

**Fix:** keep `nowrap` as the default for short, scannable columns but give
callers a way out. Either accept `cellClassName`/`headClassName` overrides that
win (they already exist in `DataTableColumn`), or stop hardcoding it and set it
per column. Whichever way, long-text columns should get `max-w-[200px] truncate`
or `break-words`.

---

## General — P1 (cramped but usable)

### 4. Landing page has no nav below `sm`

`src/app/landing/page.tsx:255` —
`className="hidden items-center gap-1 sm:flex sm:gap-3"`

Help, Pricing, Sign in and Create account are all hidden below 640px, leaving
only the theme toggle in the header (`:245`). The hero carries its own CTAs
(`:337-367`), so nothing is unreachable — but a phone user who scrolls past the
hero has no header route to sign in or register.

**Fix:** keep at least a compact **Sign in** + **Create account** visible below
`sm`, or add a hamburger that opens the same links.

### 5. Sort button is a small touch target

`src/components/data-table/index.tsx:753-774` — the sort control is a bare
`<button>`, not the `<Button>` primitive, so it never receives `hit-target-44`.
On a phone the column-header sort target is the width of the label text.

**Fix:** wrap it in `<Button variant="ghost" size="sm">` (which brings the 44px
hit area and the collision guard with it), or apply `hit-target-44` directly.

### 6. Other controls below the 44px target — PARTIALLY DONE

| File:line | Element | Size |
|---|---|---|
| `src/components/data-table/bulk-actions.tsx:29,71` | select-all / row checkbox | `w-10` column, `size-4` box |
| `src/components/ui/switch.tsx:19` | switch, `size="sm"` | 24px |
| `src/components/ui/dropdown-menu.tsx:93` | `DropdownMenuItem` | ~28px (`py-1`) |
| `src/app/apply/rider/page.tsx:651-656` | terms checkbox | native |

None are `<Button>`, so `hit-target-44` does not apply. Checkboxes and switches
are hard to enlarge without a wrapper, but the **dropdown item** height is a
one-line change and matters most — action menus are where a mis-tap is costly.

**Fix:** the `DropdownMenuItem` height is done (`min-h-9`, 36px + padding).
The checkboxes and the `Switch` were **not** changed — they are native controls
that need a labelled wrapper to own a larger hit area, and none of them is on a
rider's critical path.

### 7. Long values can overflow the tracking detail rows

`src/app/track/[id]/components/order-detail.tsx:94-101` — the `<dd>` in
`DetailRow` is `text-right text-xs` with no `min-w-0` / `break-all`. A long
tracking id or address in the right-hand cell of
`flex items-start justify-between gap-4` (`:88`) has nothing to stop it
overflowing the card.

**Fix:** add `min-w-0 break-all` to the `<dd>`.

### 8. Pie chart legend can overflow its fixed height

`src/components/charts/pie-chart.tsx:41,45` — `height = 200` with
`outerRadius = 80` and a legend (`showLegend = true` default). In a ~300px card
the legend wraps to several lines and Recharts' `Legend` does not shrink to fit
the 200px box.

**Fix:** reduce `outerRadius` below `sm`, or set `showLegend={false}` on narrow
viewports and rely on the adjacent stat list.

### 9. Date-range filter wraps to two rows

`src/components/date-range-picker.tsx:97,108,119` — two `w-36` (144px) date
inputs plus a `min-w-[130px]` select and a Clear button total ~498px, so on a
phone the control wraps. The wrapper is `flex flex-wrap` (`:87`), so it degrades
rather than breaks.

**Fix:** `w-full sm:w-36` on the inputs so each takes a full row on a phone.

---

## General — P2 (hardening and regression guards)

### 10. Hover-only affordances have no touch equivalent — DEFERRED

| File:line | Pattern |
|---|---|
| `src/components/ui/table.tsx:60` | `hover:bg-muted/50` row shading |
| `src/components/data-table/classes.ts:21` | `group-hover/row:bg-muted/50` on sticky cells |
| `src/app/landing/page.tsx:563,567,570` | `group-hover:opacity-100`, `group-hover:scale-110` |
| `src/app/help/page.tsx:55,61,63` | `group-hover:border-primary/40`, `group-hover:text-primary` |
| `src/app/track/[id]/components/timeline.tsx:201` | `hover:scale-105` |

All decorative — none is the sole affordance for an action, so none blocks a
task, and this was deliberately left alone rather than churned. If it is picked
up, the sticky-cell row shading is the only one that carries meaning.

### 11. No mobile viewport in the Playwright project

`playwright.config.ts:38-43` defines a single `chromium` project
(`Desktop Chrome`). Mobile is only covered by per-test `test.use()`:

- `e2e/specs/28-toast-responsive.spec.ts:18,20` — 375×812 and 320×568
- `e2e/specs/29-sign-out.spec.ts:92-111` — 375×812
- `e2e/specs/02-business-flows.spec.ts:440-455` — 375×812

**Fix:** add a second project using `devices["iPhone 13"]` (or a 320px viewport
with `hasTouch: true`), so a regression in the shell or a dialog fails without
someone remembering to set a viewport.

### 12. No test asserts the P0 fixes stay fixed

Nothing currently fails if a `grid-cols-2` is added back to a dialog, or if the
rates matrix regains a fixed min-width. The existing `button.spec.tsx` collision
scan (`:318-324`) is the model to copy: a source-level scan for
`grid-cols-[2-9]` inside a dialog file, and for `min-w-[` above ~400px.

### 13. Public header gutters

`src/components/public-header.tsx:9` — `px-6 py-3.5` uses 24px each side at all
widths. `px-4 sm:px-6` reclaims 16px on a phone for free.

---

## Suggested order

1. **R1** — the rider queue action cluster. It is the only finding that makes a
   core action unusable on a common phone width, and it is on the one surface
   used outdoors, one-handed.
2. **R2–R7** — the rest of the rider P1s: action size, 12px critical text, the
   table columns, the account tabs, the scan button, and the scan gate's missing
   context. All of these are on the critical path for a delivery.
3. **General P0** — the rates matrix, the dialog grids, the table `nowrap`.
4. **R8–R14 and general P1/P2** — tidy-up.
5. **R14 + general #11** — add the mobile Playwright project early, so the rider
   fixes get a regression guard while the context is fresh. This one is worth
   pulling forward: the rider surface currently has no mobile coverage at all.

Everything in this file was verified against the tree at the commit it was
written from. Re-verify the `file:line` before acting.
