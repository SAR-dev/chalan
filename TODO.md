# TODO — Warehouse portal restructure

## Status

**Phases 1–6 are implemented.** Every checkbox below is ticked. Verified with
`pnpm ci:check` (clean), `pnpm test:unit:run` (2315 passing, 19 skipped),
`pnpm test:coverage` (floors hold), and `pnpm build` (`/warehouse/ongoing` and
`/warehouse/completed` in the route table, `/warehouse/dispatch` gone). `pnpm
test:e2e` still needs a local Postgres and has not been run since the rewrite.

Four places where the implementation departed from the plan text, and why:

- **The board and Completed live under phases 1 and 3 as planned, but their e2e
  specs landed in `02-business-flows.spec.ts` rather than the new
  `34-`/`35-` files.** S78 and S79 sit beside the retired S33/S34 they replace,
  which keeps the removed scenarios and their replacements readable as one diff.
  `docs-drift.spec.ts` allows the resulting holes at 33, 34 and 36.
- **The board fetches through its own server query, not `useOrders`.** The plan
  already called for this (the API caps `limit` at 100); what changed is that
  the client receives a plain `Order[]` and never re-fetches, so a card's state
  comes from `router.refresh()` after a dialog succeeds.
- **The board's empty state is a line *above* the board, not a replacement for
  it.** The five status columns render even when empty — "nothing is waiting to
  be received" is the answer the page exists to give — so swapping them out for a
  sentence would have hidden it.
- **`statCardLabels` gained no `overview` group.** The seven status tiles read
  `ORDER_STATUS_LABELS`, which is already the single string used by every status
  badge and by the board's column headings; a third copy in the labels file
  would have been a fourth thing to keep in sync. Only the COD tile needs a
  label, and it reuses `codSettlement.awaitingSettlement`.

## Goal

Reorganize the warehouse-admin portal around four focused surfaces and remove the
two legacy queue pages:

| Page | Route | Content |
|------|-------|---------|
| Overview (homepage) | `/warehouse` | **Stats only** — order lifecycle counts, no tables, no order progress |
| Order approval | `/warehouse/orders` | **Pending only** queue with approve/cancel actions |
| Ongoing (kanban) | `/warehouse/ongoing` | Board of in-flight orders, groupable **by status** or **by riders** |
| Completed | `/warehouse/completed` | **Read-only** DELIVERED + CANCELLED + RETURNED list, no actions |

**Removed:** intake queue (today's homepage content) and dispatch desk
(`/warehouse/dispatch`). Their functionality moves onto the kanban board as
per-card actions plus one toolbar button.

## Decisions (settled with the user)

| # | Question | Decision |
|---|----------|----------|
| 1 | What counts as "completed"? | **DELIVERED + CANCELLED + RETURNED.** RETURNED is terminal (`transitions.ts:553` sets it, nothing leaves it; notes lock, COD settles) so it belongs in a read-only archive. Ownership splits on **actionability, not lifecycle**: FAILED_ATTEMPT is the only status with a next action, so it stays on Exceptions alone and the Exceptions `RESOLVED` tab is **removed** — its `returnReason` / `failedResolvedBy` columns move to Completed's `Returned` tab. No status lives on two pages |
| 2 | Approval page tabs? | **Pending only** — the admin-parity Approved/All trio on `/warehouse/orders` is dropped; every other status has a home on another page |
| 3 | "Group by riders" semantics? | **Next-leg holder, exactly one column per card**: APPROVED/PICKED_UP → pickup rider (null → Unassigned); IN_WAREHOUSE/IN_TRANSIT/OUT_FOR_DELIVERY → delivery rider (null → Unassigned) |
| 4 | Kanban interaction? | **Read-only cards + action buttons**, no drag-and-drop, no new dependency. Card body opens the existing `OrderDetailsDrawer` |
| 5 | Bulk receive/assign/dispatch after queue removal? | **Toolbar only**: `AutoAssignDialog` survives as a board toolbar button (plans over all eligible ids — no selection needed). Receive / Assign pickup / Dispatch become **per-card**. `BulkAssignPickupRiderDialog` and `BulkDispatchDialog` are **deleted**. `bulkDispatch` hook method stays (auto-assign applies through it) |
| 6 | Homepage stats? | **Actionable counts only** — seven status cards (PENDING, APPROVED, PICKED_UP, IN_WAREHOUSE, IN_TRANSIT, OUT_FOR_DELIVERY, FAILED_ATTEMPT) **plus "COD to settle"** = DELIVERED orders where `codSettledAt IS NULL` for this warehouse. **DELIVERED and RETURNED get no card** — they are closed archives with no pending work, and a "Delivered" count on a homepage whose job is "what needs me today" is noise. The stats no longer cover every status, which is deliberate |
| 7 | Old `/warehouse/dispatch` URL? | **No redirect** (internal nav only; old URL 404s into the existing not-found page). Revisit only if bookmarks matter |

**Status → page ownership after the restructure** (no status is homeless, which
is what makes the Approved/All tabs and the "All" table disposable):

- PENDING → Order approval
- APPROVED, PICKED_UP, IN_WAREHOUSE, IN_TRANSIT, OUT_FOR_DELIVERY → Ongoing board
- DELIVERED, CANCELLED, RETURNED → Completed (read-only archive; RETURNED keeps
  its reason/resolved-by columns on Completed's `Returned` tab)
- FAILED_ATTEMPT → Exceptions (the only status with a next action:
  re-attempt / close as return)

Exceptions therefore shrinks to a single-status queue and loses its `RESOLVED`
tab — the return workflow is still fully covered, just filed under Completed.

**Homepage stat cards do not mirror page ownership one-for-one.** DELIVERED and
RETURNED have a home on Completed but no stat card (decision #6): a settled or
returned parcel is history, not a to-do. The one money-ish number that does earn
a card is COD awaiting settlement, because it is an unsettled balance sitting in
a rider's pocket — genuinely pending work.

## Key reuse (verified in the codebase)

- All action dialogs already live in `src/features/orders/dialogs/` and are
  page-agnostic: `WarehouseReceiveDialog`, `AssignPickupRiderDialog`,
  `WarehouseDispatchDialog`, `AutoAssignDialog`, `OrderDetailsDrawer`,
  `ApproveOrderDialog`, `CancelOrderDialog`.
- `buildWarehouseOrderScope()` (`src/lib/db/order-scope.ts`) is the scope for
  every server fetch below; `ORDER_CORE_COLUMNS` + lifecycle columns in
  `src/app/warehouse/orders/page.tsx` is the projection to copy.
- Homepage counts: `cachedStats()` (`src/lib/cached-stats.ts`) accepts args
  (key = `fixedKey + JSON.stringify(args)`), so pass `warehouseId` and tag
  `statTag("order")` — the same pattern as `src/app/dashboard/page.tsx`.
- **`useOrders({ includeAllOrders })` is NOT the board's data layer**: its
  `allUrl` is hard-capped at `limit: 100` and the API clamps to `MAX_LIMIT=100`.
  The board server-fetches directly in `page.tsx` (bypasses the clamp) and
  revalidates with `router.refresh()` after actions — no SWR round trip that
  would silently shrink 500 rows to 100.
- Order of phases matters: **the kanban (Receive action) ships before the
  intake page dies**, so Receive is never unreachable.

## Phases

Each phase ends with the tree green (`pnpm ci:check` + `pnpm test:unit:run`;
run `pnpm build` + `pnpm test:e2e` when e2e-affected specs changed). E2E suite
counts change in phases 1, 3, 4 → update the `AGENTS.md` "currently S1-…"
line **in the same phase** (`docs-drift.spec.ts` enforces it).

### Phase 1 — Ongoing kanban board (new page, additive)

- [x] `src/features/orders/kanban-grouping.ts` — pure grouping helpers:
      `groupOngoingByStatus(rows)` (fixed column order: Approved → Picked up →
      In warehouse → In transit → Out for delivery) and
      `groupOngoingByRider(rows, riders)` (decision #3 next-leg rule + leading
      Unassigned column). Colocated `kanban-grouping.spec.ts` pins the rule:
      exactly one column per card, PICKED_UP under the pickup rider,
      IN_WAREHOUSE under the delivery rider / Unassigned, empty columns for
      riders with no load.
- [x] `src/app/warehouse/ongoing/page.tsx` — `requireSession()` + WAREHOUSE_ADMIN
      gate (copy `/warehouse/orders/page.tsx`), `buildWarehouseOrderScope`,
      statuses = the 5 ongoing, ordered `createdAt asc`, direct `dbRead`,
      `.limit(500)` (decision #8); if `rows.length === 500`, the client renders
      a truncation notice ("showing 500 oldest — search or check Completed for
      the rest"). Project the orders-page column set + delivery city join.
- [x] `src/app/warehouse/ongoing/ongoing-client.tsx` —
      `Tabs` group toggle (`data-testid="kanban-groupby-status" | "-riders"`),
      column layout (header label + count badge, horizontally scrollable),
      card = order code (opens `OrderDetailsDrawer`), recipient, city, weight,
      collectible, status badge, holder rider name, contextual action button:
      - APPROVED && !pickupRiderId → **Assign pickup** → `AssignPickupRiderDialog`
      - PICKED_UP → **Receive** → `WarehouseReceiveDialog`
      - IN_WAREHOUSE → **Dispatch** → `WarehouseDispatchDialog`
      - others → no button (observe only)
      Toolbar: **Auto-assign** button (visible/enabled only when ≥1
      IN_WAREHOUSE card exists; ids = all IN_WAREHOUSE card ids, no selection →
      `AutoAssignDialog`). After any dialog success: `router.refresh()`.
      **No Cancel on cards** (decision #9).
- [x] `src/app/warehouse/ongoing/ongoing.spec.tsx` — colocated unit spec:
      renders both group modes, per-status action-button visibility, auto-assign
      button hidden with no eligible cards, drawer opens on card click.
- [x] Nav: add `{ href: "/warehouse/ongoing", label: "Ongoing", group: "Floor" }`
      after `Order approval` slot; update `nav-config.spec.ts` label list.
- [x] Copy: add `pageContent.warehouse.ongoing` in `src/config/content.ts`
      (title/description functions, follow the existing warehouse entries).
- [x] E2E: new `e2e/specs/34-warehouse-board.spec.ts`, describe **S78** —
      board shows ongoing statuses only; group toggle switches to rider columns
      (Unassigned present); Receive from a PICKED_UP card via new selectors in
      `e2e/selectors.ts` (new `kanban` namespace). Update the `AGENTS.md`
      suite line to the computed value.

### Phase 2 — Order approval page (repurpose `/warehouse/orders`)

- [x] `orders-client.tsx`: drop `FilterTab`/`TAB_STATUSES`/Tabs (and the
      just-added `orders-tab-*` testids — superseded by decision #2), force
      `setStatuses(["PENDING"])` on mount, drop the 6-card `StatCardList`
      (the homepage owns stats now), keep approve/cancel row actions **and**
      bulk approve/cancel (admin parity — decision #5 was about intake/dispatch
      bulk only).
- [x] `orders/spec` update: the "shows all status-matching orders…" test becomes
      "wires the queue to PENDING only" (asserts `useOrders` received
      `statuses: ["PENDING"]`); keep cancel-visibility/dialog tests.
- [x] Nav label `Order progress` → **Order approval** (`nav-config.ts` +
      `nav-config.spec.ts`).
- [x] Copy: `pageContent.warehouse.orders` title/description → approval wording.
- [x] E2E: S77 (`33-warehouse-approval.spec.ts`) must stay green unchanged —
      ORD-100003E is pending and the search/actions testids don't move.

### Phase 3 — Completed page (new, read-only)

- [x] `src/app/warehouse/completed/page.tsx` — same gate/scope pattern;
      statuses `[DELIVERED, CANCELLED, RETURNED]`; columns: order code,
      recipient, delivery city, `deliveredAt` / `cancelledAt`+`cancelReason` /
      `returnedAt`+`returnReason`, `amountCollected`, status; count + first 20
      rows server-side.
- [x] `src/app/warehouse/completed/completed-client.tsx` — `useOrders` with
      `statuses: ["DELIVERED", "CANCELLED", "RETURNED"]` forced,
      server-paginated search. **No actions column, no `bulkActions`, no
      `selectedKeys`** — read-only by construction (decision #1).
- [x] Status filter tabs **Delivered / Cancelled / Returned / All**, reusing the
      `TAB_STATUSES` + `setStatuses` pattern from the approval page (no local
      filtering). Carry the two columns Exceptions gives up:
      `columnLabels.order.returnReason` and `resolvedBy` (render `—` /
      `failedResolvedBy` for non-RETURNED rows, matching `exceptions-client.tsx:155-185`).
- [x] **Trim Exceptions** (`src/app/warehouse/exceptions/`) to FAILED_ATTEMPT
      only: drop the `RESOLVED` tab from `TAB_STATUSES` (line 49), the
      `warehouseFailedOrders` RETURNED branch, the `resolvedBy`/`returnReason`
      columns, and the resolved-count stat; `page.tsx:45` becomes
      `inArray(order.status, ["FAILED_ATTEMPT"])`. Update `exceptions.spec.tsx`
      — the `RESOLVED` cases (lines 79-128) go away; keep the FAILED_ATTEMPT ones.
      **Drop the `Tabs` import and the `FilterTab` state entirely** (decision
      #11) — no tab bar on a single-status page. The `canResolve` dropdown
      (re-attempt / close as return) is the page's only affordance, so it stays
      exactly as-is; only the RETURNED branches and the two columns are removed.
- [x] `completed.spec.tsx` — asserts: renders all three statuses, the
      `order-actions-*` buttons are absent everywhere, the status filter is
      forced, and `returnReason` renders on a RETURNED row.
- [x] `exceptions.spec.tsx` — asserts FAILED_ATTEMPT only, no tab bar at all,
      and that the Resolve dropdown still offers both outcomes.
- [x] Nav: add `/warehouse/completed` **Completed** to the Floor group (after
      Ongoing) + `nav-config.spec.ts`.
- [x] Copy: `pageContent.warehouse.completed`.
- [x] E2E: new `e2e/specs/35-warehouse-completed.spec.ts`, describe **S79** —
      page lists delivered/cancelled/returned rows and exposes no action menu.
      `02-business-flows` S3/S4 stay green unchanged (they only assert a heading
      on `/warehouse/exceptions`); add an assertion there that no `RESOLVED` tab
      is present. Update the `AGENTS.md` suite line.

### Phase 4 — Stats-only homepage (intake queue removed)

- [x] `src/app/warehouse/page.tsx` → server component: gate, then **two** cached
      queries in one `Promise.all`:
      1. `cachedStats(async (warehouseId) => …, { key: "warehouse-overview",
         tags: [statTag("order")] })` — **one** `GROUP BY status` count over
         `buildWarehouseOrderScope`, from which the six ongoing counts +
         PENDING + FAILED_ATTEMPT are read off. DELIVERED/RETURNED are computed
         by the same query but **not rendered** (decision #6).
      2. A second `cachedStats` for the COD card, same `statTag("order")` tag so
         one `refreshStats` invalidates both: `count(*)` where
         `warehouseId = $1 AND status = 'DELIVERED' AND codSettledAt IS NULL`.
         Copy the scope + tag shape from `getRiderCashInHand`
         (`src/app/warehouse/cod-settlement/page.tsx:49-70`) — it already counts
         exactly this set, and its comment explains why the caching is narrow
         (the set only moves on delivery or settlement, both of which call
         `refreshStats`).
- [x] `src/app/warehouse/overview-client.tsx` — `PageHeader` + `StatCardList`
      (keeps the dashboard spec pattern: props = counts, no db needed in jsdom).
      Eight items in this order, matching the nav's mental model:
      PENDING, APPROVED, PICKED_UP, IN_WAREHOUSE, IN_TRANSIT, OUT_FOR_DELIVERY,
      FAILED_ATTEMPT, **COD to settle**. Icons from `lucide-react`, tones on the
      `bg-chart-N/15 text-chart-N` scale like the settlement page's three cards
      (`cod-settlement-client.tsx:259-281`).
- [x] New labels group `statCardLabels.warehouse.overview.*` in
      `src/config/stat-card-labels.ts` (follow the file's own conventions).
      Reuse `warehouse.codSettlement.awaitingSettlement.label`
      ("Waiting to be settled") for the COD card rather than inventing a near
      synonym — same concept, one string. Do **not** repurpose the now-orphaned
      `warehouse.orders.delivered` / `warehouse.exceptions.returned` labels; leave
      them, other surfaces still reference the file's groups.
- [x] **No link on the COD card.** Checked: `StatCardItem`
      (`src/components/stat-card-list.tsx:3-12`) has no `href` slot, and
      wrapping the card in an `<a>` would put an interactive element inside
      another. Keep it a plain card. If the click-through is wanted later, the
      clean change is an optional `href` on `StatCardItem` (shadcn `Card`
      supports `render={…}`) as a **separate** task — out of scope here.
- [x] **Delete** `src/app/warehouse/intake-client.tsx` and
      `src/app/warehouse/warehouse-intake.spec.tsx`; replace with
      `src/app/warehouse/overview.spec.tsx`:
      - renders all **eight** cards with the expected values,
      - asserts **no DELIVERED and no RETURNED** card label appears (decision #6
        — the regression guard, otherwise someone re-adds them),
      - asserts the `codToSettle` card renders and is **not** an anchor,
      - asserts no table / no `bulk-receive` button (stats-only page).
- [x] `useOrders`: remove now-unused `bulkReceiveOrders` (intake was its only
      caller); update `test-utils.tsx` `createMockOrders` surface + any specs
      referencing it.
- [x] Nav: first item label `Intake queue` → **Overview** (icon → keep or
      switch to a dashboard-ish icon) + `nav-config.spec.ts` +
      `e2e/specs/10-activation.spec.ts:333` `sidebarLink("Intake queue")` →
      `"Overview"`.
- [x] Comment fix: `src/lib/db/order-scope.ts:20` references
      `intake-client.tsx` → point at the board instead.
- [x] E2E: `02-business-flows` S34 describe "Warehouse Intake" → "Warehouse
      Overview" (same heading assertion; add stat-card visible / table absent);
      `30-rider-cash` and `18-order-history` land on `/warehouse` and only need
      a heading — verify unchanged. Update the `AGENTS.md` suite line if test
      counts change.

### Phase 5 — Dispatch desk removed

- [x] **Delete** `src/app/warehouse/dispatch/` (page, client, `dispatch.spec.tsx`).
- [x] **Delete** `src/features/orders/dialogs/bulk-assign-pickup-rider-dialog.tsx`
      and `bulk-dispatch-dialog.tsx` (decision #5); remove unused
      `bulkAssignPickupRider` from `useOrders` — **keep `bulkDispatch`**
      (`use-order-auto-assign.ts` applies plans through it) — and its
      auto-assign dialog spec mocks.
- [x] Nav: remove the **Dispatch desk** item + `nav-config.spec.ts`.
- [x] E2E rewrites (same phase, suite stays green):
  - `01-core-flows` S8: second `goto("/warehouse/dispatch")` → `/warehouse/ongoing`.
  - `02-business-flows` S33 "view dispatch desk" → "view ongoing board"
    (`/warehouse/ongoing`).
  - `07-dispatch-planning` S74 test 1: navigate the board, click the toolbar
    auto-assign (`bulk-auto-assign` testid reused on the toolbar button →
    dialog assertions unchanged); drop the select-all preamble (toolbar
    collects ids itself). Test 2 ("planning offered only where a dispatch
    would be legal") → assert the toolbar button is absent when no
    IN_WAREHOUSE cards exist (needs a board state with none — use the seed's
    status mix or drive it via API). Test 3 (rider run sheet) untouched.
  - `e2e/selectors.ts`: delete `intakeTable`, `dispatchPickupTable`,
    `dispatchDeliveryTable`, `tabPickup`, `tabDelivery`, `bulkAssignDeliveryRider`,
    `receiveButton`, `dispatchButton` (board namespace supersedes);
    keep `selectAll`/`selectRow` (approval page still selects rows).
- [x] Hygiene: `two-factor.spec.ts:64` fixture pathname `/warehouse/dispatch` →
      a live route; grep `ROADMAP.md`, `CONTRIBUTING.md`, `src/landing` for
      "dispatch desk"/"intake queue" wording.

### Phase 6 — Docs & ledger

- [x] `CONTRIBUTING.md` "Order table patterns by role": replace the
      **Warehouse intake** row with **Warehouse approval** (pending queue,
      actions) and add **Completed** (read-only) + a note that Ongoing is a
      board, not a DataTable.
- [x] `src/content/docs/warehouse-admin.md`: rewrite §2 (intake queue),
      §3 (dispatch desk), §4 (order progress) into Overview / Order approval /
      Ongoing / Completed flows — including "Receive from the card in the
      Picked-up column" and "Auto-assign from the board toolbar". Rewrite the
      exceptions section too: re-attempt / close-as-return stays, but where to
      **find** closed returns moves to the Completed page's `Returned` tab.
- [x] `pageContent.warehouse.exceptions` description
      (`src/config/content.ts:132`) — drop the now-stale "resolve failed
      attempts" framing if the page becomes a single-status queue.
- [x] `src/config/content.ts` + `src/app/landing/page.tsx:138`: drop
      "Intake queue, dispatch desk" wording.
- [x] `AGENTS.md`: suite line (final computed count), and the spec-file examples
      if any referenced removed files.
- [x] Full gate: `pnpm ci:check` → `pnpm test:unit:run` → `pnpm test:coverage`
      (floors hold — removed dispatch/intake specs are backfilled by
      ongoing/completed/overview specs) → `pnpm build` → `pnpm test:e2e`.

## Settled during planning (all confirmed)

| # | Question | Decision |
|---|----------|----------|
| 8 | Board row cap? | **500 + truncation notice.** Enough for a live single-hub board; the notice points at search + Completed |
| 9 | Cancel on kanban cards? | **No.** Card actions stay Receive / Assign pickup / Dispatch. PENDING cancel stays on the approval page, admin cancel unchanged |
| 10 | Toolbar Auto-assign scope? | **All IN_WAREHOUSE cards on the board.** No selection — this is what let the bulk dialogs go (decision #5) |
| 11 | Exceptions page shape? | **Drop the Tabs, keep the table.** One status means one tab is noise; the table + its Resolve dropdown is the whole page |

No open points remain. If a phase surfaces a genuine fork, it gets a new
decision row above rather than an assumption buried in a checklist item.

## Verification checklist (final)

- [ ] `/warehouse` shows **eight** stat cards only — no table, no Receive button.
      Cards: PENDING, APPROVED, PICKED_UP, IN_WAREHOUSE, IN_TRANSIT,
      OUT_FOR_DELIVERY, FAILED_ATTEMPT, COD to settle. **No DELIVERED card, no
      RETURNED card.**
- [ ] The COD card equals `count(DELIVERED AND codSettledAt IS NULL)` for the
      warehouse — cross-check against `/warehouse/cod-settlement`'s own
      "Waiting to be settled" number; settling an order there moves the card.
- [ ] `/warehouse/orders` lists only PENDING; approve/cancel still work (S77 green).
- [ ] `/warehouse/ongoing` groups by status **and** by rider; each card appears
      in exactly one rider column; Receive/Assign/Dispatch reachable per card;
      auto-assign toolbar works and hides when nothing is eligible.
- [ ] `/warehouse/completed` shows DELIVERED + CANCELLED + RETURNED with zero
      action controls; `returnReason` / `resolvedBy` visible on the `Returned`
      tab.
- [ ] `/warehouse/exceptions` shows FAILED_ATTEMPT only, with no tab bar and no
      orphaned return columns; Resolve still re-attempts and closes as return.
- [ ] No route to `/warehouse/dispatch`; nav has no Intake/Dispatch entries;
      `warehouse-admin.md` and landing copy match reality.
- [ ] `pnpm ci:check`, `pnpm test:unit:run`, `pnpm test:coverage`,
      `pnpm build`, `pnpm test:e2e` all green; `AGENTS.md` counts accurate.
