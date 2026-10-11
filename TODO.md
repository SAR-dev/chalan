# TODO — Mobile responsiveness

Findings from an audit of the four role shells (dashboard, warehouse, rider,
merchant) plus the public pages. Every entry cites a `file:line` that was
verified by hand — re-check before acting, and update the citation if the line
has moved.

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

---

## P0 — breaks on a phone

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

## P1 — cramped but usable

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

### 6. Other controls below the 44px target

| File:line | Element | Size |
|---|---|---|
| `src/components/data-table/bulk-actions.tsx:29,71` | select-all / row checkbox | `w-10` column, `size-4` box |
| `src/components/ui/switch.tsx:19` | switch, `size="sm"` | 24px |
| `src/components/ui/dropdown-menu.tsx:93` | `DropdownMenuItem` | ~28px (`py-1`) |
| `src/app/apply/rider/page.tsx:651-656` | terms checkbox | native |

None are `<Button>`, so `hit-target-44` does not apply. Checkboxes and switches
are hard to enlarge without a wrapper, but the **dropdown item** height is a
one-line change and matters most — action menus are where a mis-tap is costly.

**Fix:** raise `DropdownMenuItem` padding to a ≥44px row; wrap the checkboxes and
switch in a labelled container that owns the hit area.

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

## P2 — hardening and regression guards

### 10. Hover-only affordances have no touch equivalent

| File:line | Pattern |
|---|---|
| `src/components/ui/table.tsx:60` | `hover:bg-muted/50` row shading |
| `src/components/data-table/classes.ts:21` | `group-hover/row:bg-muted/50` on sticky cells |
| `src/app/landing/page.tsx:563,567,570` | `group-hover:opacity-100`, `group-hover:scale-110` |
| `src/app/help/page.tsx:55,61,63` | `group-hover:border-primary/40`, `group-hover:text-primary` |
| `src/app/track/[id]/components/timeline.tsx:201` | `hover:scale-105` |

All decorative — none is the sole affordance for an action, so none blocks a
task. Worth giving a focus/active equivalent only where the hover reveals a
meaningful state (the sticky-cell row shading is the one that matters).

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

1. **P0** — the rates matrix, the dialog grids, the table `nowrap`. These are the
   only places a phone user is actually blocked.
2. **P1** — the landing nav and the sort button; then the dropdown item height.
3. **P2** — add the mobile Playwright project early, so the P0 fixes get a
   regression guard while the context is fresh.

Everything in this file was verified against the tree at the commit it was
written from. Re-verify the `file:line` before acting.
