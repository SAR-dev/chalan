# TODO

Working checklist for the **packages / prepaid wallet-bundle** feature.

---

## Goal

Merchants can browse packages, request a purchase, and pay **manually** (bKash /
bank transfer). An admin confirms the payment and the package (a prepaid
**bundle**) activates: it discounts the delivery fee and carries an order quota
that drains as the merchant ships.

---

## Decisions (locked)

- **Wallet = the existing `merchant_balance`.** No second balance table. Credit =
  negative balance, amount due = positive. Top-ups reuse the existing
  `PAYMENT_PENDING` → `PAYMENT_CONFIRMED` manual-confirmation flow
  (`src/app/api/merchants/[id]/balance/payment/route.ts`).
- **Guard scope = bundles-only for v1.** No global "block orders when credit is
  low". Postpaid billing stays as-is; bundles are the prepaid part.
- **Purchase = request → admin approval.** Merchant requests a package; admin
  confirms the manual transfer; approval activates the bundle.
- **Admin can still assign a package directly** (ops override / comped deals).
- **Bundles adjust the delivery fee only.** COD and cancellation fees are
  unchanged; no new ledger transaction types.

## Open questions — all resolved

- [x] `pricing_package` carries a **price** (`money`) — implemented in Phase 1.
- [x] An approved purchase writes a **`PAYMENT_CONFIRMED` credit** to
      `balance_transaction` (negative amount, `paymentMethod: "PACKAGE"`), so the
      wallet history shows the whole story and `merchant_balance.balance` still
      equals the sum of settled ledger rows.
- [x] The request **snapshots the price** into `package_purchase_request.amount`
      (migration **0009**), so a later `pricing_package.price` edit cannot change
      what an already-requested purchase is worth.
- [x] Bundles are **quota-only — no expiry**. A bundle stays active until its
      quota is used up or an admin ends it; no `expiresAt` column.
- [x] A merchant **cannot request while a bundle is active** (no renew/upgrade
      stacking). The current bundle must be exhausted or ended first. Approval
      still defensively deactivates any leftover active bundle.

---

## Phase 1 — Schema + migration

- [x] `src/lib/db/schema.postgres/packages.ts`:
  - `pricing_package` (id, name, description, price, isActive, timestamps)
  - `pricing_package_tier` (id, packageId, sortOrder, orderCount, ruleType,
    ruleValue)
  - `merchant_package` (id, merchantId, packageId, ordersUsed, startedAt,
    isActive, assignedBy) + partial unique index: one active per merchant
    (pattern: `finance.ts:90`)
  - `package_purchase_request` (id, merchantId, packageId, status, requestedAt,
    reviewedBy, reviewedAt, rejectReason) + partial unique: one PENDING per
    merchant
- [x] Add `packageRuleTypes = ["FLAT", "PERCENT_OFF"]` to `enums.ts`
- [x] Order snapshot columns (`orders.ts`): `packageId`, `packageTierId`,
      `merchantPackageId`, `packageRuleType`, `packageRuleValue`
      (FKs `onDelete: "set null"`)
- [x] Export from `schema.postgres/index.ts`
- [x] Migration **0008** (`pnpm db:generate` → `pnpm db:migrate`)

## Phase 2 — Rule engine

- [x] `src/lib/packages.ts` (pure, client-safe — no db import):
      `pickTierForCount`, `nextTierForCount`, `applyPackageRule`, `tierLabel`
- [x] `src/lib/order-pricing.ts`: `resolveMerchantPackageRule` +
      `lockAndResolveMerchantPackageRule` (`FOR UPDATE`), returning the active
      bundle (tier may be locked) so quota is tracked even before a discount
- [x] Unit tests: boundaries, exhaustion, FLAT, PERCENT_OFF, rounding

## Phase 3 — Order creation (single + bulk)

- [x] `src/app/api/orders/route.ts`: lock+resolve inside the tx, apply rule to
      the zone fee, snapshot the package columns, atomic `ordersUsed += 1` only
      on the non-conflict insert (a replayed idempotent key must not count)
- [x] `src/app/api/orders/bulk/route.ts`: lock once, resolve the tier **per
      order** against the cumulative count (`ordersUsed + index`) so a batch
      crossing a boundary is priced correctly; `ordersUsed += N`
- [x] Extend `orders.spec.ts` (bundle applied + snapshot + quota; no bundle →
      null package columns, zone fee untouched)

## Phase 4 — Settlement + quota refund

- [x] Extract shared `settleOrderFinancials()` (`transitions.ts`) — COD credit,
      pickup weight-delta, terminal fee settlement — used by both the single and
      bulk runners so they cannot drift
- [x] **Fixed known gap:** bulk cancel never settled anything. The bulk runner
      only wrote the status change, so it left the creation `ORDER_CHARGE` on the
      merchant's balance, never charged the cancellation fee, and never returned
      quota. `loadRefundOnCancelPolicy()` reads the toggle once per transaction
      instead of per order.
- [x] Refund quota on cancel/return via `GREATEST(ordersUsed - 1, 0)` on the
      snapshotted `merchantPackageId`
- [x] Specs: `bulk/cancel/cancel.spec.ts` covers the reversal, the post-pickup
      cancellation fee, quota refund, and the no-package case

## Phase 5 — Pickup re-price

- [x] `src/features/orders/transitions.ts` (`picked-up` → `buildUpdate`): re-apply
      the **snapshotted** `packageRuleType`/`packageRuleValue` to the recomputed
      zone fee. A FLAT rule is weight-independent, so a rider weight correction
      under a flat bundle now yields **no** delivery-fee delta — same as at
      creation. Previously a weight correction re-priced at the full zone fee and
      charged the merchant the difference, silently undoing the bundle.
- [x] Spec: weight 2 → 3 KG under `FLAT 50` keeps `deliveryFee: 50` and writes no
      `ORDER_CHARGE` delta

## Phase 6 — Purchase request + wallet

- [x] `package_purchase_request.amount` price snapshot — migration **0009**
- [x] API `POST /api/packages/[id]/request` (merchant) — creates a PENDING request
      with the price snapshotted; 409 when a request is already awaiting review,
      409 when a bundle is already active, 400 when the package is inactive
- [x] API `PATCH /api/admin/package-requests/[id]` (SUPER_ADMIN) — approve/reject
      on a discriminated-union body; the request row is locked `.for("update")`
      so two admins cannot both act on it
- [x] Approve: deactivate any leftover active bundle, insert a fresh
      `merchant_package` (`ordersUsed = 0`), mark APPROVED, and credit the wallet
      with a `PAYMENT_CONFIRMED` row
- [x] Reject: store the reason, no ledger row
- [x] No global order-blocking (bundles-only)
- [x] Specs: `packages/[id]/request/request.spec.ts` (11) +
      `admin/package-requests/[id]/package-requests.spec.ts` (11)

### Phase 6b — Wallet / Top-ups tab + request top-up

Top-up history already exists in the append-only `balance_transaction` ledger
(`type` `PAYMENT_PENDING` → `PAYMENT_CONFIRMED`, or `REJECTED` with a reason),
returned by `GET /api/merchants/[id]/balance` (`balance/route.ts`). Reusing
`merchant_balance` keeps it — this phase is UI + submission, not new storage.

- [ ] Merchant finance page: **Wallet / Top-ups tab** — filter the existing
      transaction feed to payment rows (`PAYMENT_PENDING` / `PAYMENT_CONFIRMED`
      / rejected), columns: date, amount, method, account, note, status,
      reviewedBy
- [ ] Merchant finance page: show **Available credit** (`-min(balance, 0)`) and
      **Awaiting confirmation** (`pendingBalance`)
- [ ] **Request top-up** dialog (amount, method, account, note) → reuses
      `POST /api/merchants/[id]/balance/payment` (manual transfer; one PENDING
      at a time)
- [ ] Show pending top-up state + the rejection reason when declined
- [ ] Admin: pending top-up review queue on the merchant balance page (confirm /
      reject already implemented: `balance/payment/[txId]/confirm|reject`)
- [ ] Reuse the same top-up flow to fund package purchases (link from the
      Packages page / purchase dialog)

## Phase 7 — Admin UI

- [x] `/dashboard/packages`: list + create/edit dialog with repeatable **tier
      editor** (validate: `orderCount > 0`, strictly increasing cumulative,
      `PERCENT_OFF` 0–100)
- [x] Requests queue (tab on the packages page) — approve inline, reject opens
      `RejectRequestDialog` with a required reason
- [x] Delete package: `DELETE /api/packages/[id]` is archive-if-referenced
      (`merchant_package` / `package_purchase_request` are `restrict` FKs), so a
      bought package is hidden from the catalogue while the ledger and snapshots
      survive; an untouched one is removed outright
- [ ] Assign-package action on the merchant row/detail (reuse action-menu
      pattern; `ConfirmDialog`)
- [x] Nav: add "Packages" to `SUPER_ADMIN_SIDEBAR` (`nav-config.ts`)

## Phase 8 — Merchant UI

- [x] Rebuild `/merchant/pricing`:
  - [x] assigned bundle card (quota progress + next tier)
  - [ ] calculator (reuse `DeliveryFeeCalculator`)
  - [ ] zone rate card matrix
  - [x] available packages catalogue + **Request purchase**
        (blocks only on an active bundle or a **PENDING** request — a settled
        request is history, not a lock)
- [ ] `DeliveryFeeCalculator` — add optional `packageRule` prop
- [ ] `quoteParcel()` (`features/orders/quote-parcel.ts`) — add optional
      `packageRule` so the order-form preview matches the charge

## Phase 9 — Seeds + tests

- [x] Seed a demo package + assignment (`seed/packages.ts`, wired into
      `index-full.ts` and `basic.ts`; `clean.ts` truncates the package tables)
      — 3 packages / 8 tiers, merchant1 mid-bundle, merchant2 pending request
- [x] API specs (colocated `<resource>.spec.ts`) — packages root/tier/request,
      admin review queue, delete + patch
- [ ] Integration: partial unique indexes, snapshot FK `set null`
- [ ] E2E (next serial **S58**): request → approve → fee adjusted → cancel
      refunds quota; bulk create spanning a boundary
- [ ] Keep coverage floors (48/41/37/49); raise after

---

## Definition of done

- [ ] `pnpm ci:check`, `pnpm test:coverage`, `pnpm build`, `pnpm test:e2e` green
- [ ] Ledger reconciliation invariant still holds with a bundle applied
- [ ] Concurrency test: two creates at a tier boundary
- [ ] No change to ledger transaction types
