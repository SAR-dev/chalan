# ROADMAP — Business Logic, Product & Growth

> Forward-looking only. Completed work is tracked in git history, not here.
>
> **Health:** `pnpm ci:check` green · Unit **1661 pass / 8 skip** · Build green ·
> E2E **89/89** (21 spec files, S1–S55; next serial **S56**) · real-DB
> integration suite 8/8 in CI · coverage gate enforced (statements 48 /
> branches 41 / functions 37 / lines 49; measured **50.04 / 43.40 / 39.43 /
> 50.75**) · route-auth-guard test enforces server-side auth on all API routes.
>
> **Every change verifies with:** `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` when DB invariants
> move).

---

# Business-logic review (team-lead audit)

Problems found in the money/ops paths, worst first. Each has the current
behaviour, the risk, and a proposed fix. Nothing here is implemented yet.

## P0 — money correctness & cash risk

### B1. Payouts are not capped at the merchant's available credit
- **Now:** `POST /api/payouts` (`src/app/api/payouts/route.ts:206`) links every
  settled `DELIVERED` order and pays `sum(order.merchantEarnings)`. It never nets
  the merchant's overall balance, which can be positive (they owe) from cancelled
  orders, COD fees, or shortfalls. `settlePayoutAsPaid`
  (`src/lib/payout-settlement.ts:40`) also does no balance check.
- **Risk:** the platform pays out cash while the merchant carries outstanding
  debt; recovery is a manual afterthought.
- **Fix:** inside the payout transaction, cap the request at
  `available = max(0, -merchant_balance.balance)`; refuse or partially link when
  the balance is not in credit, and re-check at settlement.

### B2. Partial COD collection cannot be recorded
- **Now:** `orderDeliveredSchema` accepts only `proofRef`; the `delivered`
  transition hardcodes `amountCollected: o.productCost`
  (`src/features/orders/transitions.ts:295`) and credits the full `productCost`
  (`transitions.ts:579`).
- **Risk:** a rider who collects less (or nothing) still credits the merchant the
  full COD; the platform silently absorbs the difference.
- **Fix:** accept `amountCollected` (0…`productCost`) in the delivered body,
  credit that amount, recompute/store earnings from it, and require a shortfall
  reason when it is below the expected COD.

### B3. No rider cash-in-hand / handover ledger
- **Now:** COD is credited to the merchant at delivery
  (`transitions.ts:579`); `settle-cod` (`transitions.ts:382`) only stamps
  `codSettledAt`. There is no record of the cash a rider is holding.
- **Risk:** if a rider never hands over collected cash, the merchant is already
  credited and there is no reconciliation trail.
- **Fix:** add a rider cash-in-hand ledger and a warehouse handover step that
  must clear before `settle-cod` counts.

### B4. Cancelled orders keep the full delivery + COD fee
- **Now:** the `cancel` transition (`transitions.ts:408`) writes no ledger row,
  so the creation `ORDER_CHARGE` stands. Cancel is allowed up to `IN_TRANSIT`.
- **Risk:** a merchant is charged the full delivery fee for a parcel the platform
  never delivered, plus a COD fee for a collection that never happened.
- **Fix:** give `cancel` a fee policy mirroring returns — reverse the charge and
  apply a per-zone cancellation fee (or a reduced fee), and distinguish
  pre-pickup vs post-pickup cancels.

### B5. `cancellationFee` backfill: in-flight orders default to 0
- **Now:** migration `0003` adds `order.cancellationFee DEFAULT 0`, so every order
  created before it — including live `FAILED_ATTEMPT` parcels — snapshots `0`.
- **Risk:** returning one of those orders refunds the full delivery + COD fees and
  charges nothing: a retroactive policy hole.
- **Fix:** backfill non-terminal orders from the zone pair /
  `platform_config.defaultCancellationFee` in the migration (or a one-off script)
  and document the cutover.

## P1 — policy & consistency

### B6. Inconsistent pricing fallback (delivery vs cancellation)
- **Now:** with no zone-pair row, delivery falls back to the merchant's flat
  rates (`src/app/api/orders/route.ts:300`) while the cancellation fee falls back
  to `platform_config.defaultCancellationFee`.
- **Risk:** an unconfigured pair silently uses merchant rates (possibly `0`) for
  delivery but a platform fee for cancellation — hard to reason about, easy to
  misprice.
- **Fix:** pick one source. Either require a zone-pair row (reject with a clear
  error) or fall back to platform defaults for both. Never mix.

### B7. `merchantEarnings` is clamped at 0, hiding losses
- **Now:** `calcMerchantEarnings` (`src/lib/pricing.ts:66`) returns
  `max(0, productCost - deliveryFee - codFee)`; the order stores that and payouts
  sum it, while the ledger still charges the full fees.
- **Risk:** for low-COD parcels the merchant is net-negative but `merchantEarnings`
  reads `0`; payouts and reports understate what they owe.
- **Fix:** store the true signed net (or a separate `merchantShortfall`) and treat
  the ledger balance as the payout source of truth.

### B8. Suspending a merchant leaves in-flight orders running
- **Now:** `canPlaceOrders` (`src/lib/merchant-verification.ts`) only blocks *new*
  orders.
- **Risk:** suspended merchants' parcels keep moving and COD keeps being credited;
  support has no way to stop them.
- **Fix:** on suspend, block further forward transitions (allow only
  return/cancel) and surface an in-flight count in the suspend dialog.

### B9. No aging/timeout for stuck orders
- **Now:** orders can sit in `PENDING`, `FAILED_ATTEMPT`, or `IN_WAREHOUSE`
  indefinitely; nothing ages them.
- **Risk:** fees stay charged, failed parcels are never returned, merchants can't
  reconcile.
- **Fix:** add SLA/aging queries plus a cron that flags stale states (e.g.
  `FAILED_ATTEMPT` older than N days → return reminder, `PENDING` older than N
  days → approve/cancel nudge).

### B10. COD fee is charged before collection and never refunded on cancel
- **Now:** `codFee` is part of the creation `ORDER_CHARGE`; only returns refund it.
- **Risk:** cancelled orders are charged a collection fee for a collection that
  never happened.
- **Fix:** fold the COD fee into the same cancel/return policy (refund whenever no
  collection occurred).

### B11. Public tracking is enumerable via sequential order codes
- **Now:** `/track/[id]` accepts the sequential `ORD-…` code
  (`src/app/track/[id]/lib.ts`) and shows merchant, weight, COD amount, area,
  first name and masked phone; `generateMetadata` puts the status in the title.
- **Risk:** anyone can enumerate codes to scrape order volumes/COD and partial
  PII.
- **Fix:** rate-limit and throttle code lookups, minimise the code-only view
  (status + area only), keep full detail behind the tracking token, and stop
  leaking status into metadata for code lookups.

## P2 — clarity & robustness

### B12. Return reversal reuses `ORDER_CHARGE` with a negative amount
- **Now:** `ORDER_CHARGE` carries both the creation charge and its reversal.
- **Risk:** reports/filters that assume `ORDER_CHARGE > 0` mis-read it; a negative
  "Order Charge" is confusing in the ledger UI.
- **Fix:** add an explicit `ORDER_CHARGE_REVERSAL` type (or label negative rows)
  and update reports/exports.

### B13. No idempotency on order creation
- **Now:** `POST /api/orders` has no idempotency key.
- **Risk:** a retried request (double submit, network retry) creates duplicate
  orders and double charges.
- **Fix:** accept an `Idempotency-Key` header, persist it, and return the existing
  order on replay.

### B14. Calculator omits the cancellation policy
- **Now:** the landing calculator (`src/components/delivery-fee-calculator.tsx`)
  shows delivery fees; cancellation fees appear only on `/rates`.
- **Risk:** merchants don't see the cost of a return up front.
- **Fix:** surface the per-route cancellation fee in the calculator estimate/notes.

---

# Product & growth

## P4.1 Notification system (deferred — design kept)

In-app notifications for state changes (per-user, per-event), fanned out **in the
same transaction** as the triggering change via a `src/lib/notify.ts` helper
mirroring `audit.ts`; bell + unread badge in all four shells; `GET
/api/notifications`, `PATCH /api/notifications/[id]`, `PATCH
/api/notifications/read-all`. Email channel in v2 (reuses the email outbox).

**Acceptance:** fan-out unit tests (event → recipients) + API specs + e2e
(merchant gets an order-status notification and marks it read).

## P4.2 Quick wins

Subscription/pricing display on the merchant dashboard; help-center polish (FAQ
deep links from order/support screens).

## P4.3 Growth backlog

| Area | Tasks |
|------|-------|
| Analytics & reporting | Merchant comparison, PDF/Excel export, scheduled reports, rider performance |
| Mobile | PWA/offline + push, mobile-optimized order form, camera capture, GPS tracking |
| API & integrations | Accounting export (Tally/QuickBooks), SMS gateway, WhatsApp updates |
| Scalability | Redis for hot data, CDN, background jobs, multi-instance, promote the `dbRead` split to real replicas, query consolidation |
| Phase 6 backlog | Public API docs (OpenAPI), video tutorials, status page |

## Carry-over (open, lower priority)

- **`next/image` for uploads** — deliberately deferred. Nothing uses it today
  (uploads render through plain `<img>` in `image-zoom.tsx` /
  `image-upload.tsx`), so `images.unoptimized` in `next.config.mjs` is inert and
  documented as such. Payload is handled at upload time (client downscale to
  `UPLOAD_MAX_DIMENSIONS` + a 5 MB API cap). Converting needs `remotePatterns`
  for R2.
- **Keyset pagination** — hot lists are bounded by a `MAX_OFFSET` (100k) clamp
  instead. Real keyset was rejected because `DataTable` is page-number + total
  based; revisit only if it becomes an infinite-scroll feed.
- **Raise the coverage floors** as tests land. They are a regression guard
  (48 / 41 / 37 / 49), not a target.

---

# Guardrails — verified-clean areas (don't regress these)

- **Uploads**: content-type/size/folder allowlists + traversal defense
  (`uploads/route.ts`, `uploads/[...path]/route.ts`), owner-or-admin read policy
  with `Cache-Control: private` for private folders, and Content-Length
  enforced *before* parsing.
- **Order state machine**: every transition goes through
  `applyOrderTransition`/the bulk runner with per-transition guards and a row
  lock (`src/features/orders/transitions.ts`).
- **IDOR**: ownership scoping verified in `orders/[id]`, `payouts`,
  `merchants/[id]/*`, `riders/[id]`, `warehouses/[id]`, `pickup-locations/[id]`,
  team, moderators, support.
- **Admin surface**: write sites gated to SUPER_ADMIN (or role-appropriate) —
  the route-auth-guard test makes this a *static* guarantee.
- **Public tracking**: only a secretless PII-free receiver note is writable, and
  it requires the per-order tracking token; reads by the sequential code stay
  allowed for the parcel-label UX (see B11 for the hardening follow-up).
- **Session policy**: `requireSession()` enforces banned users, admin 2FA
  enrolment and merchant email verification server-side — not just via browser
  redirects.
- **No `dangerouslySetInnerHTML`** anywhere; markdown rendered without
  `rehype-raw`; all `sql`` templates parameterized.
- **Secrets**: `.env*` gitignored; `validateEnv()` enforces a ≥32-char auth
  secret and production SMTP key; SMTP password AES-256-GCM encrypted; merchant
  verification tokens stored hashed; console logs carry no live tokens.
- **Money**: all money columns are `numeric(14,2)`; `merchant_balance` must
  always equal the sum of its SETTLED ledger rows (asserted in tests as an exact
  SQL `=`, not a float tolerance). Return settlement writes a negative
  `ORDER_CHARGE` reversal + a positive `ORDER_CANCELLATION` row
  (`src/lib/balance-ledger.ts` worked examples).
- **Logging**: `logger` (never `console.*`) on the request/error path, and
  `x-request-id` on every response for correlation.
- **Spec coverage**: 1661 unit + 89 e2e — keep new routes/branches covered
  (colocated `<resource>.spec.ts`; e2e `S<n>` serial, next is **S56**).
