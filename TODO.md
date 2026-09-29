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
- **Price is snapshotted onto the request** in `package_purchase_request.amount`
  (migration **0009**), so editing `pricing_package.price` later cannot change
  what an already-requested purchase is worth. Approval credits the wallet with a
  `PAYMENT_CONFIRMED` row (`paymentMethod: "PACKAGE"`).
- **Bundles are quota-only — no expiry.** A bundle stays active until its quota
  is used up or an admin ends it; no `expiresAt` column.
- **No stacking while active, one request at a time.** A merchant cannot request
  while a bundle is active or another request is `PENDING` (a settled request is
  history, not a lock). Approval defensively deactivates any leftover bundle.

---

## Phase 6b — Wallet / Top-ups tab + request top-up

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

- [ ] Assign-package action on the merchant row/detail (reuse action-menu
      pattern; `ConfirmDialog`)

## Phase 8 — Merchant UI

- Rebuild `/merchant/pricing`:
  - [ ] calculator (reuse `DeliveryFeeCalculator`)
  - [ ] zone rate card matrix
- [ ] `DeliveryFeeCalculator` — add optional `packageRule` prop
- [ ] `quoteParcel()` (`features/orders/quote-parcel.ts`) — add optional
      `packageRule` so the order-form preview matches the charge

## Phase 9 — Tests

- [ ] Integration: partial unique indexes, snapshot FK `set null`
- [ ] E2E (next serial **S61**): cancel/return refunds quota; bulk create
      spanning a tier boundary. S58–S60 already cover admin CRUD, request →
      approve → active bundle, rejection not locking the merchant out, and
      quota / next-tier progress
- [ ] Keep coverage floors (48/41/37/49); raise after

---

## Definition of done

- [ ] Ledger reconciliation invariant still holds with a bundle applied
- [ ] Concurrency test: two creates at a tier boundary
- [ ] No change to ledger transaction types
