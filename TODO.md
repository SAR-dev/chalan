# TODO — "Out for Pickup" order status

## Status

**Plan only. Nothing is implemented.** Every box below is unchecked on purpose.

Written after reading the code, so file references are real. Line numbers are
approximate — they were read from `17a5007`.

## Goal

Add a new order status **`OUT_FOR_PICKUP`** that behaves exactly like
`OUT_FOR_DELIVERY`, but on the collection leg:

```
Assigned (APPROVED) → OUT FOR PICKUP → Picked up → [received → dispatched →
in transit] → Out for delivery → Delivered
```

### Rules

1. The rider must click **"Out for pickup"** before they can start the pickup.
2. The `picked-up` transition is **blocked until the status is
   `OUT_FOR_PICKUP`** — not before.

Today `picked-up` guards on `status === "APPROVED"`
(`transitions.ts:330`), which is exactly what changes.

## Open decisions — confirm before Phase A

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | New `outForPickupAt` timestamp column? | **Yes.** Mirrors `outForDeliveryAt`, which the tracking timeline and `ORDER_DIFF_FIELDS` both read. Needs `pnpm db:generate` + `pnpm db:push`, and the e2e DB (`db:push:e2e`) / CI's Postgres must be re-pushed before tests run. |
| 2 | A stat card on `/warehouse`? | **Yes.** The restructure's decision #6 is "actionable counts only", and a parcel nobody has collected is actionable. That makes **9 cards** (8 statuses + COD), replacing the documented "eight" in `overview.spec.tsx` and e2e **S8**. |
| 3 | Cancel while `OUT_FOR_PICKUP`? | **No** for merchants — consistent with `OUT_FOR_DELIVERY`, which the cancel guard already refuses. Confirm warehouse/admin cancel behaves the same. |
| 4 | Reassign the pickup rider while out for pickup? | **No.** `assign-pickup-rider` stays `APPROVED`-only, mirroring how the delivery legs lock in. |
| 5 | Badge tone | `BADGE_TONES` keys are reused per status; `info` = APPROVED and `violet` = PICKED_UP, so pick a free key that reads "moving toward collection". |
| 6 | Seed distribution | `ORDER_SEED_STATUSES` (`seed-content/orders.ts:17-34`) must gain the status, which **changes seeded lane counts** and therefore S78, S8 and `18-order-history` expectations. |

## The `OUT_FOR_DELIVERY` pattern to copy

| Concern | Where it lives today |
|---|---|
| Status list | `lib/db/schema.postgres/enums.ts:77` — `orderStatuses` (a TS const; the column is `text(...)`, so the value itself needs no DDL, but confirm no CHECK constraint in `drizzle/`) |
| Timestamp column | `lib/db/schema.postgres/orders.ts:177` — `outForDeliveryAt` |
| Transition | `features/orders/transitions.ts:427` — `"out-for-delivery"` (guard on `IN_TRANSIT` + `deliveryRiderId`) |
| Transition labels | `transitions.ts:696` `TRANSITION_LABELS`, `transitions.ts:664` `ORDER_DIFF_FIELDS` |
| API route | `app/api/orders/[id]/out-for-delivery/route.ts` — one line, `applyOrderTransition(...)` |
| Hook method | `features/orders/hooks/use-orders.ts:324` |
| Validation | none — `out-for-delivery` has no body schema; `picked-up` uses `orderPickedUpSchema` |
| Label + tone | `lib/constants.ts:68` `ORDER_STATUS_LABELS`, `:81` `ORDER_STATUS_TONES` (both `Record<OrderStatus, …>` → **tsc lists every site that must be updated**) |
| Badge | `features/orders/components/order-status-badge.tsx` — derives from the two maps, no edit needed |
| Timeline | `lib/order-timeline.ts:37` `STATUS_RANK`, `:108` step timestamp; `features/orders/components/tracking-timeline.tsx:79,98-99` |
| Rider action | `app/rider/page.tsx:113,273` (`canStart` / `canRecord`), `OutForDeliveryDialog` + `app/rider/pickup/page.tsx:171` (`canPickup`) |

Three `Record<OrderStatus, …>` maps — `ORDER_STATUS_LABELS`,
`ORDER_STATUS_TONES`, `STATUS_RANK` — make `tsc --noEmit` an exhaustive
checklist of what the type change breaks. **Phase C is complete when `tsc` is
clean with no `any`.**

## Why `/warehouse/ongoing` must change

The status is pre-collection and in-flight, so a parcel in it belongs on the
board. If it is not added there, the moment a rider taps "Out for pickup" the
parcel vanishes from every warehouse surface.

- `features/orders/kanban-grouping.ts:26` — `ONGOING_STATUSES` gains
  `OUT_FOR_PICKUP` (after `APPROVED`, before `PICKED_UP`, matching flow order)
  and `ONGOING_STATUS_LABELS:37` gains `"Out for pickup"`.
- **`nextLegRiderId` (`kanban-grouping.ts:70`) must gain a
  `case "OUT_FOR_PICKUP"` returning `order.pickupRiderId`.** Miss this and the
  parcel drops into the *Unassigned* column even though a rider is holding it —
  a silent, easy-to-miss regression.
- Card actions (`ongoing-client.tsx`): `APPROVED` keeps *Assign pickup*
  (enabled / disabled-per-`Pickup Assigned`); `OUT_FOR_PICKUP` gets **no
  button** — the rider acts, the warehouse observes. That matches the existing
  "others → observe only" rule.
- Unit specs currently pin **5** lanes: `ongoing.spec.tsx` asserts the exact
  column list, `kanban-grouping.spec.ts` asserts `columns.map(c => c.id)` deep-
  equals `ONGOING_STATUSES`. Both become 6.

## Phases

### Phase A — enum, schema, migration
- [ ] `enums.ts` — add `"OUT_FOR_PICKUP"` to `orderStatuses`.
- [ ] `orders.ts` schema — add `outForPickupAt: ts("outForPickupAt")`.
- [ ] `pnpm db:generate` then `pnpm db:push`; re-push the e2e DB.
- [ ] `app/api/orders/[id]/route.ts:60` — project the new field.
- [ ] `app/__tests__/test-utils.tsx` — `makeOrder` default `outForPickupAt: null`.

### Phase B — transition + API
- [ ] New `"out-for-pickup"` transition in `transitions.ts`, modelled on
      `"out-for-delivery"`: `authorize` RIDER, `guard` =
      `pickupRiderId === session.riderId` (403) **and** `status === "APPROVED"`
      (400), `buildUpdate` = `{ status: "OUT_FOR_PICKUP", outForPickupAt: now }`.
      No schema (no body), same as `out-for-delivery`.
- [ ] `picked-up` guard (`transitions.ts:330`) — `APPROVED` → `OUT_FOR_PICKUP`,
      and the error message must say so. **This is rule 2.**
- [ ] `ORDER_DIFF_FIELDS` += `outForPickupAt`; `TRANSITION_LABELS` +=
      `"out-for-pickup": "Marked out for pickup"`.
- [ ] Audit the other guards that assume `APPROVED` is the pre-pickup state:
      `assign-pickup-rider` (decision #4), `cancel` (decision #3), and any
      admin/warehouse bulk action that whitelists statuses.
- [ ] New `app/api/orders/[id]/out-for-pickup/route.ts`.
- [ ] `use-orders.ts` — add `outForPickup(orderId)` beside `outForDelivery`.
- [ ] `transitions.spec.ts` — new describe for `out-for-pickup` (happy path,
      not-yours 403, not-APPROVED 400) **plus** a regression test that
      `picked-up` now 400s while `APPROVED` and succeeds at `OUT_FOR_PICKUP`.

### Phase C — labels, timeline, badge
- [ ] `constants.ts` — `ORDER_STATUS_LABELS` + `ORDER_STATUS_TONES`.
- [ ] `order-timeline.ts` — `STATUS_RANK` rank + a step with
      `outForPickupAt`; `tracking-timeline.tsx` — `stepDetails.OUT_FOR_PICKUP`
      and check the `showFailedAfter` / `showReturnedAfter` branch keys.
- [ ] `constants.spec.ts`, `order-timeline.spec.ts` — update counts.
- [ ] `tsc --noEmit` clean.

### Phase D — rider UI
- [ ] New `features/orders/dialogs/out-for-pickup-dialog.tsx`, cloned from
      `out-for-delivery-dialog.tsx`.
- [ ] `app/rider/page.tsx`:
  - `toPickup` (`:111`) — `APPROVED` only → `APPROVED || OUT_FOR_PICKUP`
    (both mean "not collected yet"), or the parcel disappears from the queue.
  - `canStartPickup = status === "APPROVED"` → the "Out for pickup" button.
  - pickup-confirm gate → `status === "OUT_FOR_PICKUP"` (**rule 1**).
- [ ] `app/rider/pickup/page.tsx:171` — same two changes to `canPickup`.
- [ ] `rider.spec.tsx`, `pickup.spec.tsx`, `delivery.spec.tsx` — assert the
      new gating both ways (button present at APPROVED, pickup hidden; button
      gone at OUT_FOR_PICKUP, pickup shown).

### Phase E — `/warehouse/ongoing` + overview
- [ ] `kanban-grouping.ts` — statuses, labels, **`nextLegRiderId`**.
- [ ] `ongoing-client.tsx` — no action button for the new status.
- [ ] `kanban-grouping.spec.ts`, `ongoing.spec.tsx` — 5 lanes → 6.
- [ ] `warehouse/page.tsx:26` + `overview-client.tsx:48` — add the tile
      (decision #2); `overview.spec.tsx` eight cards → nine, and re-check the
      "no DELIVERED / no RETURNED card" assertions still hold.

### Phase F — remaining status lists + seed
Audit every place `OUT_FOR_DELIVERY` is one entry of a status list — add the
new status where it belongs, leave it alone where it does not:
- [ ] `app/api/orders/summary/route.ts:28`
- [ ] `app/merchant/orders/page.tsx:33,46,97` (tabs / stat lists)
- [ ] `app/merchant/page.tsx:62`
- [ ] `app/api/orders/auto-assign/route.ts:17` `ACTIVE_DELIVERY_STATUSES` —
      **delivery-side; probably no change.** Confirm rather than assume.
- [ ] `seed-content/orders.ts` — `ORDER_SEED_STATUSES` union + distribution +
      the lifecycle-timestamp block (`:257-268`) + `outForPickupAt`.

### Phase G — e2e, docs, gate
- [ ] e2e **S80** (below) in `02-business-flows.spec.ts` beside S78/S79.
- [ ] Update S78's five-lane list to six; update S8 if decision #2 lands.
- [ ] `AGENTS.md` suite line (`docs-drift.spec.ts` enforces it — currently
      `S1-S79 across 35 files / 144 tests`).
- [ ] Docs: `src/content/docs/warehouse-admin.md`, `CONTRIBUTING.md:285`
      (transition list), the status→page ownership tables.
- [ ] Full gate: `ci:check` → `tsc` → `test:unit:run` → `test:coverage` →
      `build` → `test:e2e`.

## E2E tests

**S80. "Rider goes out for pickup before collecting"** — the flow the feature
exists for:

1. Log in as the seeded rider, land on the pickup queue.
2. An `APPROVED` parcel shows **Out for pickup** and does **not** offer
   pickup confirmation.
3. Call `PATCH /api/orders/:id/picked-up` directly → **400**, and the message
   names the required status. This is the guard, asserted at the API because
   the UI simply hides the control (a hidden button proves nothing about rule 2).
4. Click **Out for pickup** → toast → status becomes `OUT_FOR_PICKUP`.
5. Pickup confirmation is now offered → confirm → status `PICKED_UP`.
6. Assert `/warehouse/ongoing` shows a sixth lane **Out for pickup** holding
   that parcel (covers the `nextLegRiderId` rule).

Existing tests expected to need edits: **S78** (lanes), **S8** (cards),
`18-order-history.spec.ts` (drives `OUT_FOR_DELIVERY` through SQL), plus any
spec asserting seeded status counts.

## Verification checklist

- [ ] Flow is `APPROVED → OUT_FOR_PICKUP → PICKED_UP → … → OUT_FOR_DELIVERY →
      DELIVERED`, and nothing else reaches `PICKED_UP`.
- [ ] `picked-up` returns 400 while `APPROVED` (rule 2, API-level).
- [ ] Rider sees "Out for pickup" only while `APPROVED`, and only for their own
      parcel (403 otherwise).
- [ ] `/warehouse/ongoing` has six lanes; an `OUT_FOR_PICKUP` parcel sits under
      **its pickup rider**, never Unassigned.
- [ ] Overview count + badge + timeline all show the new status.
- [ ] e2e DB re-pushed before the suite runs; `pnpm test:e2e` green.
- [ ] Full gate green, `AGENTS.md` counts accurate.
